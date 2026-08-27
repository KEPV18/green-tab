import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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
    const body = await req.json();
    const { user_id, schedules, source } = body;

    // Mode 1: Client sends pre-fetched schedule data directly
    if (schedules && Array.isArray(schedules) && schedules.length > 0) {
      // Client already fetched WFM data and is sending it to us for storage
      // This mode works because the browser can access wfm.tabby.ai with Cloudflare cookies
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabase = createClient(supabaseUrl, supabaseKey);

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      // Ensure performance_data record exists for this month
      const { data: perfData } = await supabase
        .from("performance_data")
        .select("id")
        .eq("user_id", user_id)
        .eq("year", year)
        .gte("month", month - 1)
        .lte("month", month)
        .maybeSingle();

      let performanceId = perfData?.id;
      if (!performanceId) {
        const { data: newPerf } = await supabase
          .from("performance_data")
          .insert({ user_id, year, month: month - 1, data: {} })
          .select("id")
          .single();
        performanceId = newPerf?.id;
      }

      // Transform and upsert shifts
      const shifts = schedules.map((entry: Record<string, unknown>) => ({
        user_id,
        date: entry.date as string,
        shift_start: (entry.shift_start || entry.start_time || null) as string | null,
        shift_end: (entry.shift_end || entry.end_time || null) as string | null,
        is_off: (entry.is_off ?? entry.is_off_day ?? (entry.type === "off")) as boolean,
        is_site: (entry.is_site ?? entry.is_site_day ?? (entry.type === "site" || entry.type === "shift")) as boolean,
        break_start: (entry.break_start || entry.first_break_start || null) as string | null,
        break_end: (entry.break_end || entry.first_break_end || null) as string | null,
        second_break_start: (entry.second_break_start || null) as string | null,
        second_break_end: (entry.second_break_end || null) as string | null,
        status: (entry.status || entry.type || "scheduled") as string,
        notes: (entry.notes || null) as string | null,
        updated_at: new Date().toISOString(),
      }));

      // Filter out shifts with no date
      const validShifts = shifts.filter((s: { date?: string }) => s.date);

      let synced = 0;
      const errors: string[] = [];
      for (const shift of validShifts) {
        const { error } = await supabase
          .from("daily_shifts")
          .upsert(shift, { onConflict: "user_id,date" });
        if (!error) synced++;
        else errors.push(`${shift.date}: ${error.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          synced,
          total: validShifts.length,
          errors: errors.length > 0 ? errors : undefined,
          message: `Synced ${synced}/${validShifts.length} shift entries`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mode 2: Server-side fetch using wfm_session or cf_token
    const { cf_token, wfm_session, wfm_csrf } = body;
    let authCookie = "";
    let csrfToken = "";

    if (cf_token) {
      authCookie = `CF_Authorization=${cf_token}`;
    } else if (wfm_session) {
      authCookie = `wfm_session=${wfm_session}`;
      if (wfm_csrf) {
        csrfToken = wfm_csrf;
        authCookie += `; wfm_csrf=${wfm_csrf}`;
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Missing authentication token or schedule data. Provide cf_token, wfm_session, or schedules array." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "Missing user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to fetch from WFM API server-side
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const schedules_server: Record<string, unknown>[] = [];

    for (let m = month; m <= month + 1; m++) {
      const actualYear = m > 12 ? year + 1 : year;
      const actualMonth = m > 12 ? 1 : m;

      const url = `https://wfm.tabby.ai/api/schedules?year=${actualYear}&month=${actualMonth}`;
      const headers: Record<string, string> = {
        "Cookie": authCookie,
        "Accept": "application/json",
        "User-Agent": "GreenTab/1.0",
      };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

      try {
        const response = await fetch(url, { headers, redirect: "manual" });

        if (response.status === 302 || response.status === 301) {
          return new Response(
            JSON.stringify({
              error: "Cloudflare Access blocked the request. WFM requires CF_Authorization which is HttpOnly and cannot be extracted from browser DevTools. Use the browser-side WFM sync button instead.",
              hint: "The browser extension/script should fetch the data and send it to this endpoint with the 'schedules' field.",
            }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!response.ok) {
          const text = await response.text();
          if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
            return new Response(
              JSON.stringify({
                error: "Authentication token expired or invalid. WFM returned an HTML page.",
              }),
              { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          continue;
        }

        const data = await response.json();
        if (Array.isArray(data)) schedules_server.push(...data);
        else if (data.schedules) schedules_server.push(...data.schedules);
        else if (data.data) schedules_server.push(...data.data);
      } catch (err) {
        console.error(`WFM fetch error for ${actualYear}-${actualMonth}:`, err);
      }
    }

    if (schedules_server.length === 0) {
      return new Response(
        JSON.stringify({ error: "No schedule data returned from WFM.", synced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store fetched data
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: perfData } = await supabase
      .from("performance_data")
      .select("id")
      .eq("user_id", user_id)
      .eq("year", year)
      .gte("month", month - 1)
      .lte("month", month)
      .maybeSingle();

    let performanceId = perfData?.id;
    if (!performanceId) {
      const { data: newPerf } = await supabase
        .from("performance_data")
        .insert({ user_id, year, month: month - 1, data: {} })
        .select("id")
        .single();
      performanceId = newPerf?.id;
    }

    const shifts = schedules_server.map((entry: Record<string, unknown>) => ({
      user_id,
      date: entry.date as string,
      shift_start: (entry.shift_start || entry.start_time || null) as string | null,
      shift_end: (entry.shift_end || entry.end_time || null) as string | null,
      is_off: (entry.is_off ?? entry.is_off_day ?? (entry.type === "off")) as boolean,
      is_site: (entry.is_site ?? entry.is_site_day ?? (entry.type === "site" || entry.type === "shift")) as boolean,
      break_start: (entry.break_start || entry.first_break_start || null) as string | null,
      break_end: (entry.break_end || entry.first_break_end || null) as string | null,
      second_break_start: (entry.second_break_start || null) as string | null,
      second_break_end: (entry.second_break_end || null) as string | null,
      status: (entry.status || entry.type || "scheduled") as string,
      notes: (entry.notes || null) as string | null,
      updated_at: new Date().toISOString(),
    }));

    const validShifts = shifts.filter((s: { date?: string }) => s.date);
    let synced = 0;
    for (const shift of validShifts) {
      const { error } = await supabase
        .from("daily_shifts")
        .upsert(shift, { onConflict: "user_id,date" });
      if (!error) synced++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        total: validShifts.length,
        message: `Synced ${synced}/${validShifts.length} shift entries`,
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