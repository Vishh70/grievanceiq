const supabase = require('../config/supabase');

/**
 * Service to persist accepted complaint relationships to the database.
 */
class RelationshipPersistenceService {
  /**
   * Upsert a relationship into the database.
   * Ensures canonical ordering of IDs (source_complaint_id < target_complaint_id)
   * 
   * @param {string} compId1 
   * @param {string} compId2 
   * @param {string} relationshipType 
   * @param {number} confidence 
   * @param {string} reason 
   */
  async upsertRelationship(compId1, compId2, relationshipType, confidence, reason) {
    // Canonical ordering
    let sourceId, targetId;
    if (compId1 < compId2) {
      sourceId = compId1;
      targetId = compId2;
    } else {
      sourceId = compId2;
      targetId = compId1;
    }

    try {
      const { data, error } = await supabase
        .from('complaint_relationships')
        .upsert(
          {
            source_complaint_id: sourceId,
            target_complaint_id: targetId,
            relationship_type: relationshipType,
            confidence: confidence,
            reason: reason
          },
          { onConflict: 'source_complaint_id, target_complaint_id' }
        )
        .select()
        .single();

      if (error) {
        console.error(`[RelationshipPersistence] Failed to persist ${relationshipType} edge between ${sourceId} and ${targetId}:`, error.message);
        return null;
      }

      console.log(`[RelationshipPersistence] Persisted ${relationshipType} edge between ${sourceId} and ${targetId}`);
      return data;
    } catch (err) {
      console.error(`[RelationshipPersistence] Exception persisting edge:`, err.message);
      return null;
    }
  }

  /**
   * Fetch all relationships for a given complaint ID
   * @param {string} complaintId 
   */
  async getRelationshipsForComplaint(complaintId) {
    try {
      const { data, error } = await supabase
        .from('complaint_relationships')
        .select('*')
        .or(`source_complaint_id.eq.${complaintId},target_complaint_id.eq.${complaintId}`);
        
      if (error) {
        console.error(`[RelationshipPersistence] Failed to fetch relationships for ${complaintId}:`, error.message);
        return [];
      }
      return data;
    } catch (err) {
      console.error(`[RelationshipPersistence] Exception fetching relationships:`, err.message);
      return [];
    }
  }
}

module.exports = new RelationshipPersistenceService();
