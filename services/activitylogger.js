const supabase = require('./supabase')

async function logActivity(action, entityType, entityId, entityName, performedBy, performedByName, metadata = {}) {
  try {
    await supabase.from('activity_log').insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      performed_by: performedBy,
      performed_by_name: performedByName,
      metadata,
    })
  } catch (err) {
    // Never let logging failures break the main request
    console.log('Activity log error:', err.message)
  }
}

module.exports = { logActivity }