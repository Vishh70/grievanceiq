
const request = require('supertest');
const createApp = require('../src/app');
const { generateEmbedding, cosineSimilarity } = require('../src/services/embeddingService');

describe('Phase 1: Semantic Embedding & Cosine Similarity Engine', () => {
  // Allow model download and initial loading time
  jest.setTimeout(60000);


  // ── Test 1 — Embedding generation ──────────────────────────────────────────
  describe('Test 1 — Embedding generation', () => {
    it('generates a valid, non-empty numerical embedding vector for complaint text', async () => {
      const input = 'Large pothole near the main road';
      const embedding = await generateEmbedding(input);

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
      expect(embedding.length).toBe(384); // all-MiniLM-L6-v2 dimension

      // All elements should be finite numbers
      for (const val of embedding) {
        expect(typeof val).toBe('number');
        expect(Number.isFinite(val)).toBe(true);
        expect(Number.isNaN(val)).toBe(false);
      }
    });

    it('returns empty array for empty, non-string, or whitespace inputs', async () => {
      expect(await generateEmbedding('')).toEqual([]);
      expect(await generateEmbedding('   ')).toEqual([]);
      expect(await generateEmbedding(null)).toEqual([]);
      expect(await generateEmbedding(undefined)).toEqual([]);
      expect(await generateEmbedding(12345)).toEqual([]);
    });
  });

  // ── Test 2 — Similar sentences ─────────────────────────────────────────────
  describe('Test 2 — Similar sentences', () => {
    it('produces reasonably high cosine similarity for semantically equivalent complaints', async () => {
      const textA = 'Large pothole near the college gate';
      const textB = 'Deep pothole outside the college entrance';

      const embA = await generateEmbedding(textA);
      const embB = await generateEmbedding(textB);

      const similarity = cosineSimilarity(embA, embB);

      // Verify that their similarity is reasonably high (> 0.70)
      expect(typeof similarity).toBe('number');
      expect(similarity).toBeGreaterThan(0.70);
      expect(similarity).toBeLessThanOrEqual(1.0);
    });
  });

  // ── Test 3 — Different subjects ────────────────────────────────────────────
  describe('Test 3 — Different subjects', () => {
    it('ensures similar sentences have higher similarity than unrelated sentences (relative assertion)', async () => {
      const textA = 'Large pothole near the college gate';
      const textSimilar = 'Deep pothole outside the college entrance';
      const textUnrelated = 'Garbage has not been collected for three days';

      const embA = await generateEmbedding(textA);
      const embSimilar = await generateEmbedding(textSimilar);
      const embUnrelated = await generateEmbedding(textUnrelated);

      const simSimilar = cosineSimilarity(embA, embSimilar);
      const simUnrelated = cosineSimilarity(embA, embUnrelated);

      // Relative assertion: similar complaints must have substantially higher score than unrelated complaints
      expect(simSimilar).toBeGreaterThan(simUnrelated);
      // Unrelated civic complaints should have significantly lower similarity
      expect(simSimilar - simUnrelated).toBeGreaterThan(0.40);
    });
  });

  // ── Test 4 — Invalid vectors & edge cases ──────────────────────────────────
  describe('Test 4 — Invalid vectors and mathematical edge cases', () => {
    it('handles empty vectors safely without crashing', () => {
      expect(cosineSimilarity([], [])).toBe(0);
      expect(cosineSimilarity([0.1, 0.2], [])).toBe(0);
      expect(cosineSimilarity([], [0.1, 0.2])).toBe(0);
    });

    it('handles mismatched dimensions gracefully', () => {
      expect(cosineSimilarity([0.1, 0.2], [0.1, 0.2, 0.3])).toBe(0);
      expect(cosineSimilarity([1, 2, 3, 4], [1, 2])).toBe(0);
    });

    it('handles invalid, non-numeric, or null/undefined inputs safely', () => {
      expect(cosineSimilarity(null, [0.1, 0.2])).toBe(0);
      expect(cosineSimilarity([0.1, 0.2], undefined)).toBe(0);
      expect(cosineSimilarity('not-a-vector', [0.1, 0.2])).toBe(0);
      expect(cosineSimilarity([NaN, 0.2], [0.1, 0.2])).toBe(0);
      expect(cosineSimilarity([Infinity, 0.2], [0.1, 0.2])).toBe(0);
    });

    it('handles zero-magnitude vectors safely (no division by zero)', () => {
      expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
      expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    });

    it('returns 1.0 for identical non-zero vectors', () => {
      const vec = [0.12, -0.45, 0.78, 0.33];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
    });
  });

  // ── Test 5 — HTTP API Endpoint: POST /api/complaints/similarity ────────────
  describe('Test 5 — HTTP API Endpoint: POST /api/complaints/similarity', () => {
    let app;

    beforeAll(() => {
      app = createApp();
    });

    it('returns 200 with similarity score for valid pair of complaint texts', async () => {
      const res = await request(app)
        .post('/api/complaints/similarity')
        .send({
          textA: 'Large pothole near the college gate',
          textB: 'Deep pothole outside the college entrance'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('similarity');
      expect(typeof res.body.similarity).toBe('number');
      expect(res.body.similarity).toBeGreaterThan(0.70);
    });

    it('returns 400 when textA or textB is missing or not a string', async () => {
      const resMissing = await request(app)
        .post('/api/complaints/similarity')
        .send({ textA: 'Only text A provided' });

      expect(resMissing.status).toBe(400);
      expect(resMissing.body).toHaveProperty('error');

      const resInvalid = await request(app)
        .post('/api/complaints/similarity')
        .send({ textA: 123, textB: 456 });

      expect(resInvalid.status).toBe(400);
      expect(resInvalid.body).toHaveProperty('error');
    });
  });
});
