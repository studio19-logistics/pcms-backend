async function requireAuth(req, res, next) {
  req.profile = { id: 'system', full_name: 'System', role: 'admin' }
  next()
}

function requireAdmin(req, res, next) {
  next()
}

module.exports = { requireAuth, requireAdmin }