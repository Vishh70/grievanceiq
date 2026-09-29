/**
 * Phase 1: local semantic embeddings and cosine similarity.
 *
 * Uses a free/open-source pretrained model via Transformers.js.
 * The model is downloaded/cached on first use and then reused in-process.
 */

let extractorPromise = null;

const MODEL_ID = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers')
      .then(({ env, pipeline }) => {
        // Keep model files in the Hugging Face/Transformers cache.
        // Remote model loading is enabled because Phase 1 uses the public
        // pretrained model the first time the server starts.
        env.allowRemoteModels = true;
        return pipeline('feature-extraction', MODEL_ID);
      })
      .catch((error) => {
        extractorPromise = null;
        throw error;
      });
  }

  return extractorPromise;
}

async function generateEmbedding(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new TypeError('Embedding text must be a non-empty string.');
  }

  const extractor = await getExtractor();

  const output = await extractor(text.trim(), {
    pooling: 'mean',
    normalize: true,
  });

  const embedding = Array.from(output.data, Number);

  if (!embedding.length) {
    throw new Error('Embedding model returned an empty vector.');
  }

  return embedding;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    throw new TypeError('Cosine similarity requires two non-empty arrays of equal length.');
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i]);
    const y = Number(b[i]);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('Embedding vectors must contain only finite numbers.');
    }

    dot += x * y;
    magnitudeA += x * x;
    magnitudeB += y * y;
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

function rankBySimilarity(queryEmbedding, candidates, limit = 5) {
  if (!Array.isArray(candidates)) {
    throw new TypeError('Candidates must be an array.');
  }

  return candidates
    .filter((candidate) => Array.isArray(candidate?.embedding))
    .map((candidate) => ({
      ...candidate,
      similarity: cosineSimilarity(queryEmbedding, candidate.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(0, limit));
}

module.exports = {
  MODEL_ID,
  generateEmbedding,
  cosineSimilarity,
  rankBySimilarity,
};
