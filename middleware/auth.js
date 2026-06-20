const supabase = require('../services/supabase');

// Verifies the Supabase access token sent from the frontend
// (Authorization: Bearer <token>) and attaches req.user + req.profile.
// req.profile.role is what route handlers use to decide
// "is this an admin action" vs "standard user, own-row only".
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    return res.status(403).json({ error: 'No profile found for this user' });
  }

  if (!profile.is_active) {
    return res.status(403).json({ error: 'Account disabled' });
  }

  req.user = userData.user;
  req.profile = profile;
  next();
}

// Use after requireAuth — blocks the route unless role === 'admin'.
function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
