// src/controllers/dashboardController.js
const Complaint = require('../models/Complaint');

// GET /api/dashboard/summary
exports.getSummary = async (_req, res) => {
  try {
    const [
      total,
      pending,
      resolved,
      highPriority,
      categoryBreakdown,
      priorityBreakdown,
      departmentBreakdown,
      statusBreakdown,
      trend,
    ] = await Promise.all([
      // Total count
      Complaint.countDocuments(),

      // Pending = Submitted + In Review + Assigned
      Complaint.countDocuments({ status: { $in: ['Submitted', 'In Review', 'Assigned'] } }),

      // Resolved
      Complaint.countDocuments({ status: 'Resolved' }),

      // High priority (Critical + High)
      Complaint.countDocuments({ priority: { $in: ['Critical', 'High'] } }),

      // Category-wise count
      Complaint.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Priority-wise count
      Complaint.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Department-wise count
      Complaint.aggregate([
        { $group: { _id: '$recommendedDepartment', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Status-wise count
      Complaint.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Last 14 days daily trend
      Complaint.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      summary: { total, pending, resolved, highPriority },
      categoryBreakdown:   categoryBreakdown.map(c => ({ name: c._id || 'Unknown', value: c.count })),
      priorityBreakdown:   priorityBreakdown.map(p => ({ name: p._id || 'Unknown', value: p.count })),
      departmentBreakdown: departmentBreakdown.map(d => ({ name: d._id || 'Unassigned', value: d.count })),
      statusBreakdown:     statusBreakdown.map(s => ({ name: s._id, value: s.count })),
      trend:               trend.map(t => ({ date: t._id, count: t.count })),
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/dashboard/similar-groups
exports.getSimilarGroups = async (_req, res) => {
  try {
    const groups = await Complaint.aggregate([
      { $match: { similarGroupId: { $ne: null } } },
      { $group: { _id: '$similarGroupId', count: { $sum: 1 }, categories: { $addToSet: '$category' } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
