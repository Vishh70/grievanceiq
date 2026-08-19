const Complaint = require('../models/Complaint');
const User = require('../models/User');
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
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null
      },
      imageUrl: '',
      imageBase64: imageBase64 ? `data:${mimeType};base64,${imageBase64}` : '',
      statusHistory: [{ status: 'Submitted' }]
    });

    await complaint.save();

    // Gamification: Award points to the creator
    const user = await User.findById(req.user.id);
    if (user) {
      user.civicPoints = (user.civicPoints || 0) + 50;
      await user.save();
    }

    // 2. Process with Gemini API (asynchronously)
    // We don't await this so the user gets a fast response
    (async () => {
      try {
        const aiResult = await analyzeComplaint(text, imageBase64, mimeType);
        
        // Category-scoped similarity grouping using text search
        let similarGroupId = complaint._id;
        let isDuplicate = false;
        try {
          const similar = await Complaint.find(
            {
              $text: { $search: text },
              category: aiResult.category,
              _id: { $ne: complaint._id }
            },
            { score: { $meta: "textScore" } }
          ).sort({ score: { $meta: "textScore" } }).limit(1);
          
          if (similar.length > 0 && similar[0].similarGroupId) {
             const score = similar[0]._doc?.score || 0;
             // Require strong similarity within the same category to group
             if (score >= 2.0) {
               similarGroupId = similar[0].similarGroupId;
               if (score >= 3.5) {
                 isDuplicate = true;
               }
             }
          }
        } catch (err) {
          console.warn("Text search similarity failed (Index might be missing):", err.message);
        }

        await Complaint.findByIdAndUpdate(complaint._id, {
          category: aiResult.category,
          priority: aiResult.priority,
          recommendedDepartment: aiResult.recommendedDepartment,
          keywords: aiResult.keywords,
          severityScore: aiResult.severityScore,
          safetyHazards: aiResult.safetyHazards,
          suggestedAction: aiResult.suggestedAction,
          similarGroupId: similarGroupId,
          isDuplicate: isDuplicate,
          aiProcessed: true
        });
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
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const complaint = await Complaint.findById(req.params.id).populate('citizenId', 'name email');
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    res.json({ complaint });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

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
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.json({ complaints: [] });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint || !complaint.similarGroupId) return res.json({ complaints: [] });

    const similar = await Complaint.find({
      similarGroupId: complaint.similarGroupId,
      category: complaint.category,
      _id: { $ne: complaint._id }
    })
    .select('text priority createdAt status location')
    .sort({ createdAt: -1 })
    .limit(5);

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

      // Gamification: Award points to the complaint creator
      const creator = await User.findById(complaint.citizenId);
      if (creator) {
        creator.civicPoints = (creator.civicPoints || 0) + 10;
        await creator.save();
      }
    }

    await complaint.save();
    res.json({ upvotes: complaint.upvotes, hasUpvoted: !hasUpvoted, priority: complaint.priority });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
