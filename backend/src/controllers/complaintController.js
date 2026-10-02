const supabase = require('../config/supabase');
const { analyzeComplaint } = require('../services/aiService');
const { generateEmbedding, cosineSimilarity } = require('../services/embeddingService');
const { findBestDuplicate, DUPLICATE_CONFIG } = require('../services/duplicateDetectionService');
const { predictRelationship } = require('../services/relationshipService');
const { processCivicIssueGrouping } = require('../services/civicIssueService');
const fs = require('fs');

// Helper to map Supabase row back to frontend-expected Mongoose format
const mapComplaint = (row, includeEmbedding = false) => {
  const mapped = {
    _id: row.id,
    citizenId: row.users ? { _id: row.users.id, name: row.users.name, email: row.users.email } : row.citizen_id,
    title: row.title,
    text: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    recommendedDepartment: row.department_id,
    location: {
      lat: row.location_lat,
      lng: row.location_lng,
      address: row.location_address
    },
    imageUrl: row.image_url || '',
    imageBase64: row.image_base64 || '',
    upvotes: row.upvotes || 0,
    upvotedBy: row.upvoted_by || [],
    severityScore: row.severity_score,
    safetyHazards: row.safety_hazards || [],
    suggestedAction: row.suggested_action || '',
    similarGroupId: row.similar_group_id || null,
    keywords: row.keywords || [],
    isDuplicate: row.ai_duplicate_flag || false,
    duplicateScore: row.duplicate_score || 0,
    aiProcessed: row.ai_processed || false,
    statusHistory: row.status_history || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  if (includeEmbedding && row.embedding_vector) {
    mapped.embeddingVector = row.embedding_vector;
  }

  return mapped;
};

exports.createComplaint = async (req, res) => {
  try {
    const { text, address, lat, lng } = req.body;
    
    let imageBase64 = null;
    let mimeType = null;
    if (req.file) {
      const buffer = fs.readFileSync(req.file.path);
      imageBase64 = buffer.toString('base64');
      mimeType = req.file.mimetype;
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    
    // 1. Save initial complaint to Supabase
    const { data: complaintData, error } = await supabase.from('complaints').insert([{
      citizen_id: req.user.id,
      title: text.substring(0, 50) + '...', // Generate simple title
      description: text,
      location_address: address || '',
      location_lat: lat ? parseFloat(lat) : null,
      location_lng: lng ? parseFloat(lng) : null,
      image_base64: imageBase64 ? `data:${mimeType};base64,${imageBase64}` : '',
      status: 'Pending',
      status_history: [{ status: 'Pending', date: new Date().toISOString(), note: '' }]
    }]).select().single();

    if (error) throw error;

    // Gamification: Award points to the creator
    const { data: user } = await supabase.from('users').select('civic_points').eq('id', req.user.id).single();
    if (user) {
      await supabase.from('users').update({ civic_points: (user.civic_points || 0) + 50 }).eq('id', req.user.id);
    }

    // 2. Process with Gemini AI + Phase 1 Embeddings + Phase 2 Duplicate Detection (asynchronously)
    (async () => {
      try {
        const aiResult = await analyzeComplaint(text, imageBase64, mimeType);
        
        // Phase 1: Generate semantic embedding from citizen's original complaint text
        let embeddingVector = [];
        try {
          embeddingVector = await generateEmbedding(text);
        } catch (embedErr) {
          console.error('Embedding generation failed (graceful degradation):', embedErr.message);
        }

        // ── Phase 1.5: Multilabel Issue Classification (Python ML Service) ──
        let mlPrediction = { labels: [], issueTypes: [], probabilities: {}, departments: [], serviceAvailable: false };
        try {
          const { predictIssueLabels } = require('../services/mlService');
          mlPrediction = await predictIssueLabels(embeddingVector, text);
          if (mlPrediction.serviceAvailable) {
            console.log(`  ML Multilabel prediction: ${mlPrediction.labels.join(', ')}`);
          }
        } catch (mlErr) {
          console.error('ML Issue Classification failed:', mlErr.message);
        }

        // Authoritative Category: Prefer trained ML model's canonical issue types
        const primaryCategory = mlPrediction.issueTypes && mlPrediction.issueTypes.length > 0 
          ? mlPrediction.issueTypes[0] 
          : aiResult.category;

        const candidateIssueTypes = mlPrediction.issueTypes && mlPrediction.issueTypes.length > 0
          ? mlPrediction.issueTypes
          : [aiResult.category];

        // ── Phase 2: Real Duplicate Detection ────────────────────────────
        let similarGroupId = complaintData.id;
        let isDuplicate = false;
        let duplicateScore = 0;
        let duplicateCandidateId = null;
        let dupSemanticScore = 0;
        let dupLocationScore = 0;
        let dupTemporalScore = 0;
        let candidateComplaints = [];

        try {
          // Step 1: Retrieve candidate complaints (matching any active issue type, recent, limit 100)
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - DUPLICATE_CONFIG.CANDIDATE_MAX_AGE_DAYS);

          const { data: candidates } = await supabase.from('complaints')
            .select('id, description, embedding_vector, location_lat, location_lng, created_at, similar_group_id, category')
            .in('category', candidateIssueTypes)
            .neq('id', complaintData.id)
            .eq('ai_processed', true)
            .gte('created_at', cutoffDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(DUPLICATE_CONFIG.CANDIDATE_LIMIT);

          if (candidates && candidates.length > 0) {
            candidateComplaints = candidates;
            // Build a virtual new-complaint object with the fields the scorer needs
            const newComplaintForScoring = {
              embedding_vector: embeddingVector,
              location_lat: complaintData.location_lat,
              location_lng: complaintData.location_lng,
              created_at: complaintData.created_at,
            };

            const { bestMatch, allScores } = findBestDuplicate(newComplaintForScoring, candidates);

            // Log top 3 candidates for diagnostics
            const topN = allScores.slice(0, 3);
            topN.forEach((s, i) => {
              console.log(
                `  Duplicate Check [${i + 1}] Candidate: ${s.candidateId} | ` +
                `Semantic: ${s.semanticScore} | Dist: ${s.distanceMeters !== null ? s.distanceMeters + 'm' : 'N/A'} | ` +
                `LocScore: ${s.locationScore} | TimeDiff: ${s.timeDiffHours !== null ? s.timeDiffHours + 'h' : 'N/A'} | ` +
                `TempScore: ${s.temporalScore} | DupScore: ${s.duplicateScore} | ` +
                `Result: ${s.isDuplicate ? 'DUPLICATE' : 'NOT DUPLICATE'}`
              );
            });

            if (bestMatch) {
              isDuplicate = true;
              duplicateScore = bestMatch.duplicateScore;
              duplicateCandidateId = bestMatch.candidateId;
              dupSemanticScore = bestMatch.semanticScore;
              dupLocationScore = bestMatch.locationScore;
              dupTemporalScore = bestMatch.temporalScore;

              // Inherit the matched complaint's similar_group_id
              const matchedCandidate = candidates.find(c => c.id === bestMatch.candidateId);
              if (matchedCandidate && matchedCandidate.similar_group_id) {
                similarGroupId = matchedCandidate.similar_group_id;
              } else {
                similarGroupId = bestMatch.candidateId;
              }

              console.log(
                `  ✅ DUPLICATE DETECTED: Complaint ${complaintData.id} matches ${bestMatch.candidateId} ` +
                `(score: ${bestMatch.duplicateScore})`
              );
            } else {
              console.log(`  ✗ No duplicate found for complaint ${complaintData.id} (${allScores.length} candidates checked)`);
            }
          }
        } catch (dupErr) {
          console.error('Phase 2 duplicate detection failed (graceful degradation):', dupErr.message);
        }

        // ── Build Supabase Update Payload ─────────────────────────────────
        const updatePayload = {
          category: primaryCategory,
          priority: aiResult.priority,
          keywords: aiResult.keywords,
          severity_score: aiResult.severityScore,
          safety_hazards: aiResult.safetyHazards,
          suggested_action: aiResult.suggestedAction,
          similar_group_id: similarGroupId,
          ai_duplicate_flag: isDuplicate,
          ai_processed: true,
          // Phase 2 diagnostic fields
          duplicate_score: duplicateScore,
          duplicate_candidate_id: duplicateCandidateId,
          duplicate_semantic_score: dupSemanticScore,
          duplicate_location_score: dupLocationScore,
          duplicate_temporal_score: dupTemporalScore,
          // ML Service Multilabel Results
          ml_labels: mlPrediction.labels,
          ml_probabilities: mlPrediction.probabilities,
          ml_departments: mlPrediction.departments
        };

        if (Array.isArray(embeddingVector) && embeddingVector.length > 0) {
          updatePayload.embedding_vector = embeddingVector;
        }

        const { error: updateErr } = await supabase.from('complaints').update(updatePayload).eq('id', complaintData.id);
        
        if (updateErr) {
          // If new Phase 2 columns are not yet present, strip them and retry
          const missingColPatterns = ['embedding_vector', 'duplicate_score', 'duplicate_candidate_id',
            'duplicate_semantic_score', 'duplicate_location_score', 'duplicate_temporal_score',
            'ml_labels', 'ml_probabilities', 'ml_departments'];
          const isMissingCol = missingColPatterns.some(p => updateErr.message && updateErr.message.includes(p));

          if (isMissingCol) {
            console.warn('⚠️ Supabase complaints table missing Phase 1/2 columns. Run docs/database/phase1_embedding.sql and phase2_duplicate_detection.sql');
            // Retry with only the columns that existed in the original schema
            missingColPatterns.forEach(col => delete updatePayload[col]);
            await supabase.from('complaints').update(updatePayload).eq('id', complaintData.id);
          } else {
            console.error('Failed to update complaint with AI analysis:', updateErr.message);
          }
        }
        
        console.log(`Complaint ${complaintData.id} AI processed (Gemini + Embedding + Duplicate Detection).`);
        
        // ── Phase 4: Civic Issue Grouping ─────────────────────────────────
        try {
          // Re-create the full new complaint object for Phase 3/4 processing
          const newComplaintObj = {
            id: complaintData.id,
            text: text,
            category: primaryCategory,
            location_lat: complaintData.location_lat,
            location_lng: complaintData.location_lng,
            created_at: complaintData.created_at,
            embedding_vector: embeddingVector
          };
          
          await processCivicIssueGrouping(newComplaintObj, candidateComplaints);
          console.log(`Complaint ${complaintData.id} Civic Issue grouping complete.`);
        } catch (grpErr) {
          console.error('Phase 4 Civic Issue Grouping failed:', grpErr.message);
        }
      } catch (aiErr) {
        console.error('AI processing failed:', aiErr.message);
      }
    })();

    res.status(201).json({ message: 'Complaint submitted', complaint: mapComplaint(complaintData) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.getComplaints = async (req, res) => {
  try {
    const { category, priority, status, department, search, page = 1, limit = 15 } = req.query;
    
    let query = supabase.from('complaints').select(`*, users (id, name, email)`, { count: 'exact' });

    if (req.user.role === 'citizen') {
      query = query.eq('citizen_id', req.user.id);
    }

    if (category)   query = query.eq('category', category);
    if (priority)   query = query.eq('priority', priority);
    if (status)     query = query.eq('status', status);
    if (department) query = query.eq('department_id', department); // This requires UUID department in UI
    
    if (search) {
      query = query.ilike('description', `%${search}%`);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    query = query.order('created_at', { ascending: false }).range(skip, skip + parseInt(limit) - 1);

    const { data: complaints, count, error } = await query;
    if (error) throw error;

    res.json({ 
      complaints: complaints.map(mapComplaint), 
      total: count, 
      page: parseInt(page), 
      pages: Math.ceil(count / parseInt(limit)) 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.getComplaintById = async (req, res) => {
  try {
    const { data: complaint, error } = await supabase.from('complaints')
      .select(`*, users (id, name, email)`)
      .eq('id', req.params.id)
      .single();

    if (error || !complaint) return res.status(404).json({ error: 'Complaint not found' });

    res.json({ complaint: mapComplaint(complaint) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    
    const { data: existing, error: fetchErr } = await supabase.from('complaints').select('status_history').eq('id', req.params.id).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Complaint not found' });

    const newHistory = [...(existing.status_history || []), { status, note, date: new Date().toISOString() }];

    const { data: complaint, error } = await supabase.from('complaints').update({
      status: status,
      status_history: newHistory
    }).eq('id', req.params.id).select(`*, users(id, name, email)`).single();

    if (error) throw error;
    res.json({ message: 'Status updated', complaint: mapComplaint(complaint) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSimilarComplaints = async (req, res) => {
  try {
    const { data: complaint } = await supabase.from('complaints').select('similar_group_id, category').eq('id', req.params.id).single();
    if (!complaint || !complaint.similar_group_id) return res.json({ complaints: [] });

    const { data: similar } = await supabase.from('complaints')
      .select('*')
      .eq('similar_group_id', complaint.similar_group_id)
      .eq('category', complaint.category)
      .neq('id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(5);

    res.json({ complaints: (similar || []).map(mapComplaint) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPublicComplaints = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { data: complaints, error } = await supabase.from('complaints')
      .select(`*, users(id, name)`)
      .eq('ai_processed', true)
      .not('location_lat', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ complaints: (complaints || []).map(mapComplaint) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.upvoteComplaint = async (req, res) => {
  try {
    const { data: complaint, error } = await supabase.from('complaints').select('upvotes, upvoted_by, status, priority, citizen_id').eq('id', req.params.id).single();
    if (error || !complaint) return res.status(404).json({ error: 'Complaint not found' });

    let upvotedBy = complaint.upvoted_by || [];
    let upvotes = complaint.upvotes || 0;
    const hasUpvoted = upvotedBy.includes(req.user.id);
    let priority = complaint.priority;
    
    if (hasUpvoted) {
      upvotedBy = upvotedBy.filter(id => id !== req.user.id);
      upvotes = Math.max(0, upvotes - 1);
    } else {
      upvotedBy.push(req.user.id);
      upvotes += 1;
      
      if (upvotes >= 5 && priority !== 'Critical') {
        priority = 'Critical';
        // Add to history
      }
    }

    await supabase.from('complaints').update({ upvotes, upvoted_by: upvotedBy, priority }).eq('id', req.params.id);
    res.json({ upvotes, hasUpvoted: !hasUpvoted, priority });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Phase 1: Semantic Similarity Test Endpoint
 * POST /api/complaints/similarity
 * Body: { textA: string, textB: string }
 * Response: { similarity: number }
 */
exports.calculateSimilarity = async (req, res) => {
  try {
    const { textA, textB } = req.body;

    if (!textA || !textB || typeof textA !== 'string' || typeof textB !== 'string') {
      return res.status(400).json({ error: 'Both textA and textB are required strings.' });
    }

    const [vectorA, vectorB] = await Promise.all([
      generateEmbedding(textA),
      generateEmbedding(textB)
    ]);

    const similarity = cosineSimilarity(vectorA, vectorB);

    res.json({
      similarity: Number(similarity.toFixed(4))
    });
  } catch (error) {
    console.error('Similarity calculation error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Phase 3: Relationship Classification Endpoint
 * POST /api/complaints/relationship
 * Body: { complaintA: object, complaintB: object }
 * Response: { relationship, confidence, probabilities, features }
 */
exports.classifyRelationship = async (req, res) => {
  try {
    const { complaintA, complaintB } = req.body;

    if (!complaintA || !complaintB) {
      return res.status(400).json({ error: 'Both complaintA and complaintB are required.' });
    }

    const result = await predictRelationship(complaintA, complaintB);
    
    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error('Relationship classification error:', error);
    res.status(500).json({ error: error.message });
  }
};

