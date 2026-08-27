
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://xwmndpgfhjafczipoktv.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3bW5kcGdmaGphZmN6aXBva3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1Mjc5MzUsImV4cCI6MjA3NjEwMzkzNX0.3MbwVrb2QrHkEuk5Vm_ziPdkKVc99Wk2vMQpdxLYQ6U";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`Inspecting data for today: ${today}`);

  // 1. Get Performance Data
  const { data: perfData, error: perfError } = await supabase
    .from('performance_data')
    .select('*')
    .eq('year', 2026)
    .eq('month', 0); // Jan is 0

  if (perfError) {
    console.error('Error fetching perf data:', perfError);
    return;
  }
  
  if (!perfData || perfData.length === 0) {
    console.log('No performance data found.');
    return;
  }

  // Iterate all records found
  for (const record of perfData) {
      const perfId = record.id;
      console.log('Performance Data (Totals):', {
        good: record.good,
        bad: record.bad,
        genesys_good: record.genesys_good,
        id: perfId
      });

      // 2. Get Daily Changes for Today
      const { data: changes, error: changesError } = await supabase
        .from('daily_changes')
        .select('*')
        .eq('performance_id', perfId)
        .eq('change_date', today);

      if (changesError) {
        console.error('Error fetching changes:', changesError);
        return;
      }

      console.log(`Found ${changes.length} changes for today.`);
      let calculatedGood = 0;
      
      changes.forEach(c => {
        console.log(` - ID: ${c.id}, Field: ${c.field_name}, Amount: ${c.change_amount}, Time: ${c.change_time}`);
        if (c.field_name === 'good' || c.field_name === 'genesys_good') {
            calculatedGood += c.change_amount;
        }
      });

      console.log(`Calculated 'Today' Good from changes: ${calculatedGood}`);
  }
}

inspectData();
