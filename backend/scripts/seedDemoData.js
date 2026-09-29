const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const supabase = require('../src/config/supabase');
const { generateEmbedding } = require('../src/services/embeddingService');
const { processComplaint } = require('../src/services/complaintService');
const { routeCivicIssue } = require('../src/services/routingService');
const crypto = require('crypto');

async function seed() {
  const isReset = process.argv.includes('--reset');

  if (isReset) {
    console.log('[DEMO] Resetting demo data...');
    // Demo data is identified by having 'DEMO DATA' in the source/category/title or known tags.
    // We'll delete complaints containing '[DEMO]'
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

  let firstIssueId = null;

  for (const [index, cmp] of scenario.complaints.entries()) {
    console.log(`[DEMO] Processing complaint ${index + 1}/${scenario.complaints.length}: "${cmp.text}"`);
    
    // To identify it as demo data, we inject [DEMO] tag
    const demoText = `[DEMO] ${cmp.text}`;
    
    // Simulate API POST /api/complaints
    const complaintData = {
      description: demoText,
      category: cmp.category,
      location: cmp.location,
      priority: cmp.priority || 'Medium',
      citizen_id: 'demo-user-123'
    };

    try {
      const result = await processComplaint(complaintData);
      console.log(`[DEMO] -> Complaint ID: ${result.complaintId}, Assigned to Civic Issue: ${result.civicIssueId}`);
      if (!firstIssueId) firstIssueId = result.civicIssueId;
    } catch (err) {
      console.error(`[DEMO] Failed to process complaint: ${err.message}`);
    }
    
    // Wait briefly to allow timestamps to stagger naturally
    await new Promise(r => setTimeout(r, 1000));
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
