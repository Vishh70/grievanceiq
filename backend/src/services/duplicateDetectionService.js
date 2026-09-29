// src/services/duplicateDetectionService.js
// Phase 2: Real Duplicate Detection — Semantic + Spatial + Temporal
//
// Combines three signals into a weighted Duplicate Score:
//   0.50 × Semantic Score  (cosine similarity of MiniLM embeddings)
//   0.30 × Location Score  (Haversine distance decay)
//   0.20 × Temporal Score  (time-difference decay)

const { cosineSimilarity } = require('./embeddingService');

// ── Configurable Constants ──────────────────────────────────────────────────

const DUPLICATE_CONFIG = {
  // Candidate retrieval
  CANDIDATE_MAX_AGE_DAYS: 30,       // Only consider complaints from the last N days
  CANDIDATE_LIMIT: 100,             // Maximum number of candidates to compare

  // Score weights (must sum to 1.0)
  SEMANTIC_WEIGHT: 0.50,
  LOCATION_WEIGHT: 0.30,
  TEMPORAL_WEIGHT: 0.20,

  // Thresholds for DUPLICATE decision
  DUPLICATE_SCORE_THRESHOLD: 0.80,  // Weighted score must be >= this
  SEMANTIC_MIN_THRESHOLD: 0.75,     // Semantic score alone must be >= this

  // Location parameters
  MAX_DUPLICATE_RADIUS_METERS: 500, // Beyond this distance, location score = 0

  // Temporal parameters
  MAX_TIME_WINDOW_HOURS: 48,        // Beyond this many hours, temporal score = 0
};

// ── Haversine Distance ──────────────────────────────────────────────────────

const EARTH_RADIUS_METERS = 6_371_000; // Mean Earth radius in meters

/**
 * Calculates the great-circle distance between two GPS coordinates
 * using the Haversine formula.
 *
 * @param {number} lat1 - Latitude of point A (degrees)
 * @param {number} lng1 - Longitude of point A (degrees)
 * @param {number} lat2 - Latitude of point B (degrees)
 * @param {number} lng2 - Longitude of point B (degrees)
 * @returns {number} Distance in meters (or Infinity if inputs are invalid)
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  if (!isValidCoord(lat1, lng1) || !isValidCoord(lat2, lng2)) {
    return Infinity;
  }

  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Returns true if lat/lng represent valid GPS coordinates.
 */
function isValidCoord(lat, lng) {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  );
}

// ── Score Normalization Functions ────────────────────────────────────────────

/**
 * Normalizes a distance in meters into a 0-1 location score.
 * Uses linear decay: 0 m → 1.0, MAX_RADIUS → 0.0, beyond → 0.0
 *
 * @param {number} distanceMeters
 * @param {number} [maxRadius] - Override from DUPLICATE_CONFIG
 * @returns {number} 0 to 1
 */
function normalizeLocationScore(distanceMeters, maxRadius = DUPLICATE_CONFIG.MAX_DUPLICATE_RADIUS_METERS) {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return 0;
  if (distanceMeters >= maxRadius) return 0;
  return 1 - distanceMeters / maxRadius;
}

/**
 * Normalizes a time difference in hours into a 0-1 temporal score.
 * Uses linear decay: 0 h → 1.0, MAX_WINDOW → 0.0, beyond → 0.0
 *
 * @param {number} diffHours
 * @param {number} [maxWindow] - Override from DUPLICATE_CONFIG
 * @returns {number} 0 to 1
 */
function normalizeTemporalScore(diffHours, maxWindow = DUPLICATE_CONFIG.MAX_TIME_WINDOW_HOURS) {
  if (!Number.isFinite(diffHours) || diffHours < 0) return 0;
  if (diffHours >= maxWindow) return 0;
  return 1 - diffHours / maxWindow;
}

/**
 * Calculates the absolute time difference in hours between two Date-parseable values.
 *
 * @param {string|Date} dateA
 * @param {string|Date} dateB
 * @returns {number} Hours (always non-negative), or Infinity if unparseable
 */
function timeDifferenceHours(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return Infinity;
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60);
}

// ── Core Duplicate Scoring ──────────────────────────────────────────────────

/**
 * Compares a new complaint against a single candidate and returns a full
 * diagnostic breakdown of the duplicate score.
 *
 * @param {object} newComplaint  - { embedding_vector, location_lat, location_lng, created_at }
 * @param {object} candidate     - Same shape, plus { id, similar_group_id }
 * @param {object} [config]      - Override DUPLICATE_CONFIG values
 * @returns {object} Diagnostic result
 */
