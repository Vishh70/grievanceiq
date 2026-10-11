const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const supabase = require('../src/config/supabase');
const { processComplaintLogic } = require('../src/workers/complaintWorker');
const { routeCivicIssue } = require('../src/services/routingService');
const crypto = require('crypto');

async function seed() {
  const isReset = process.argv.includes('--reset');

  if (isReset) {
    console.log('[DEMO] Resetting demo data...');
    const { error: delCmp } = await supabase.from('complaints').delete().like('description', '%[DEMO]%');
    const { error: delIss } = await supabase.from('civic_issues').delete().like('title', '%[DEMO]%');
    if (delCmp || delIss) {
      console.error('[DEMO] Failed to reset demo data:', delCmp?.message, delIss?.message);
    } else {
      console.log('[DEMO] Reset complete.');
    }
    process.exit(0);
  }

  console.log('[DEMO] Loading demo scenario...');
  const scenarioPath = path.join(__dirname, '../data/demo_scenario.json');
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));

  // Ensure a demo citizen user exists
  let demoCitizenId = null;
  const { data: demoUser } = await supabase.from('users').select('id').eq('email', 'demo@grievanceiq.com').single();
  if (demoUser) {
    demoCitizenId = demoUser.id;
  } else {
    const { data: newUser } = await supabase.from('users').insert([{
      name: 'Demo Citizen',
      email: 'demo@grievanceiq.com',
      role: 'citizen'
    }]).select('id').single();
    if (newUser) demoCitizenId = newUser.id;
  }

  let firstIssueId = null;

  for (const [index, cmp] of scenario.complaints.entries()) {
    console.log(`[DEMO] Processing complaint ${index + 1}/${scenario.complaints.length}: "${cmp.text}"`);
    
    const demoText = `[DEMO] ${cmp.text}`;
    
    // Insert into Supabase using supported intake schema
    const { data: created, error: insertErr } = await supabase.from('complaints').insert([{
      citizen_id: demoCitizenId,
      title: cmp.text.substring(0, 50) + '...',
      description: demoText,
      location_address: cmp.location?.address || 'Municipal Demo Zone',
      location_lat: cmp.location?.lat || 18.5204,
      location_lng: cmp.location?.lng || 73.8567,
      status: 'Pending',
      processing_status: 'PENDING',
      status_history: [{ status: 'Pending', date: new Date().toISOString(), note: 'Demo submission' }]
    }]).select().single();

    if (insertErr || !created) {
      console.error(`[DEMO] Insert failed: ${insertErr?.message}`);
      continue;
    }

    try {
      // Execute through the real supported background processing logic
      await processComplaintLogic({
        complaintId: created.id,
        text: demoText,
        imageBase64: null,
        mimeType: null
      });

      const { data: updated } = await supabase.from('complaints').select('civic_issue_id').eq('id', created.id).single();
      const civicIssueId = updated?.civic_issue_id;
      console.log(`[DEMO] -> Complaint ID: ${created.id}, Assigned to Civic Issue: ${civicIssueId || 'None'}`);
      if (!firstIssueId && civicIssueId) firstIssueId = civicIssueId;
    } catch (err) {
      console.error(`[DEMO] Processing pipeline failed for complaint: ${err.message}`);
    }
    
    await new Promise(r => setTimeout(r, 500));
  }

  if (firstIssueId) {
    console.log(`[DEMO] Routing Civic Issue ${firstIssueId}...`);
    
    // Mark Civic Issue Title with [DEMO] for easy cleanup
    await supabase.from('civic_issues').update({ title: `[DEMO] ${scenario.name}` }).eq('id', firstIssueId);

    try {
      await routeCivicIssue(firstIssueId);
      console.log(`[DEMO] Routing and Task Generation complete.`);
    } catch (err) {
      console.error(`[DEMO] Failed to route Civic Issue: ${err.message}`);
    }
  }

  console.log('[DEMO] Seeding successful.');
  process.exit(0);
}

seed();
