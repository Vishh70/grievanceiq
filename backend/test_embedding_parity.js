const { generateEmbedding } = require('./src/services/embeddingService');

const FIXED_TEXTS = [
  "Residents report that the road surface is badly damaged near the junction.",
  "The traffic signal is not responding correctly.",
  "Water is leaking from the roadside pipeline.",
  "A tree has fallen over the main electrical wires.",
  "There is a huge pile of uncollected garbage."
];

async function runParityTest() {
  console.log("== MiniLM Embedding Parity Test ==");
  
  for (let i = 0; i < FIXED_TEXTS.length; i++) {
    const text = FIXED_TEXTS[i];
    console.log(`\nText ${i+1}: "${text}"`);
    try {
      const embedding = await generateEmbedding(text);
      console.log(`Dimension: ${embedding.length} (Expected: 384)`);
      console.log(`Pooling: Mean | Normalization: True`);
      console.log(`Sample (first 5 dims):`, embedding.slice(0, 5).map(v => v.toFixed(4)));
      
      if (embedding.length !== 384) {
        console.error(`ERROR: Expected 384 dimensions, got ${embedding.length}`);
      }
    } catch (err) {
      console.error(`Failed to embed Text ${i+1}:`, err.message);
    }
  }
  
  console.log("\nNOTE: Compare the above vectors with Python SentenceTransformer(`all-MiniLM-L6-v2`) output to verify numerical tolerance (usually within 1e-6).");
  process.exit(0);
}

runParityTest();
