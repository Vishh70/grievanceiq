-- docs/database/phase11_google_auth.sql

-- Add fields for Google authentication
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local',
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Allow password_hash to be null for Google users, or we can just give them a random hash.
-- We will just give them a random hash so we don't need to alter the constraint if there is one.
-- But let's alter the table to be safe in case we want to support null passwords.
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;

-- Update existing users to have auth_provider 'local' and email_verified true if they are already registered
UPDATE public.users SET auth_provider = 'local', email_verified = true WHERE auth_provider IS NULL;
