-- Phase 10: Multilabel Issue Classification Support
-- Adds persistence for the trained Python ML inference outputs to the complaints table.

ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS ml_labels TEXT[],
ADD COLUMN IF NOT EXISTS ml_probabilities JSONB,
ADD COLUMN IF NOT EXISTS ml_departments TEXT[];

-- Optional: Create an index for querying complaints by ML label
CREATE INDEX IF NOT EXISTS idx_complaints_ml_labels ON complaints USING GIN (ml_labels);
