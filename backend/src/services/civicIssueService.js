// src/services/civicIssueService.js
const supabase = require('../config/supabase');
const complaintGraphService = require('./complaintGraphService');
const { predictRelationship } = require('./relationshipService');

/**
 * Generates a deterministic title for a Civic Issue based on component complaints.
 * 
 * @param {Array<object>} complaints - List of complaint objects
 * @returns {string} The generated title
 */
function generateCivicIssueTitle(complaints) {
  if (!complaints || complaints.length === 0) return 'Unknown Civic Issue';

  // Get unique categories
  const categories = [...new Set(complaints.map(c => c.category).filter(Boolean))];
  
  if (categories.length === 1) {
    return `${categories[0]} Issue`;
  } else if (categories.length === 2) {
    return `${categories[0]} and ${categories[1]} Issue`;
  } else if (categories.length > 2) {
    return `${categories[0]}, ${categories[1]}, and other Issues`;
  }
  
  return 'General Civic Issue';
}

/**
 * Calculates a representative location (average lat/lng) for a Civic Issue.
 * 
 * @param {Array<object>} complaints - List of complaint objects
 * @returns {{ location_lat: number|null, location_lng: number|null }}
 */
function calculateRepresentativeLocation(complaints) {
  let sumLat = 0;
  let sumLng = 0;
  let validCount = 0;

  for (const c of complaints) {
    const lat = Number(c.location_lat);
    const lng = Number(c.location_lng);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && c.location_lat != null) {
      sumLat += lat;
      sumLng += lng;
      validCount++;
    }
  }

  if (validCount === 0) {
    return { location_lat: null, location_lng: null };
  }

  return {
    location_lat: Number((sumLat / validCount).toFixed(6)),
    location_lng: Number((sumLng / validCount).toFixed(6)),
  };
}

/**
 * Aggregates the highest priority among a list of complaints.
 * Ordering: Critical > High > Medium > Low
 * 
 * @param {Array<object>} complaints - List of complaint objects
 * @returns {string} The highest priority string
 */
function aggregatePriority(complaints) {
  const priorities = complaints.map(c => c.priority).filter(Boolean);
  if (priorities.includes('Critical')) return 'Critical';
  if (priorities.includes('High')) return 'High';
  if (priorities.includes('Medium')) return 'Medium';
  if (priorities.includes('Low')) return 'Low';
  return 'Medium'; // Default
}

/**
 * Creates or updates a Civic Issue from a connected component of complaints.
 * 
 * @param {Array<object>} componentComplaints - Full complaint objects in the component
 * @returns {Promise<object>} The created/updated Civic Issue row
 */
async function createOrUpdateCivicIssue(componentComplaints) {
  if (!componentComplaints || componentComplaints.length === 0) return null;

  const complaintIds = componentComplaints.map(c => c.id);
  const title = generateCivicIssueTitle(componentComplaints);
  const location = calculateRepresentativeLocation(componentComplaints);
  const priority = aggregatePriority(componentComplaints);
  const primaryCategory = componentComplaints[0].category || 'Other';

  // Check if any of these complaints already belong to a civic issue
  const existingIssueIds = [...new Set(componentComplaints.map(c => c.civic_issue_id).filter(Boolean))];
  
  let issueIdToUse = null;

  if (existingIssueIds.length > 0) {
    // If they belong to multiple, we just pick the first one and merge them (for simplicity in Phase 4)
    issueIdToUse = existingIssueIds[0];
  }

  const payload = {
    title,
    primary_category: primaryCategory,
    priority,
    location_lat: location.location_lat,
    location_lng: location.location_lng,
    complaint_ids: complaintIds,
    updated_at: new Date().toISOString()
  };

  let savedIssue = null;

  try {
    if (issueIdToUse) {
      const { data, error } = await supabase
        .from('civic_issues')
        .update(payload)
        .eq('id', issueIdToUse)
        .select()
        .single();
      
      if (error) throw error;
      savedIssue = data;
    } else {
      const { data, error } = await supabase
        .from('civic_issues')
        .insert([payload])
        .select()
        .single();
      
      if (error) throw error;
      savedIssue = data;
    }

    // Now update all complaints in this component to link to the civic issue
    if (savedIssue) {
      await supabase
        .from('complaints')
        .update({ civic_issue_id: savedIssue.id })
        .in('id', complaintIds);
    }

    return savedIssue;
  } catch (error) {
    // Graceful degradation: if schema doesn't exist, just log and return
    console.error('Failed to save Civic Issue (check if Phase 4 migration ran):', error.message);
    return null;
  }
}

/**
 * High-level orchestration for Phase 4:
 * 1. Takes a new complaint and its candidate matches.
 * 2. Uses Phase 3 relationship classifier to find edges.
 * 3. Builds a Complaint Graph.
 * 4. Finds connected components.
 * 5. Creates or updates Civic Issues for components with >1 complaint.
 * 
 * @param {object} newComplaint 
 * @param {Array<object>} candidates 
 */
async function processCivicIssueGrouping(newComplaint, candidates) {
  if (!candidates || candidates.length === 0) return;

  const edges = [];
  
  // Predict relationships between the new complaint and all candidates
  for (const cand of candidates) {
    try {
      const result = await predictRelationship(newComplaint, cand);
      if (result && result.relationship) {
        edges.push({
          sourceId: newComplaint.id,
          targetId: cand.id,
          relationship: result.relationship
        });
      }
    } catch (err) {
      console.warn(`Relationship prediction failed for candidate ${cand.id}:`, err.message);
    }
  }

  // Build the graph and find components
  const allComplaints = [newComplaint, ...candidates];
  complaintGraphService.buildGraph(allComplaints, edges);
  
  const components = complaintGraphService.findConnectedComponents();
  
  // For each component that has more than 1 complaint, create a Civic Issue
  for (const compIds of components) {
    if (compIds.length > 1) {
      // It's a grouped issue!
      const compData = compIds.map(id => allComplaints.find(c => c.id === id)).filter(Boolean);
      await createOrUpdateCivicIssue(compData);
    }
  }
}

module.exports = {
  generateCivicIssueTitle,
  calculateRepresentativeLocation,
  aggregatePriority,
  createOrUpdateCivicIssue,
  processCivicIssueGrouping
};
