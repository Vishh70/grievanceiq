// tests/duplicateDetection.test.js
// Phase 2: Real Duplicate Detection — unit and integration tests



const { generateEmbedding } = require('../src/services/embeddingService');
const {
  DUPLICATE_CONFIG,
  haversineDistance,
  isValidCoord,
  normalizeLocationScore,
  normalizeTemporalScore,
  timeDifferenceHours,
  scoreCandidate,
  findBestDuplicate,
} = require('../src/services/duplicateDetectionService');

describe('Phase 2: Real Duplicate Detection', () => {
  jest.setTimeout(60000);


  // ── Haversine Distance ──────────────────────────────────────────────────

  describe('haversineDistance', () => {
    it('returns 0 for identical coordinates', () => {
      expect(haversineDistance(18.5204, 73.8567, 18.5204, 73.8567)).toBeCloseTo(0, 0);
    });

    it('returns correct distance for known points (NMIET campus ~approx)', () => {
      // Two points approximately 100m apart near NMIET, Pune
      const d = haversineDistance(18.6298, 73.7997, 18.6307, 73.7997);
      expect(d).toBeGreaterThan(50);
      expect(d).toBeLessThan(200);
    });

    it('returns large distance for distant cities (Pune to Mumbai ~150km)', () => {
      const d = haversineDistance(18.5204, 73.8567, 19.0760, 72.8777);
      expect(d).toBeGreaterThan(100_000);
    });

    it('returns Infinity for null/undefined coordinates', () => {
      expect(haversineDistance(null, 73.8567, 18.5204, 73.8567)).toBe(Infinity);
      expect(haversineDistance(18.5204, 73.8567, undefined, 73.8567)).toBe(Infinity);
    });
  });

  // ── isValidCoord ────────────────────────────────────────────────────────

  describe('isValidCoord', () => {
    it('returns true for valid GPS coordinates', () => {
      expect(isValidCoord(18.5204, 73.8567)).toBe(true);
      expect(isValidCoord(0, 0)).toBe(true);
      expect(isValidCoord(-33.8688, 151.2093)).toBe(true);
    });

    it('returns false for null/undefined/NaN', () => {
      expect(isValidCoord(null, 73.8567)).toBe(false);
      expect(isValidCoord(18.5204, undefined)).toBe(false);
      expect(isValidCoord(NaN, 73.8567)).toBe(false);
    });
  });

  // ── normalizeLocationScore ──────────────────────────────────────────────

  describe('normalizeLocationScore', () => {
    it('returns 1.0 for 0 meters', () => {
      expect(normalizeLocationScore(0)).toBe(1);
    });

    it('returns 0.5 for half the max radius', () => {
      expect(normalizeLocationScore(250, 500)).toBeCloseTo(0.5, 2);
    });

    it('returns 0 for distance >= max radius', () => {
      expect(normalizeLocationScore(500, 500)).toBe(0);
      expect(normalizeLocationScore(1000, 500)).toBe(0);
    });

    it('returns 0 for Infinity or negative distances', () => {
      expect(normalizeLocationScore(Infinity)).toBe(0);
      expect(normalizeLocationScore(-10)).toBe(0);
    });
  });

  // ── normalizeTemporalScore ──────────────────────────────────────────────

  describe('normalizeTemporalScore', () => {
    it('returns 1.0 for 0 hours', () => {
      expect(normalizeTemporalScore(0)).toBe(1);
    });

    it('returns 0.5 for 24 hours with 48h window', () => {
      expect(normalizeTemporalScore(24, 48)).toBeCloseTo(0.5, 2);
    });

    it('returns 0 for time >= max window', () => {
      expect(normalizeTemporalScore(48, 48)).toBe(0);
      expect(normalizeTemporalScore(100, 48)).toBe(0);
    });

    it('returns 0 for Infinity', () => {
      expect(normalizeTemporalScore(Infinity)).toBe(0);
    });
  });

  // ── timeDifferenceHours ─────────────────────────────────────────────────

  describe('timeDifferenceHours', () => {
    it('calculates correct difference', () => {
      const a = '2026-09-29T10:00:00Z';
      const b = '2026-09-29T12:00:00Z';
      expect(timeDifferenceHours(a, b)).toBeCloseTo(2, 1);
    });

    it('returns Infinity for unparseable dates', () => {
      expect(timeDifferenceHours('not-a-date', '2026-09-29T10:00:00Z')).toBe(Infinity);
    });
  });

  // ── scoreCandidate ──────────────────────────────────────────────────────

  describe('scoreCandidate', () => {
    // Use synthetic vectors for deterministic testing
    const mockEmbedding384 = (seed) => {
      const v = new Array(384).fill(0).map((_, i) => Math.sin(seed + i * 0.1));
      // Normalize
      const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
      return v.map(x => x / norm);
    };

    it('marks as DUPLICATE when all signals are strong', () => {
      const now = new Date().toISOString();
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const emb = mockEmbedding384(42);

      const newC = {
        embedding_vector: emb,
        location_lat: 18.6298,
        location_lng: 73.7997,
        created_at: now,
      };

      const cand = {
        id: 'cand-001',
        embedding_vector: emb, // identical embedding → cosine = 1.0
        location_lat: 18.6299, // ~11m away
        location_lng: 73.7997,
        created_at: twoHoursAgo,
        similar_group_id: 'group-abc',
      };

      const result = scoreCandidate(newC, cand);
      expect(result.semanticScore).toBeCloseTo(1.0, 2);
      expect(result.locationScore).toBeGreaterThan(0.9);
      expect(result.temporalScore).toBeGreaterThan(0.9);
      expect(result.duplicateScore).toBeGreaterThanOrEqual(DUPLICATE_CONFIG.DUPLICATE_SCORE_THRESHOLD);
      expect(result.isDuplicate).toBe(true);
    });

    it('marks as NOT DUPLICATE when location is far despite high semantic score', () => {
      const now = new Date().toISOString();
      const emb = mockEmbedding384(42);

      const newC = {
        embedding_vector: emb,
        location_lat: 18.6298,
        location_lng: 73.7997,
        created_at: now,
      };

      const cand = {
        id: 'cand-002',
        embedding_vector: emb, // identical text
        location_lat: 19.0760, // Mumbai — ~150 km away
        location_lng: 72.8777,
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        similar_group_id: null,
      };

      const result = scoreCandidate(newC, cand);
      expect(result.semanticScore).toBeCloseTo(1.0, 2);
      expect(result.distanceMeters).toBeGreaterThan(100_000);
      expect(result.locationScore).toBe(0);
      expect(result.isDuplicate).toBe(false);
    });

    it('marks as NOT DUPLICATE when text is unrelated despite same location', () => {
      const now = new Date().toISOString();
      const embA = mockEmbedding384(42);
      const embB = mockEmbedding384(999); // very different seed → low cosine

      const newC = {
        embedding_vector: embA,
        location_lat: 18.6298,
        location_lng: 73.7997,
        created_at: now,
      };

      const cand = {
        id: 'cand-003',
        embedding_vector: embB,
        location_lat: 18.6298, // same location
        location_lng: 73.7997,
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        similar_group_id: null,
      };

      const result = scoreCandidate(newC, cand);
      expect(result.semanticScore).toBeLessThan(0.75);
      expect(result.locationScore).toBeGreaterThan(0.9);
      expect(result.isDuplicate).toBe(false);
    });

    it('marks as NOT DUPLICATE when complaint is old (outside temporal window)', () => {
      const now = new Date().toISOString();
      const emb = mockEmbedding384(42);

      const newC = {
        embedding_vector: emb,
        location_lat: 18.6298,
        location_lng: 73.7997,
        created_at: now,
      };

      const cand = {
        id: 'cand-004',
        embedding_vector: emb,
        location_lat: 18.6299,
        location_lng: 73.7997,
        created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), // 72 hours ago
        similar_group_id: null,
      };

      const result = scoreCandidate(newC, cand);
      expect(result.temporalScore).toBe(0);
      // With temporal = 0, weighted score = 0.50*1.0 + 0.30*~0.98 + 0.20*0 = ~0.794
      // This falls below the 0.80 threshold
      expect(result.duplicateScore).toBeLessThan(DUPLICATE_CONFIG.DUPLICATE_SCORE_THRESHOLD);
      expect(result.isDuplicate).toBe(false);
    });

    it('handles missing location gracefully (no crash, not duplicate)', () => {
      const now = new Date().toISOString();
      const emb = mockEmbedding384(42);

      const newC = {
        embedding_vector: emb,
        location_lat: null,
        location_lng: null,
        created_at: now,
      };

      const cand = {
        id: 'cand-005',
        embedding_vector: emb,
        location_lat: 18.6298,
        location_lng: 73.7997,
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        similar_group_id: null,
      };

      const result = scoreCandidate(newC, cand);
      expect(result.locationAvailable).toBe(false);
      expect(result.locationScore).toBe(0);
      // isDuplicate requires locationAvailable = true
      expect(result.isDuplicate).toBe(false);
    });

    it('handles missing embedding gracefully (no crash)', () => {
      const now = new Date().toISOString();

      const newC = {
        embedding_vector: [],
        location_lat: 18.6298,
        location_lng: 73.7997,
        created_at: now,
      };

      const cand = {
        id: 'cand-006',
        embedding_vector: [],
        location_lat: 18.6299,
        location_lng: 73.7997,
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        similar_group_id: null,
      };

      const result = scoreCandidate(newC, cand);
      expect(result.embeddingAvailable).toBe(false);
      expect(result.semanticScore).toBe(0);
      expect(result.isDuplicate).toBe(false);
    });
  });

  // ── findBestDuplicate ───────────────────────────────────────────────────

  describe('findBestDuplicate', () => {
    const mockEmbedding384 = (seed) => {
      const v = new Array(384).fill(0).map((_, i) => Math.sin(seed + i * 0.1));
      const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
      return v.map(x => x / norm);
    };

    it('returns null bestMatch when candidates list is empty', () => {
      const { bestMatch } = findBestDuplicate({}, []);
      expect(bestMatch).toBeNull();
    });

    it('selects the best matching candidate from multiple', () => {
      const now = new Date().toISOString();
      const emb = mockEmbedding384(42);
      const embDiff = mockEmbedding384(999);

      const newC = {
        embedding_vector: emb,
        location_lat: 18.6298,
        location_lng: 73.7997,
        created_at: now,
      };

      const candidates = [
        {
          id: 'cand-bad',
          embedding_vector: embDiff, // very different
          location_lat: 18.6298,
          location_lng: 73.7997,
          created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          similar_group_id: 'group-x',
        },
        {
          id: 'cand-good',
          embedding_vector: emb, // identical
          location_lat: 18.6299,
          location_lng: 73.7997,
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          similar_group_id: 'group-y',
        },
      ];

      const { bestMatch, allScores } = findBestDuplicate(newC, candidates);
      expect(bestMatch).not.toBeNull();
      expect(bestMatch.candidateId).toBe('cand-good');
      expect(allScores.length).toBe(2);
    });
  });

  // ── Integration: Real embeddings with scoreCandidate ────────────────────

  describe('Integration: real embeddings + duplicate scoring', () => {
    let embPotholeA, embPotholeB, embGarbage;

    beforeAll(async () => {
      embPotholeA = await generateEmbedding('Large pothole near the college gate');
      embPotholeB = await generateEmbedding('Deep pothole outside the college entrance');
      embGarbage = await generateEmbedding('Garbage has not been collected for three days');
    });

    it('Test 1 — Same complaint, different wording, close location → DUPLICATE', () => {
      const now = new Date().toISOString();
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      const newC = {
        embedding_vector: embPotholeA,
        location_lat: 18.6298,
        location_lng: 73.7997,
        created_at: now,
      };

      const cand = {
        id: 'C001',
        embedding_vector: embPotholeB,
        location_lat: 18.6302, // ~45m away
        location_lng: 73.7997,
        created_at: twoHoursAgo,
        similar_group_id: 'group-pothole',
      };

      const result = scoreCandidate(newC, cand);
      expect(result.semanticScore).toBeGreaterThan(0.75);
      expect(result.locationScore).toBeGreaterThan(0.8);
      expect(result.temporalScore).toBeGreaterThan(0.9);
      expect(result.isDuplicate).toBe(true);

      console.log('Test 1 result:', {
        semanticScore: result.semanticScore,
        locationScore: result.locationScore,
        temporalScore: result.temporalScore,
        duplicateScore: result.duplicateScore,
        isDuplicate: result.isDuplicate,
      });
    });

    it('Test 2 — Same wording, different location (8km) → NOT DUPLICATE', () => {
      const now = new Date().toISOString();

      const newC = {
        embedding_vector: embPotholeA,
        location_lat: 18.6298,
        location_lng: 73.7997,
        created_at: now,
      };

      const cand = {
        id: 'C002',
        embedding_vector: embPotholeA, // identical text
        location_lat: 18.5500, // ~8km away (railway station area)
        location_lng: 73.8200,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        similar_group_id: null,
      };

      const result = scoreCandidate(newC, cand);
      expect(result.semanticScore).toBeGreaterThan(0.9);
      expect(result.locationScore).toBe(0); // well beyond 500m
      expect(result.isDuplicate).toBe(false);

      console.log('Test 2 result:', {
        semanticScore: result.semanticScore,
        distanceMeters: result.distanceMeters,
        locationScore: result.locationScore,
        duplicateScore: result.duplicateScore,
        isDuplicate: result.isDuplicate,
      });
    });

    it('Test 3 — Same location, unrelated text → NOT DUPLICATE', () => {
      const now = new Date().toISOString();

      const newC = {
        embedding_vector: embPotholeA,
        location_lat: 18.6298,
        location_lng: 73.7997,
        created_at: now,
      };

      const cand = {
        id: 'C003',
        embedding_vector: embGarbage,
        location_lat: 18.6299,
        location_lng: 73.7997,
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        similar_group_id: null,
      };

      const result = scoreCandidate(newC, cand);
      expect(result.semanticScore).toBeLessThan(0.75);
      expect(result.locationScore).toBeGreaterThan(0.9);
      expect(result.isDuplicate).toBe(false);

      console.log('Test 3 result:', {
        semanticScore: result.semanticScore,
        locationScore: result.locationScore,
        duplicateScore: result.duplicateScore,
        isDuplicate: result.isDuplicate,
      });
    });
  });
});
