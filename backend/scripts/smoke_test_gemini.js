// backend/scripts/smoke_test_gemini.js
// Dedicated smoke test to verify live Google Gemini API connectivity and response schema
require('dotenv').config();
const { analyzeComplaint, getModel, FALLBACK_RESPONSE } = require('../src/services/aiService');

async function runGeminiSmokeTest() {
  const apiKey = process.env.GEMINI_API_KEY;
  const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

  console.log('====================================================');
  console.log('       GRIEVANCEIQ - GEMINI API LIVE SMOKE TEST     ');
  console.log('====================================================');
  console.log(`Configured Model: ${configuredModel}`);
  console.log(`API Key Presence: ${apiKey && apiKey !== 'dummy_key' ? 'CONFIGURED (Redacted)' : 'NOT CONFIGURED'}`);

  if (!apiKey || apiKey === 'dummy_key' || apiKey === 'your_gemini_api_key') {
    console.log('\n[RESULT]: SKIPPED');
    console.log('Reason: GEMINI_API_KEY is not configured or is a placeholder in environment.');
    console.log('No live call was attempted. Mocked tests must not be confused with this live check.');
    process.exit(0);
  }

  const sampleText = 'Dangerous exposed electrical wire sparking in front of primary school gate on 5th Main Road after heavy rain.';
  console.log(`\nSending prompt for complaint: "${sampleText}"...`);

  try {
    // 1. Direct probe of configured primary model
    let probeStatus = 'UNKNOWN';
    try {
      const model = getModel(configuredModel);
      const probePrompt = 'Reply with {"status":"ready"} in JSON.';
      const probeResult = await model.generateContent(probePrompt);
      probeStatus = 'OK (Direct primary model responded)';
    } catch (probeErr) {
      probeStatus = `TRANSIENT / UNAVAILABLE (${probeErr.message.substring(0, 100)})`;
    }
    console.log(`Primary Model Probe: ${probeStatus}`);

    // 2. Full application triage call (exercises retry & fallback to GEMINI_FALLBACK_MODEL)
    const result = await analyzeComplaint(sampleText);

    console.log('\nTriage Response Received:');
    console.log(JSON.stringify(result, null, 2));

    // Validate schema
    const issues = [];
    const validCategories = ["Roads", "Water Supply", "Electricity", "Drainage", "Waste Management", "Public Infrastructure", "Other"];
    const validPriorities = ["Critical", "High", "Medium", "Low"];

    if (!validCategories.includes(result.category)) issues.push(`Invalid category: ${result.category}`);
    if (!validPriorities.includes(result.priority)) issues.push(`Invalid priority: ${result.priority}`);
    if (!result.recommendedDepartment || typeof result.recommendedDepartment !== 'string') issues.push('Missing/invalid recommendedDepartment');
    if (!Array.isArray(result.keywords) || result.keywords.length === 0) issues.push('Missing/invalid keywords');
    if (typeof result.severityScore !== 'number' || result.severityScore < 1 || result.severityScore > 10) {
      issues.push(`Invalid severityScore: ${result.severityScore}`);
    }
    if (!Array.isArray(result.safetyHazards)) issues.push('Missing/invalid safetyHazards array');
    if (!result.suggestedAction || typeof result.suggestedAction !== 'string') issues.push('Missing/invalid suggestedAction');

    // Check if it matched static fallback response exactly (indicating complete failure of primary and fallback)
    if (result.suggestedAction === FALLBACK_RESPONSE.suggestedAction && result.category === FALLBACK_RESPONSE.category) {
      console.log('\n[RESULT]: FAILED');
      console.log('Warning: analyzeComplaint returned the static FALLBACK_RESPONSE. Both primary and fallback live API calls failed.');
      process.exit(1);
    }

    if (issues.length > 0) {
      console.log('\n[RESULT]: FAILED');
      console.log('Schema validation errors:', issues);
      process.exit(1);
    }

    console.log('\n[RESULT]: PASSED');
    console.log(`Successfully verified live Gemini API response with valid schema.`);
    process.exit(0);

  } catch (err) {
    console.log('\n[RESULT]: FAILED');
    console.log(`Provider / Network Error: ${err.message}`);
    console.log('Status: Selected models or API key failed authentication/generation.');
    process.exit(1);
  }
}

runGeminiSmokeTest();
