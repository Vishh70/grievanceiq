const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/[\s"]/g, '');
// The backend needs service_role permissions to bypass RLS for internal tables like civic_issues, tasks, etc.
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '').replace(/[\s"]/g, '');

if (!supabaseUrl || !supabaseKey) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ CRITICAL: Supabase URL or Key is missing in production environment.');
    process.exit(1);
  } else {
    console.warn('⚠️ Supabase URL or Key is missing. Using placeholder for local dev/tests.');
  }
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseKey || 'placeholder-key'
);

module.exports = supabase;
