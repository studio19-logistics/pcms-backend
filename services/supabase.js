const { createClient } = require('@supabase/supabase-js');

// Backend uses the SERVICE ROLE key, not the anon key.
// This lets Express enforce its own authorization logic (role checks,
// ownership checks) on top of / instead of relying purely on RLS,
// which matters for things like the reminder engine and admin actions
// that need to read/write across all rows regardless of who's "logged in"
// at the DB layer (there is no DB-layer session for a cron job).
//
// IMPORTANT: never expose SUPABASE_SERVICE_ROLE_KEY to the frontend.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;
