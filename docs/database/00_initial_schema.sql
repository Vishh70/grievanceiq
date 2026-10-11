-- ============================================================================
-- GrievanceIQ Database Migration: Step 0 - Initial Baseline Schema
-- Creates foundational tables: users, complaints
-- Required prerequisite before applying incremental migrations (Phases 1 - 13)
-- Uses native PostgreSQL 13+ gen_random_uuid() for primary key generation
-- ============================================================================

-- 1. Create users table
-- Houses citizen and administrative user accounts authenticated via custom JWT
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT, -- Nullable to accommodate Google OAuth federated users
  phone TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'citizen' CHECK (role IN ('citizen', 'admin', 'officer')),
  civic_points INTEGER DEFAULT 0,
  badges JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for authentication lookup by email
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- 2. Create complaints table
-- Core entity for all citizen reports before incremental AI/routing augmentations
CREATE TABLE IF NOT EXISTS public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citizen_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'Pending',
  location_address TEXT DEFAULT '',
  location_lat NUMERIC(10, 6),
  location_lng NUMERIC(10, 6),
  image_url TEXT DEFAULT '',
  image_base64 TEXT DEFAULT '',
  upvotes INTEGER DEFAULT 0,
  upvoted_by JSONB DEFAULT '[]'::jsonb,
  severity_score NUMERIC,
  safety_hazards TEXT[] DEFAULT '{}',
  suggested_action TEXT,
  department_id TEXT,
  similar_group_id UUID,
  keywords TEXT[] DEFAULT '{}',
  ai_processed BOOLEAN DEFAULT false,
  ai_duplicate_flag BOOLEAN DEFAULT false,
  status_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for frequent queries and filtering
CREATE INDEX IF NOT EXISTS idx_complaints_citizen_id ON public.complaints(citizen_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON public.complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON public.complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_similar_group_id ON public.complaints(similar_group_id);

-- 3. Row-Level Security (RLS) Enablement
-- GrievanceIQ backend accesses Supabase via service_role key, which bypasses RLS.
-- RLS is enabled by default to prevent unauthorized direct PostgREST client access.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- Comments for documentation
COMMENT ON TABLE public.users IS 'Citizen and municipal operator accounts managed via application JWT';
COMMENT ON TABLE public.complaints IS 'Primary citizen grievance records and workflow metadata';