function scoreCandidate(newComplaint, candidate, config = DUPLICATE_CONFIG) {
  const result = {
    candidateId: candidate.id,
    semanticScore: 0,
    distanceMeters: null,
    locationScore: 0,
    timeDiffHours: null,
    temporalScore: 0,
    duplicateScore: 0,
    isDuplicate: false,
    locationAvailable: false,
    embeddingAvailable: false,
  };

  // ── Semantic Score ──
  const newEmb = newComplaint.embedding_vector;
  const candEmb = candidate.embedding_vector;

  if (Array.isArray(newEmb) && newEmb.length > 0 && Array.isArray(candEmb) && candEmb.length > 0) {
    result.semanticScore = cosineSimilarity(newEmb, candEmb);
    result.embeddingAvailable = true;
  }

  // ── Location Score ──
  // Check raw values first to avoid Number(null) === 0 false positive
  const rawNewLat = newComplaint.location_lat;
  const rawNewLng = newComplaint.location_lng;
  const rawCandLat = candidate.location_lat;
  const rawCandLng = candidate.location_lng;

  if (rawNewLat != null && rawNewLng != null && rawCandLat != null && rawCandLng != null) {
    const newLat = Number(rawNewLat);
    const newLng = Number(rawNewLng);
    const candLat = Number(rawCandLat);
    const candLng = Number(rawCandLng);

    if (isValidCoord(newLat, newLng) && isValidCoord(candLat, candLng)) {
      result.distanceMeters = haversineDistance(newLat, newLng, candLat, candLng);
      result.locationScore = normalizeLocationScore(result.distanceMeters, config.MAX_DUPLICATE_RADIUS_METERS);
      result.locationAvailable = true;
    }
  }

  // ── Temporal Score ──
  if (newComplaint.created_at && candidate.created_at) {
    result.timeDiffHours = timeDifferenceHours(newComplaint.created_at, candidate.created_at);
    result.temporalScore = normalizeTemporalScore(result.timeDiffHours, config.MAX_TIME_WINDOW_HOURS);
  }

  // ── Weighted Duplicate Score ──
  result.duplicateScore =
    config.SEMANTIC_WEIGHT * result.semanticScore +
    config.LOCATION_WEIGHT * result.locationScore +
    config.TEMPORAL_WEIGHT * result.temporalScore;

  // Round to 4 decimal places for cleaner output
  result.duplicateScore = Number(result.duplicateScore.toFixed(4));
  result.semanticScore = Number(result.semanticScore.toFixed(4));
  result.locationScore = Number(result.locationScore.toFixed(4));
  result.temporalScore = Number(result.temporalScore.toFixed(4));
  if (result.distanceMeters !== null) {
    result.distanceMeters = Number(result.distanceMeters.toFixed(1));
  }
  if (result.timeDiffHours !== null) {
    result.timeDiffHours = Number(result.timeDiffHours.toFixed(2));
  }

  // ── Duplicate Decision ──
  // Requires: overall score threshold AND semantic minimum AND location data within radius
  result.isDuplicate =
    result.duplicateScore >= config.DUPLICATE_SCORE_THRESHOLD &&
    result.semanticScore >= config.SEMANTIC_MIN_THRESHOLD &&
    result.locationAvailable &&
    result.distanceMeters <= config.MAX_DUPLICATE_RADIUS_METERS;

  return result;
}

/**
 * Given a new complaint and an array of candidate rows from Supabase,
 * scores every candidate and returns the single best match (if any is a duplicate).
 *
 * @param {object} newComplaint
 * @param {object[]} candidates
 * @param {object} [config]
 * @returns {{ bestMatch: object|null, allScores: object[] }}
 */
function findBestDuplicate(newComplaint, candidates, config = DUPLICATE_CONFIG) {
  if (!candidates || candidates.length === 0) {
    return { bestMatch: null, allScores: [] };
  }

  const allScores = candidates.map((cand) => scoreCandidate(newComplaint, cand, config));

  // Sort by duplicateScore descending
  allScores.sort((a, b) => b.duplicateScore - a.duplicateScore);

  const bestMatch = allScores[0]?.isDuplicate ? allScores[0] : null;

  return { bestMatch, allScores };
}

module.exports = {
  // Config (exported for tests and transparency)
  DUPLICATE_CONFIG,

  // Pure functions
  haversineDistance,
  isValidCoord,
  normalizeLocationScore,
  normalizeTemporalScore,
  timeDifferenceHours,
  scoreCandidate,
  findBestDuplicate,
};
