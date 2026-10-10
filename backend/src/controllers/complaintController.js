const supabase = require('../config/supabase');
const { analyzeComplaint } = require('../services/aiService');
const { generateEmbedding, cosineSimilarity } = require('../services/embeddingService');
const { findBestDuplicate, DUPLICATE_CONFIG } = require('../services/duplicateDetectionService');
const { predictRelationship } = require('../services/relationshipService');
const { processCivicIssueGrouping } = require('../services/civicIssueService');
const { complaintQueue } = require('../config/queue');
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
    processingStatus: row.processing_status || 'PROCESSED',
    statusHistory: row.status_history || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  if (includeEmbedding && row.embedding_vector) {
    mapped.embeddingVector = row.embedding_vector;
  }

  return mapped;
};

// Helper for sanitized public data
const mapPublicComplaint = (row) => {
  // Truncate location to approx 1km precision (~0.01 degrees)
  const truncateGeo = (val) => (val != null ? parseFloat(val.toFixed(2)) : null);
  
  return {
    _id: row.id,
    title: row.title,
    text: row.description, // Basic text is okay, but not internal status/evidence
    category: row.category,
    priority: row.priority,
    status: row.status,
    location: {
      lat: truncateGeo(row.location_lat),
      lng: truncateGeo(row.location_lng),
    },
    upvotes: row.upvotes || 0,
    createdAt: row.created_at
  };
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
      processing_status: 'PENDING',
      status_history: [{ status: 'Pending', date: new Date().toISOString(), note: '' }]
    }]).select().single();

    if (error) throw error;

    // Gamification: Award points to the creator
    const { data: user } = await supabase.from('users').select('civic_points').eq('id', req.user.id).single();
    if (user) {
      await supabase.from('users').update({ civic_points: (user.civic_points || 0) + 50 }).eq('id', req.user.id);
    }

    // 2. Determine if Redis is available. If not, run in-process background execution
    const queueConfig = require('../config/queue');
    if (queueConfig.connection && queueConfig.connection.status === 'ready') {
      await complaintQueue.add('process-complaint', {
        complaintId: complaintData.id,
        text,
        imageBase64,
        mimeType
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      });
    } else {
      // Free Tier / Redis Disconnected Fallback
      console.warn('⚠️ Redis is not ready. Processing complaint in-memory to prevent hangs!');
      const { processComplaintLogic } = require('../workers/complaintWorker');
      
      // Fire and forget (process asynchronously without blocking the HTTP response)
      setTimeout(() => {
        processComplaintLogic({
          complaintId: complaintData.id,
          text,
          imageBase64,
          mimeType
        }).catch(err => {
          console.error('In-memory processing failed:', err);
        });
      }, 100);
    }

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

    if (req.user.role !== 'admin' && complaint.citizen_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to view this complaint.' });
    }

    res.json({ complaint: mapComplaint(complaint) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getComplaintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: complaint, error } = await supabase
      .from('complaints')
      .select('id, processing_status, processing_error')
      .eq('id', id)
      .single();

    if (error || !complaint) return res.status(404).json({ message: 'Complaint not found' });

    res.json({
      complaintId: complaint.id,
      status: complaint.processing_status,
      error: complaint.processing_error || null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
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
    const { data: complaint } = await supabase.from('complaints').select('similar_group_id, category, citizen_id').eq('id', req.params.id).single();
    if (!complaint || !complaint.similar_group_id) return res.json({ complaints: [] });

    if (req.user.role !== 'admin' && complaint.citizen_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to view this complaint.' });
    }

    const { data: similar } = await supabase.from('complaints')
      .select('id, title, description, category, priority, status, location_lat, location_lng, upvotes, created_at')
      .eq('similar_group_id', complaint.similar_group_id)
      .eq('category', complaint.category)
      .neq('id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(5);

    res.json({ complaints: (similar || []).map(mapPublicComplaint) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPublicComplaints = async (req, res) => {
  try {
    let limit = parseInt(req.query.limit) || 50;
    if (limit > 100) limit = 100; // Secure bound limit
    const { data: complaints, error } = await supabase.from('complaints')
      .select('id, title, description, category, priority, status, location_lat, location_lng, upvotes, created_at')
      .eq('ai_processed', true)
      .not('location_lat', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ complaints: (complaints || []).map(mapPublicComplaint) });
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
    
    // Fetch user for civic points update
    const { data: user } = await supabase.from('users').select('civic_points').eq('id', req.user.id).single();
    const currentPoints = user ? (user.civic_points || 0) : 0;
    
    if (hasUpvoted) {
      upvotedBy = upvotedBy.filter(id => id !== req.user.id);
      upvotes = Math.max(0, upvotes - 1);
      if (user) {
        await supabase.from('users').update({ civic_points: Math.max(0, currentPoints - 10) }).eq('id', req.user.id);
      }
    } else {
      upvotedBy.push(req.user.id);
      upvotes += 1;
      
      if (upvotes >= 5 && priority !== 'Critical') {
        priority = 'Critical';
      }
      if (user) {
        await supabase.from('users').update({ civic_points: currentPoints + 10 }).eq('id', req.user.id);
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

