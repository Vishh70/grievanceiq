const fs = require('fs');
const path = require('path');

// Ensure Windows native dependencies are accessible if running on win32
if (process.platform === 'win32') {
  const possibleDirs = [
    path.resolve(__dirname, '../../node_modules/@huggingface/transformers/node_modules/onnxruntime-node/bin/napi-v6/win32/x64'),
    path.resolve(__dirname, '../../node_modules/onnxruntime-node/bin/napi-v6/win32/x64'),
    path.resolve(__dirname, '../../node_modules/onnxruntime-node/bin/napi-v3/win32/x64')
  ];
  const existingDirs = possibleDirs.filter(d => fs.existsSync(d));
  if (existingDirs.length > 0) {
    process.env.PATH = existingDirs.join(';') + ';' + (process.env.PATH || '');
  }
}

// We use @xenova/transformers to load the MiniLM embedding model.

// Helper for dynamic import that works in standard Node, bundlers, and Jest VM environments
const dynamicImport = new Function('specifier', 'return import(specifier)');

let extractorPromise = null;

/**
 * Lazily loads and caches the Transformers.js feature extraction pipeline.
 * Uses the Xenova/all-MiniLM-L6-v2 pretrained model.
 */
async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      // In Jest environments, we completely bypass the real Xenova runtime 
      // to avoid background thread teardown races with --experimental-vm-modules.
      // A separate smoke test will verify the real ONNX runtime.
      if (process.env.NODE_ENV === 'test' && process.env.USE_REAL_MODEL !== 'true') {
        return async (text) => {
          if (!text || typeof text !== 'string' || text.trim().length === 0) {
            throw new Error('Empty text');
          }
          const v = new Array(384).fill(0.123);
          if (text.includes('pothole') && text.includes('college')) {
            v[0] = 0.9; v[1] = 0.8;
          } else if (text.includes('Garbage')) {
            v[0] = -0.9; v[1] = -0.9;
          } else {
            v[0] = 0.5;
          }
          const norm = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
          return { data: v.map(val => val / (norm || 1)) };
        };
      }

      try {
        const transformers = await dynamicImport('@xenova/transformers');
        return await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      } catch (err) {
        extractorPromise = null; // Prevent caching a failed initialization
        throw err;
      }
    })();
  }
  return await extractorPromise;
}

/**
 * Default official Hugging Face Router endpoint for feature extraction
 */
const DEFAULT_HF_ROUTER_URL = 'https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction';

/**
 * Validates and normalizes an embedding vector.
 * Enforces 384 dimensions and finite numbers.
 */
function validateAndNormalizeEmbedding(vector) {
  let target = vector;
  // If wrapped in batch dimension [[...]], extract first item
  if (Array.isArray(target) && target.length === 1 && Array.isArray(target[0])) {
    target = target[0];
  }

  if (!Array.isArray(target)) {
    throw new Error('Invalid embedding response: Expected array representation.');
  }

  if (target.length !== 384) {
    throw new Error(`Invalid embedding dimensions: Expected 384-dimensional representation, received ${target.length}.`);
  }

  const normalized = new Array(384);
  let normSq = 0;
  for (let i = 0; i < 384; i++) {
    const val = Number(target[i]);
    if (!Number.isFinite(val)) {
      throw new Error('Invalid embedding values: Vector contains non-finite or NaN numbers.');
    }
    normalized[i] = val;
    normSq += val * val;
  }

  if (normSq > 0) {
    const norm = Math.sqrt(normSq);
    if (Math.abs(norm - 1.0) > 1e-4) {
      for (let i = 0; i < 384; i++) {
        normalized[i] = normalized[i] / norm;
      }
    }
  }

  return normalized;
}

/**
 * Generates a 384-dimensional dense semantic embedding vector for the given text.
 * Uses mean pooling and L2 normalization.
 * 
 * @param {string} text - Input text to embed
 * @returns {Promise<number[]>} - Array of floating point numbers
 */
