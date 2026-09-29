const supabase = require('../config/supabase');
const { analyzeComplaint } = require('../services/aiService');
const fs = require('fs');

// Helper to map Supabase row back to frontend-expected Mongoose format
const mapComplaint = (row) => ({
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
  aiProcessed: row.ai_processed || false,
  statusHistory: row.status_history || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

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

    // 2. Process with Gemini API (asynchronously)
    (async () => {
      try {
        const aiResult = await analyzeComplaint(text, imageBase64, mimeType);
        
        let similarGroupId = complaintData.id;
        let isDuplicate = false;
        
        // Very basic similar search for Supabase (we'll look for same category recent complaints)
        const { data: similar } = await supabase.from('complaints')
          .select('similar_group_id')
          .eq('category', aiResult.category)
          .neq('id', complaintData.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (similar && similar.length > 0 && similar[0].similar_group_id) {
          similarGroupId = similar[0].similar_group_id;
        }

        await supabase.from('complaints').update({
          category: aiResult.category,
          priority: aiResult.priority,
          keywords: aiResult.keywords,
          severity_score: aiResult.severityScore,
          safety_hazards: aiResult.safetyHazards,
          suggested_action: aiResult.suggestedAction,
          similar_group_id: similarGroupId,
          ai_duplicate_flag: isDuplicate,
          ai_processed: true
        }).eq('id', complaintData.id);
        
        console.log(`Complaint ${complaintData.id} AI processed via Gemini.`);
      } catch (aiErr) {
        console.error('Gemini AI processing failed:', aiErr.message);
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
