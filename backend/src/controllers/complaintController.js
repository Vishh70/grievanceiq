const Complaint = require('../models/Complaint');
const { analyzeComplaint } = require('../services/aiService');
const fs = require('fs');

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
    
    // 1. Save initial complaint
    const complaint = new Complaint({
      citizenId: req.user.id,
      text,
      location: {
        address,
        coordinates: lat && lng ? [parseFloat(lng), parseFloat(lat)] : []
      },
      imageUrl: '',
      imageBase64: imageBase64 ? `data:${mimeType};base64,${imageBase64}` : '',
      statusHistory: [{ status: 'Submitted' }]
    });

    await complaint.save();

    // 2. Process with Gemini API (asynchronously)
    // We don't await this so the user gets a fast response
    (async () => {
      try {
        const aiResult = await analyzeComplaint(text, imageBase64, mimeType);
        
        // Basic similarity grouping using text search (Requires text index)
        let similarGroupId = complaint._id;
        let isDuplicate = false;
        try {
          const similar = await Complaint.find(
            { $text: { $search: text }, _id: { $ne: complaint._id } },
            { score: { $meta: "textScore" } }
          ).sort({ score: { $meta: "textScore" } }).limit(1);
          
          if (similar.length > 0 && similar[0].similarGroupId) {
             similarGroupId = similar[0].similarGroupId;
             // If score is high enough, we flag it as a duplicate
             if (similar[0]._doc.score > 1.5) {
               isDuplicate = true;
             }
          }
        } catch (err) {
          console.warn("Text search similarity failed (Index might be missing):", err.message);
        }

        complaint.category = aiResult.category;
        complaint.priority = aiResult.priority;
        complaint.recommendedDepartment = aiResult.recommendedDepartment;
        complaint.keywords = aiResult.keywords;
        complaint.similarGroupId = similarGroupId;
        complaint.isDuplicate = isDuplicate;
        complaint.aiProcessed = true;

        await complaint.save();
        console.log(`Complaint ${complaint._id} AI processed via Gemini.`);
      } catch (aiErr) {
        console.error('Gemini AI processing failed:', aiErr.message);
      }
    })();

    res.status(201).json({ message: 'Complaint submitted', complaint });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getComplaints = async (req, res) => {
  try {
    const { category, priority, status, department, search, page = 1, limit = 15 } = req.query;
    
    let filter = {};
    if (req.user.role === 'citizen') {
      filter.citizenId = req.user.id;
    }

    // Admin filters
    if (category)   filter.category = category;
    if (priority)   filter.priority = priority;
    if (status)     filter.status = status;
    if (department) filter.recommendedDepartment = department;
    if (search) {
      // If it looks like a full ID, search ID, otherwise regex search text and category
      if (search.match(/^[0-9a-fA-F]{24}$/)) {
        filter._id = search;
      } else {
        filter.$or = [
          { text: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } }
        ];
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const complaints = await Complaint.find(filter)
      .populate('citizenId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
      
    const total = await Complaint.countDocuments(filter);

    res.json({ complaints, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getComplaintById = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id).populate('citizenId', 'name email');
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    
    // Auth check
    if (req.user.role === 'citizen' && complaint.citizenId._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json({ complaint });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    complaint.status = status;
    complaint.statusHistory.push({ status, note });
    await complaint.save();

    res.json({ message: 'Status updated', complaint });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSimilarComplaints = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    if (!complaint.similarGroupId) return res.json({ complaints: [] });

    const similar = await Complaint.find({
      similarGroupId: complaint.similarGroupId,
      _id: { $ne: complaint._id }
    }).select('text priority createdAt status');

    res.json({ complaints: similar });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPublicComplaints = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    // Get latest AI-processed complaints that have valid locations
    const complaints = await Complaint.find({ 
      aiProcessed: true,
      'location.lat': { $ne: null }
    })
    .populate('citizenId', 'name')
    .sort({ createdAt: -1 })
    .limit(limit);

    res.json({ complaints });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.upvoteComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    // Check if user already upvoted
    const hasUpvoted = complaint.upvotedBy.includes(req.user.id);
    
    if (hasUpvoted) {
      // Toggle off
      complaint.upvotedBy.pull(req.user.id);
      complaint.upvotes = Math.max(0, complaint.upvotes - 1);
    } else {
      // Toggle on
      complaint.upvotedBy.push(req.user.id);
      complaint.upvotes += 1;
      
      // Dynamic priority upgrade logic
      if (complaint.upvotes >= 5 && complaint.priority !== 'Critical') {
        complaint.priority = 'Critical';
        complaint.statusHistory.push({
          status: complaint.status,
          note: 'Priority automatically upgraded to Critical due to high community upvotes (5+).'
        });
      }
    }

    await complaint.save();
    res.json({ upvotes: complaint.upvotes, hasUpvoted: !hasUpvoted, priority: complaint.priority });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
