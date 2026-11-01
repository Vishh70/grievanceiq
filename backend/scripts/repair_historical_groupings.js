// backend/scripts/repair_historical_groupings.js
/**
 * CLI Tool for FR05 Historical Grouping Audit & Non-Destructive Repair.
 *
 * Scans Civic Issues for instances where 'Related' complaint relationships
 * were incorrectly used to merge distinct incidents into a single ticket.
 *
 * Usage:
 *   node backend/scripts/repair_historical_groupings.js          # Dry-run audit (default)
 *   node backend/scripts/repair_historical_groupings.js --dry-run # Explicit dry-run
 *   node backend/scripts/repair_historical_groupings.js --apply   # Apply repairs non-destructively
 */

const historicalRepairService = require('../src/services/historicalGroupingRepairService');

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const modeLabel = isApply ? 'APPLY' : 'DRY RUN';

  console.log('=================================================================');
  console.log(`  GRIEVANCEIQ — HISTORICAL GROUPING REPAIR (${modeLabel})`);
  console.log('  FR05: Duplicate-Only Incident Identity Verification');
  console.log('=================================================================\n');

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('⚠️ Notice: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured in the environment.');
      console.warn('   To run this script against a live database, configure your Supabase credentials in .env.');
    }

    const report = await historicalRepairService.analyzeHistoricalGroupings({ dryRun: !isApply });

    console.log(`Scanned multi-complaint Civic Issues: ${report.totalMultiComplaintIssuesScanned}`);
    console.log(`Properly grouped issues (Duplicate-only): ${report.properlyGroupedCount}`);
    console.log(`Issues needing repair (Over-merged via Related): ${report.issuesNeedingRepairCount}\n`);

    if (report.issuesNeedingRepairCount === 0) {
      console.log('✅ All existing Civic Issues are correctly grouped by Duplicate relationships.');
      console.log('   No repairs needed.');
      process.exit(0);
    }

    console.log('--- Issues Identified for Repair ---');
    report.repairDetails.forEach((detail, idx) => {
      console.log(`\n[${idx + 1}] Issue ID: ${detail.civicIssueId}`);
      console.log(`    Title: "${detail.title}"`);
      console.log(`    Original complaints (${detail.originalComplaintCount}): ${JSON.stringify(detail.proposedSplit.retainedIssue.complaintIds)}`);
      console.log(`    Identified ${detail.duplicateComponentsCount} disjoint duplicate clusters:`);
      detail.duplicateComponents.forEach((comp, cIdx) => {
        const role = cIdx === 0 ? 'Retained on original issue' : `Split to new issue #${cIdx}`;
        console.log(`      Cluster ${cIdx + 1} (${comp.length} complaints): ${JSON.stringify(comp)} -> [${role}]`);
      });
      if (detail.relatedEdgesFound.length > 0) {
        console.log(`    Found ${detail.relatedEdgesFound.length} 'Related' edge(s) that caused incorrect merge:`);
        detail.relatedEdgesFound.forEach(edge => {
          console.log(`      ${edge.source_complaint_id} <-> ${edge.target_complaint_id} (${edge.relationship_type})`);
        });
      }
    });

    if (!isApply) {
      console.log('\n=================================================================');
      console.log('  DRY RUN COMPLETE — No changes were written to the database.');
      console.log('  To apply these repairs non-destructively, run with:');
      console.log('    node backend/scripts/repair_historical_groupings.js --apply');
      console.log('=================================================================');
      process.exit(0);
    }

    console.log('\n--- Applying Non-Destructive Repairs ---');
    const result = await historicalRepairService.applyHistoricalRepair(report.repairDetails);
    console.log(`✅ Successfully repaired ${result.repairedCount} Civic Issues.`);
    console.log(`   Created ${result.newIssuesCreated} new separate Civic Issues.`);
    console.log(`   Repointed ${result.repointedComplaintsCount} complaints without data loss.`);
    console.log('   All complaint_relationships and task records preserved.');
    console.log('=================================================================');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Repair execution failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
