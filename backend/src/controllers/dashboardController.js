// src/controllers/dashboardController.js
const Complaint = require('../models/Complaint');

const ACTIVE_STATUSES = ['Submitted', 'In Review'];
const SLA_HOURS = 48;
const MS_PER_HOUR = 60 * 60 * 1000;

const resolvedAtExpression = {
  $let: {
    vars: {
      resolvedEntries: {
        $filter: {
          input: { $ifNull: ['$statusHistory', []] },
          as: 'entry',
          cond: { $eq: ['$$entry.status', 'Resolved'] },
        },
      },
    },
    in: {
      $cond: [
        { $gt: [{ $size: '$$resolvedEntries' }, 0] },
        { $arrayElemAt: ['$$resolvedEntries.date', -1] },
        null,
      ],
    },
  },
};

const resolutionHoursExpression = {
  $cond: [
    { $and: ['$createdAt', { $ne: [resolvedAtExpression, null] }] },
    { $divide: [{ $subtract: [resolvedAtExpression, '$createdAt'] }, MS_PER_HOUR] },
    null,
  ],
};

// GET /api/dashboard/summary
exports.getSummary = async (_req, res) => {
  try {
    const now = new Date();
    const activeSlaCutoff = new Date(now.getTime() - SLA_HOURS * MS_PER_HOUR);

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
      mapPins,
      resolvedMetrics,
      activeSlaBreaches,
      severityMetrics,
      topSafetyHazards,
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

      // Latest 200 geotagged map pins with lat/lng and AI severity.
      Complaint.find(
        { 'location.lat': { $ne: null }, 'location.lng': { $ne: null } },
        {
          _id: 1,
          'location.lat': 1,
          'location.lng': 1,
          'location.address': 1,
          category: 1,
          priority: 1,
          severityScore: 1,
          status: 1,
          text: 1,
          createdAt: 1,
        }
      ).sort({ createdAt: -1 }).limit(200),

      // Resolution duration for resolved complaints that have a Resolved history entry.
      Complaint.aggregate([
        { $match: { status: 'Resolved' } },
        {
          $project: {
            resolutionHours: resolutionHoursExpression,
          },
        },
        { $match: { resolutionHours: { $ne: null, $gte: 0 } } },
        {
          $group: {
            _id: null,
            resolvedCount: { $sum: 1 },
            avgResolutionHours: { $avg: '$resolutionHours' },
            withinSlaCount: {
              $sum: { $cond: [{ $lte: ['$resolutionHours', SLA_HOURS] }, 1, 0] },
            },
          },
        },
      ]),

      // Active complaints that have been open for more than 48 hours.
      Complaint.countDocuments({
        status: { $in: ACTIVE_STATUSES },
        createdAt: { $lt: activeSlaCutoff },
      }),

      // Average severity across assessed complaints only.
      Complaint.aggregate([
        { $match: { severityScore: { $ne: null } } },
        {
          $group: {
            _id: null,
            assessedCount: { $sum: 1 },
            avgSeverityScore: { $avg: '$severityScore' },
          },
        },
      ]),

      // Most frequently detected physical safety hazards.
      Complaint.aggregate([
        { $unwind: '$safetyHazards' },
        { $match: { safetyHazards: { $type: 'string', $ne: '' } } },
        {
          $group: {
            _id: '$safetyHazards',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 5 },
      ]),
    ]);

    const resolution = resolvedMetrics[0] || {
      resolvedCount: 0,
      avgResolutionHours: null,
      withinSlaCount: 0,
    };
    const severity = severityMetrics[0] || {
      assessedCount: 0,
      avgSeverityScore: null,
    };

    const slaComplianceRate = resolution.resolvedCount > 0
      ? Number(((resolution.withinSlaCount / resolution.resolvedCount) * 100).toFixed(1))
      : null;

    const avgResolutionHours = resolution.avgResolutionHours == null
      ? null
      : Number(Number(resolution.avgResolutionHours).toFixed(1));

    const avgSeverityScore = severity.avgSeverityScore == null
      ? null
      : Number(Number(severity.avgSeverityScore).toFixed(1));

    res.json({
      summary: { total, pending, resolved, highPriority },
      categoryBreakdown: categoryBreakdown.map(c => ({ name: c._id || 'Unknown', value: c.count })),
      priorityBreakdown: priorityBreakdown.map(p => ({ name: p._id || 'Unknown', value: p.count })),
      departmentBreakdown: departmentBreakdown.map(d => ({ name: d._id || 'Unassigned', value: d.count })),
      statusBreakdown: statusBreakdown.map(s => ({ name: s._id, value: s.count })),
      trend: trend.map(t => ({ date: t._id, count: t.count })),
      mapPins,
      analytics: {
        slaComplianceRate,
        avgResolutionHours,
        activeSlaBreaches,
        avgSeverityScore,
        topSafetyHazards: topSafetyHazards.map(h => ({ hazard: h._id, count: h.count })),
      },
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