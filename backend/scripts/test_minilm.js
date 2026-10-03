const { pipeline } = require('@xenova/transformers');
async function run() {
  try {
    console.log("Loading model...");
    const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log("Model loaded. Inferring...");
    const out = await pipe('There is a large pothole near the NMIET campus entrance.');
    console.log("Embedding length:", out.data.length);
  } catch (e) {
    console.error("Error generating embedding:", e.message);
  }
}
run();
