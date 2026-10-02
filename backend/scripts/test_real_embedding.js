const { generateEmbedding, cosineSimilarity } = require('../src/services/embeddingService');

async function runSmokeTest() {
  try {
    console.log('Starting standalone Node embedding smoke test...');
    
    console.log('1. Generating real embedding for single text...');
    const embA = await generateEmbedding('Large pothole near the college gate');
    
    console.log('2. Verifying embedding structure...');
    if (!Array.isArray(embA)) throw new Error('Result is not an array');
    if (embA.length !== 384) throw new Error(`Expected 384 elements, got ${embA.length}`);
    for (const val of embA) {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new Error('Non-finite number found in vector');
      }
    }
    
    console.log('3. Generating additional embeddings for semantic comparison...');
    const embSimilar = await generateEmbedding('Deep pothole outside the college entrance');
    const embUnrelated = await generateEmbedding('Garbage has not been collected for three days');
    
    console.log('4. Calculating cosine similarity...');
    const simSimilar = cosineSimilarity(embA, embSimilar);
    const simUnrelated = cosineSimilarity(embA, embUnrelated);
    
    console.log(`Similarity (Similar): ${simSimilar}`);
    console.log(`Similarity (Unrelated): ${simUnrelated}`);
    
    if (simSimilar <= 0.65) throw new Error(`Expected similarity > 0.65 for similar texts, got ${simSimilar}`);
    if (simSimilar <= simUnrelated) throw new Error('Expected similar score to be higher than unrelated score');
    if ((simSimilar - simUnrelated) <= 0.35) throw new Error(`Expected >0.35 difference, got ${simSimilar - simUnrelated}`);
    
    console.log('✅ Real Xenova/all-MiniLM-L6-v2 smoke test PASSED!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Real Xenova/all-MiniLM-L6-v2 smoke test FAILED:', error.message);
    process.exit(1);
  }
}

runSmokeTest();
