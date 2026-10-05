// src/services/civicIssueService.js
const supabase = require('../config/supabase');
const complaintGraphService = require('./complaintGraphService');
const { predictRelationship } = require('./relationshipService');
const knowledgeGraphService = require('./knowledgeGraphService');
const routingService = require('./routingService');
const relationshipPersistenceService = require('./relationshipPersistenceService');

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

  let complaintIds = componentComplaints.map(c => c.id);
  const title = generateCivicIssueTitle(componentComplaints);
  const location = calculateRepresentativeLocation(componentComplaints);
  const priority = aggregatePriority(componentComplaints);
  const primaryCategory = componentComplaints[0].category || 'Other';

  // Check if any of these complaints already belong to a civic issue
  const existingIssueIds = [...new Set(componentComplaints.map(c => c.civic_issue_id).filter(Boolean))];
  
  let issueIdToUse = null;
  let mergedIssues = [];

  if (existingIssueIds.length > 0) {
    if (existingIssueIds.length === 1) {
      issueIdToUse = existingIssueIds[0];
    } else {
      // Deterministic Merge Policy
      // Rank by size, priority, created_at, id
      try {
        const { data: issues } = await supabase
          .from('civic_issues')
          .select('*')
          .in('id', existingIssueIds);
          
        if (issues && issues.length > 0) {
          const priorityVal = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
          
          issues.sort((a, b) => {
            const aLen = (a.complaint_ids || []).length;
            const bLen = (b.complaint_ids || []).length;
            if (aLen !== bLen) return bLen - aLen; 
            
            const aPrio = priorityVal[a.priority] || 0;
            const bPrio = priorityVal[b.priority] || 0;
            if (aPrio !== bPrio) return bPrio - aPrio; 
            
            const aTime = new Date(a.created_at || 0).getTime();
            const bTime = new Date(b.created_at || 0).getTime();
            if (aTime !== bTime) return aTime - bTime; 
            
            return a.id.localeCompare(b.id); 
          });
          
          const survivor = issues[0];
          issueIdToUse = survivor.id;
          
          mergedIssues = issues.slice(1).map(i => i.id);
          
          // Preserve all existing complaint IDs from the merged issues and the survivor
          const allExistingComplaintIds = issues.flatMap(i => i.complaint_ids || []);
          complaintIds.push(...allExistingComplaintIds);
          // Remove duplicates
          complaintIds = [...new Set(complaintIds)];
        } else {
          throw new Error('Deterministic merge query returned no valid issues for the provided IDs.');
        }
      } catch (err) {
        console.error('Failed to fetch existing civic issues for merge:', err.message);
        throw new Error(`Failed to fetch existing civic issues for merge: ${err.message}`);
      }
    }
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
      const { error: repointErr } = await supabase
        .from('complaints')
        .update({ civic_issue_id: savedIssue.id })
        .in('id', complaintIds);
        
      if (repointErr) {
        throw new Error(`Failed to repoint complaints to merged issue: ${repointErr.message}`);
      }
        
      // Update merged issues to show they were merged
      if (mergedIssues.length > 0) {
        const { error: mergeStatusErr } = await supabase
          .from('civic_issues')
          .update({ 
            status: 'Merged',
            merged_into_id: savedIssue.id
          })
          .in('id', mergedIssues);
          
        if (mergeStatusErr) {
          throw new Error(`Failed to mark losing issues as merged: ${mergeStatusErr.message}`);
        }
      }
    }

    return savedIssue;
  } catch (error) {
    console.error('Failed to save Civic Issue:', error.message);
    throw new Error(`Failed to save Civic Issue: ${error.message}`);
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
  const edges = [];
  candidates = candidates || [];
  
  // Predict relationships between the new complaint and all candidates
  for (const cand of candidates) {
    try {
      const result = await predictRelationship(newComplaint, cand);
      if (result && result.relationship) {
        let relationshipType = result.relationship;
        let reason = null;

        if (relationshipType === 'Related') {
          const kgRelation = knowledgeGraphService.findRelationship(newComplaint.category, cand.category);
          if (kgRelation) {
            reason = `${newComplaint.category} ${kgRelation} ${cand.category}`;
            console.log(`[Knowledge Graph] relationship = Related, reason/domain relation: ${reason}`);
          }
        }

        edges.push({
          sourceId: newComplaint.id,
          targetId: cand.id,
          relationship: relationshipType,
          reason: reason
        });
        if (relationshipType === 'Related' || relationshipType === 'Duplicate') {
          await relationshipPersistenceService.upsertRelationship(
            newComplaint.id,
            cand.id,
            relationshipType,
            result.confidence || 0,
            reason
          );
        }
      }
    } catch (err) {
      console.error(`Relationship prediction failed for candidate ${cand.id}:`, err.message);
      throw new Error(`Relationship prediction failed: ${err.message}`);
    }
  }

  // Build the graph and find components
  const allComplaints = [newComplaint, ...candidates];
  const graphService = new (require('./complaintGraphService').ComplaintGraphService)();
  graphService.buildGraph(allComplaints, edges);
  
  const components = graphService.findConnectedComponents();
  
  // We process the component that contains the new complaint
  for (const compIds of components) {
    if (compIds.includes(newComplaint.id)) {
      const compData = compIds.map(id => allComplaints.find(c => c.id === id)).filter(Boolean);
      const savedIssue = await createOrUpdateCivicIssue(compData);
      if (savedIssue) {
        console.log(`[CivicRouting] Automatically routing Civic Issue ${savedIssue.id}`);
        try {
          await routingService.routeCivicIssue(savedIssue.id);
        } catch (routeErr) {
          console.error(`[CivicRouting] Failed to automatically route Civic Issue ${savedIssue.id}:`, routeErr.message);
          throw new Error(`Civic Issue Routing failed: ${routeErr.message}`);
        }
      }
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
