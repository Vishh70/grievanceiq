-- ============================================================================
-- Phase 15 Migration — FR05 Duplicate-Only Incident Identity
-- 
-- FR05 Policy:
-- 1. Connected components and Civic Issue identity are strictly determined
--    by verified 'Duplicate' relationships.
-- 2. 'Related' relationships represent cross-issue causal or operational links
--    (e.g., Water Leakage causing Road Damage) and NEVER merge incidents.
-- 3. Cross-issue related incident links are preserved in complaint_relationships
--    and queryable via v_civic_issue_related_links and get_related_civic_issues().
-- ============================================================================

-- 1. View exposing cross-incident relationships between distinct Civic Issues
CREATE OR REPLACE VIEW public.v_civic_issue_related_links AS
SELECT
  cr.id AS relationship_id,
  c1.civic_issue_id AS source_civic_issue_id,
  ci1.title AS source_civic_issue_title,
  cr.source_complaint_id,
  c2.civic_issue_id AS target_civic_issue_id,
  ci2.title AS target_civic_issue_title,
  cr.target_complaint_id,
  cr.relationship_type,
  cr.confidence,
  cr.reason,
  cr.created_at
FROM public.complaint_relationships cr
JOIN public.complaints c1 ON c1.id = cr.source_complaint_id
JOIN public.complaints c2 ON c2.id = cr.target_complaint_id
JOIN public.civic_issues ci1 ON ci1.id = c1.civic_issue_id
JOIN public.civic_issues ci2 ON ci2.id = c2.civic_issue_id
WHERE cr.relationship_type = 'Related'
  AND c1.civic_issue_id IS NOT NULL
  AND c2.civic_issue_id IS NOT NULL
  AND c1.civic_issue_id != c2.civic_issue_id;

COMMENT ON VIEW public.v_civic_issue_related_links IS 'Exposes cross-issue operational and causal relationships between distinct Civic Issues without merging them.';

-- 2. Stored function to fetch all related Civic Issues for a given issue ID
CREATE OR REPLACE FUNCTION public.get_related_civic_issues(p_civic_issue_id UUID)
RETURNS TABLE (
  related_civic_issue_id UUID,
  related_issue_title TEXT,
  source_complaint_id UUID,
  target_complaint_id UUID,
  relationship_type TEXT,
  confidence NUMERIC,
  reason TEXT
)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT
    CASE 
      WHEN c1.civic_issue_id = p_civic_issue_id THEN c2.civic_issue_id 
      ELSE c1.civic_issue_id 
    END AS related_civic_issue_id,
    ci.title AS related_issue_title,
    cr.source_complaint_id,
    cr.target_complaint_id,
    cr.relationship_type,
    cr.confidence,
    cr.reason
  FROM public.complaint_relationships cr
  JOIN public.complaints c1 ON c1.id = cr.source_complaint_id
  JOIN public.complaints c2 ON c2.id = cr.target_complaint_id
  JOIN public.civic_issues ci ON ci.id = (
    CASE 
      WHEN c1.civic_issue_id = p_civic_issue_id THEN c2.civic_issue_id 
      ELSE c1.civic_issue_id 
    END
  )
  WHERE cr.relationship_type = 'Related'
    AND (c1.civic_issue_id = p_civic_issue_id OR c2.civic_issue_id = p_civic_issue_id)
    AND c1.civic_issue_id IS NOT NULL
    AND c2.civic_issue_id IS NOT NULL
    AND c1.civic_issue_id != c2.civic_issue_id;
$$;

COMMENT ON FUNCTION public.get_related_civic_issues IS 'Returns related Civic Issues linked via Related complaint relationships across incidents.';

-- 3. Audit query function: Identifies Civic Issues that may have been incorrectly grouped
--    using Related edges rather than verified Duplicate edges.
CREATE OR REPLACE FUNCTION public.check_improper_civic_issue_groupings()
RETURNS TABLE (
  civic_issue_id UUID,
  title TEXT,
  complaint_count INTEGER,
  complaint_ids UUID[]
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ci.id AS civic_issue_id,
    ci.title,
    COALESCE(array_length(ci.complaint_ids, 1), 0) AS complaint_count,
    ci.complaint_ids
  FROM public.civic_issues ci
  WHERE ci.status != 'Merged'
    AND array_length(ci.complaint_ids, 1) > 1
    AND NOT EXISTS (
      -- At least one duplicate edge exists within the issue's complaints
      SELECT 1 FROM public.complaint_relationships cr
      WHERE cr.relationship_type = 'Duplicate'
        AND cr.source_complaint_id = ANY(ci.complaint_ids)
        AND cr.target_complaint_id = ANY(ci.complaint_ids)
    );
END;
$$;

COMMENT ON FUNCTION public.check_improper_civic_issue_groupings IS 'Flags multi-complaint Civic Issues that have zero Duplicate edges connecting their constituent complaints.';

