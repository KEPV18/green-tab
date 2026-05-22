import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const WFM_BASE_URL = "https://wfm.tabby.ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { cf_token, wfm_session, wfm_csrf, user_id } = await req.json();

    // Determine which auth method to use
    let authCookie = "";
    let csrfToken = "";

    if (cf_token) {
      // Method 1: CF_Authorization (original method)
      authCookie = `CF_Authorization=${cf_token}`;
    } else if (wfm_session) {
      // Method 2: wfm_session + wfm_csrf (alternative method for company laptops)
      authCookie = `wfm_session=${wfm_session}`;
      if (wfm_csrf) {
        csrfToken = wfm_csrf;
        authCookie += `; wfm_csrf=${wfm_csrf}`;
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Missing authentication token. Provide cf_token or wfm_session." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "Missing user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch schedule from WFM
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Get current month + next month schedules
    const schedules: any[] = [];

    for (let m = month; m <= month + 1; m++) {
      const actualYear = m > 12 ? year + 1 : year;
      const actualMonth = m > 12 ? 1 : m;

      const url = `${WFM_BASE_URL}/api/schedules?year=${actualYear}&month=${actualMonth}`;

      const headers: Record<string, string> = {
        "Cookie": authCookie,
        "Accept": "application/json",
        "User-Agent": "GreenTab/1.0",
      };

      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const text = await response.text();
        // Check if response is HTML (Cloudflare challenge page)
        if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
          return new Response(
            JSON.stringify({
              error: "Authentication token expired or invalid. The WFM server returned an HTML page instead of data. Please get a fresh token.",
              details: `WFM returned HTML (${response.status}). Token may have expired.`,
            }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.error(`WFM API error: ${response.status} ${response.statusText}`, text);
        continue;
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        schedules.push(...data);
      } else if (data.schedules && Array.isArray(data.schedules)) {
        schedules.push(...data.schedules);
      } else if (data.data && Array.isArray(data.data)) {
        schedules.push(...data.data);
      }
    }

    if (schedules.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No schedule data returned from WFM. Token may be expired or invalid.",
          synced: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform WFM data into our daily_shifts format
    const startDate = schedules[0]?.date || `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = schedules[schedules.length - 1]?.date || `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

    // Upsert shifts into Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // First, get or create performance_data record for this month
    const { data: perfData } = await supabase
      .from("performance_data")
      .select("id")
      .eq("user_id", user_id)
      .eq("year", year)
      .eq("month", month - 1)
      .maybeSingle();

    let performanceId = perfData?.id;

    if (!performanceId) {
      const { data: newPerf } = await supabase
        .from("performance_data")
        .insert({
          user_id,
          year,
          month: month - 1,
          data: {},
        })
        .select("id")
        .single();
      performanceId = newPerf?.id;
    }

    // Transform and upsert shifts
    const shifts = schedules.map((entry: any) => ({
      user_id,
      date: entry.date,
      shift_start: entry.shift_start || entry.start_time || null,
      shift_end: entry.shift_end || entry.end_time || null,
      is_off: entry.is_off ?? entry.is_off_day ?? (entry.type === "off"),
      is_site: entry.is_site ?? entry.is_site_day ?? (entry.type === "site" || entry.type === "shift"),
      break_start: entry.break_start || entry.first_break_start || null,
      break_end: entry.break_end || entry.first_break_end || null,
      second_break_start: entry.second_break_start || null,
      second_break_end: entry.second_break_end || null,
      status: entry.status || entry.type || "scheduled",
      notes: entry.notes || null,
      updated_at: new Date().toISOString(),
    }));

    let synced = 0;
    for (const shift of shifts) {
      const { error } = await supabase
        .from("daily_shifts")
        .upsert(shift, { onConflict: "user_id,date" });
      if (!error) synced++;
      else console.error("Shift upsert error:", error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        start: startDate,
        end: endDate,
        message: `Synced ${synced} shift entries for ${startDate} to ${endDate}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("WFM sync error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});