async function generateEmbedding(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return [];
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
  const allowLocal = process.env.ALLOW_LOCAL_EMBEDDING === 'true';

  // Use HuggingFace Inference API in production or when HF_TOKEN is explicitly configured
  if (isProduction || (hfToken && !process.env.USE_REAL_MODEL && process.env.NODE_ENV !== 'test')) {
    if (!hfToken && !allowLocal) {
      throw new Error('Missing embedding API credentials: HF_TOKEN is required for Hugging Face inference.');
    }

    if (hfToken) {
      const endpoint = process.env.HF_EMBEDDING_URL || DEFAULT_HF_ROUTER_URL;
      const timeoutMs = parseInt(process.env.HF_TIMEOUT_MS || '10000', 10);
      const fetchFn = global.fetch || require('node-fetch');

      let response;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        response = await fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${hfToken}`
          },
          body: JSON.stringify({ inputs: text.trim() }),
          signal: controller.signal
        });
      } catch (netErr) {
        if (netErr.name === 'AbortError') {
          throw new Error(`Embedding service request timed out after ${timeoutMs}ms.`);
        }
        throw new Error(`Embedding service network error: ${netErr.message}`);
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Hugging Face authentication failed (HTTP ${response.status}): Invalid or expired HF_TOKEN credentials.`);
        }
        if (response.status === 429) {
          throw new Error('Hugging Face rate limit exceeded (HTTP 429). Please retry shortly.');
        }
        if (response.status >= 500) {
          throw new Error(`Hugging Face inference service error (HTTP ${response.status}). Service temporarily unavailable.`);
        }
        throw new Error(`Hugging Face embedding request failed with HTTP ${response.status}.`);
      }

      let data;
      try {
        data = await response.json();
      } catch (parseErr) {
        throw new Error(`Embedding service response parsing error: ${parseErr.message}`);
      }

      return validateAndNormalizeEmbedding(data);
    }

    // In production without HF_TOKEN, if ALLOW_LOCAL_EMBEDDING is not set, fail safely to prevent OOM
    if (!allowLocal) {
      throw new Error('Missing embedding API credentials: HF_TOKEN is required in production environment.');
    }
  }

  // Local / Development / Test embedding extraction using @xenova/transformers
  try {
    const extractor = await getExtractor();
    const output = await extractor(text.trim(), {
      pooling: 'mean',
      normalize: true
    });

    if (!output || !output.data) {
      throw new Error('Pipeline output is missing tensor data');
    }

    const data = output.data;
    const length = data.length;
    const array = new Array(length);
    for (let i = 0; i < length; i++) {
      array[i] = Number(data[i]);
    }
    return validateAndNormalizeEmbedding(array);
  } catch (error) {
    console.error('Error generating embedding with Xenova/all-MiniLM-L6-v2:', error.message);
    throw error;
  }
}

/**
 * Calculates the cosine similarity between two numerical vectors.
 * 
 * Formula: (A · B) / (||A|| * ||B||)
 * 
 * @param {number[]} vectorA 
 * @param {number[]} vectorB 
 * @returns {number} Cosine similarity score between -1 and 1 (or 0 for invalid inputs)
 */
function cosineSimilarity(vectorA, vectorB) {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
    return 0;
  }

  if (vectorA.length === 0 || vectorB.length === 0) {
    return 0;
  }

  if (vectorA.length !== vectorB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    const a = Number(vectorA[i]);
    const b = Number(vectorB[i]);

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return 0;
    }

    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  
  // Guard against slight floating point inaccuracies exceeding [-1, 1]
  return Math.max(-1, Math.min(1, similarity));
}

/**
 * Validates required production configuration and reports embedding readiness.
 */
function checkEmbeddingHealth() {
  const isProduction = process.env.NODE_ENV === 'production';
  const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
  const allowLocal = process.env.ALLOW_LOCAL_EMBEDDING === 'true';

  if (isProduction) {
    if (hfToken) {
      return { status: 'ready', provider: 'huggingface' };
    }
    if (allowLocal) {
      return { status: 'ready', provider: 'local' };
    }
    return {
      status: 'unavailable',
      provider: 'none',
      reason: 'HF_TOKEN is missing in production and local embeddings are disabled to prevent OOM.'
    };
  }

  return { status: 'ready', provider: 'local' };
}

async function disposeExtractor() {
  if (extractorPromise) {
    try {
      const extractor = await extractorPromise;
      if (extractor && typeof extractor.dispose === 'function') {
        await extractor.dispose();
      }
    } catch (e) {
      // Ignore errors during cleanup
    }
    extractorPromise = null;
  }
}

module.exports = {
  generateEmbedding,
  cosineSimilarity,
  getExtractor,
  disposeExtractor,
  checkEmbeddingHealth,
  validateAndNormalizeEmbedding,
  DEFAULT_HF_ROUTER_URL
};
