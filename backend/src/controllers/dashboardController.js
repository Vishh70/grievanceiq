// src/controllers/dashboardController.js
const supabase = require('../config/supabase');

const ACTIVE_STATUSES = ['Pending', 'In Review'];
const SLA_HOURS = 48;
const MS_PER_HOUR = 60 * 60 * 1000;

exports.getSummary = async (_req, res) => {
  try {
    const { data: complaints, error } = await supabase.from('complaints').select('*');
    if (error) throw error;

    const now = new Date();
    const activeSlaCutoff = new Date(now.getTime() - SLA_HOURS * MS_PER_HOUR);

    let total = complaints.length;
    let pending = 0;
    let resolved = 0;
    let highPriority = 0;

    const categoryMap = {};
    const priorityMap = {};
    const departmentMap = {};
    const statusMap = {};
    const trendMap = {};
    const hazardMap = {};

    let resolvedCount = 0;
    let withinSlaCount = 0;
    let totalResolutionHours = 0;
    
    let assessedCount = 0;
    let totalSeverityScore = 0;
    
    let activeSlaBreaches = 0;
    const mapPins = [];

    complaints.forEach(c => {
      // 1. Basic Counts
      if (['Pending', 'In Review', 'Assigned'].includes(c.status)) pending++;
      if (c.status === 'Resolved') resolved++;
      if (['Critical', 'High'].includes(c.priority)) highPriority++;

      // 2. Breakdowns
      categoryMap[c.category] = (categoryMap[c.category] || 0) + 1;
      priorityMap[c.priority] = (priorityMap[c.priority] || 0) + 1;
      const dept = c.department_id || 'Unassigned';
      departmentMap[dept] = (departmentMap[dept] || 0) + 1;
      statusMap[c.status] = (statusMap[c.status] || 0) + 1;

      // 3. Trends (Last 14 days)
      const cDate = new Date(c.created_at);
      if (now - cDate <= 14 * 24 * 60 * 60 * 1000) {
        const dString = cDate.toISOString().split('T')[0];
        trendMap[dString] = (trendMap[dString] || 0) + 1;
      }

      // 4. Map Pins
      if (c.location_lat && c.location_lng) {
        mapPins.push({
          _id: c.id,
          location: { lat: c.location_lat, lng: c.location_lng, address: c.location_address },
          category: c.category,
          priority: c.priority,
          severityScore: c.severity_score,
          status: c.status,
          text: c.description,
          createdAt: c.created_at
        });
      }

      // 5. Resolution SLA
      if (c.status === 'Resolved') {
        const history = c.status_history || [];
        const resolvedEntry = history.slice().reverse().find(h => h.status === 'Resolved');
        if (resolvedEntry && resolvedEntry.date) {
          const resHours = (new Date(resolvedEntry.date) - cDate) / MS_PER_HOUR;
          if (resHours >= 0) {
            resolvedCount++;
            totalResolutionHours += resHours;
            if (resHours <= SLA_HOURS) withinSlaCount++;
          }
        }
      }

      // 6. SLA Breaches
      if (ACTIVE_STATUSES.includes(c.status) && cDate < activeSlaCutoff) {
        activeSlaBreaches++;
      }

      // 7. Severity & Hazards
      if (c.severity_score != null) {
        assessedCount++;
        totalSeverityScore += c.severity_score;
      }
      
      const hazards = c.safety_hazards || [];
      hazards.forEach(h => {
        if (h && typeof h === 'string') {
          hazardMap[h] = (hazardMap[h] || 0) + 1;
        }
      });
    });

    // Formatting for JSON response
    const categoryBreakdown = Object.entries(categoryMap).map(([name, value]) => ({ name: name || 'Unknown', value })).sort((a,b) => b.value - a.value);
    const priorityBreakdown = Object.entries(priorityMap).map(([name, value]) => ({ name: name || 'Unknown', value })).sort((a,b) => b.value - a.value);
    const departmentBreakdown = Object.entries(departmentMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    const statusBreakdown = Object.entries(statusMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    const trend = Object.entries(trendMap).map(([date, count]) => ({ date, count })).sort((a,b) => a.date.localeCompare(b.date));
    const topSafetyHazards = Object.entries(hazardMap).map(([hazard, count]) => ({ hazard, count })).sort((a,b) => b.count - a.count).slice(0, 5);
    
    mapPins.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const topMapPins = mapPins.slice(0, 200);

    const slaComplianceRate = resolvedCount > 0 ? Number(((withinSlaCount / resolvedCount) * 100).toFixed(1)) : null;
    const avgResolutionHours = resolvedCount > 0 ? Number((totalResolutionHours / resolvedCount).toFixed(1)) : null;
    const avgSeverityScore = assessedCount > 0 ? Number((totalSeverityScore / assessedCount).toFixed(1)) : null;

    res.json({
      summary: { total, pending, resolved, highPriority },
      categoryBreakdown,
      priorityBreakdown,
      departmentBreakdown,
      statusBreakdown,
      trend,
      mapPins: topMapPins,
      analytics: {
        slaComplianceRate,
        avgResolutionHours,
        activeSlaBreaches,
        avgSeverityScore,
        topSafetyHazards,
      },
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getSimilarGroups = async (_req, res) => {
  try {
    const { data: complaints, error } = await supabase.from('complaints').select('similar_group_id, category');
    if (error) throw error;
    
    const groupsMap = {};
    complaints.forEach(c => {
      if (c.similar_group_id) {
        if (!groupsMap[c.similar_group_id]) groupsMap[c.similar_group_id] = { _id: c.similar_group_id, count: 0, categories: new Set() };
        groupsMap[c.similar_group_id].count++;
        groupsMap[c.similar_group_id].categories.add(c.category);
      }
    });

    let groups = Object.values(groupsMap)
      .filter(g => g.count > 1)
      .map(g => ({ ...g, categories: Array.from(g.categories) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};