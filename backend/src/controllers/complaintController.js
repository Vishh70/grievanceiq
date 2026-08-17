// src/controllers/complaintController.js
const Complaint = require('../models/Complaint');
const { analyzeComplaint } = require('../services/aiService');

exports.createComplaint = async (req, res) => {
  try {
    const { text, address, lat, lng } = req.body;
    
    // 1. Save initial complaint
    const complaint = new Complaint({
      citizenId: req.user.id,
      text,
      location: {
        address,
        coordinates: lat && lng ? [parseFloat(lng), parseFloat(lat)] : []
      },
      imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
      statusHistory: [{ status: 'Submitted' }]
    });

    await complaint.save();

    // 2. Process with Gemini API (asynchronously)
    // We don't await this so the user gets a fast response
    (async () => {
      try {
        const imagePath = req.file ? req.file.path : null;
        const aiResult = await analyzeComplaint(text, imagePath);
        
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
    const { category, priority, status, department, page = 1, limit = 15 } = req.query;
    
    let filter = {};
    if (req.user.role === 'citizen') {
      filter.citizenId = req.user.id;
    }

    // Admin filters
    if (category)   filter.category = category;
    if (priority)   filter.priority = priority;
    if (status)     filter.status = status;
    if (department) filter.recommendedDepartment = department;

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
