const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../services/activityLogger');

function clean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

function cleanPayload(obj, skip = []) {
  const result = {};
  for (const key of Object.keys(obj)) {
    result[key] = skip.includes(key) ? obj[key] : clean(obj[key]);
  }
  return result;
}

router.get('/', requireAuth, async (req, res) => {
  const { status, owner_id, client_id } = req.query;
  let query = supabase.from('projects').select('*, clients(company_name), user_profiles(full_name)').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (owner_id) query = query.eq('owner_id', owner_id);
  if (client_id) query = query.eq('client_id', client_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const normalized = data.map(project => ({
    ...project,
    clients: Array.isArray(project.clients) ? project.clients[0] : project.clients,
    user_profiles: Array.isArray(project.user_profiles) ? project.user_profiles[0] : project.user_profiles,
  }));
  res.json(normalized);
});

router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('projects').select('*, clients(*), user_profiles(full_name)').eq('id', req.params.id).single();
  if (error) return res.status(500).json({ error: error.message });
  const normalized = {
    ...data,
    clients: Array.isArray(data.clients) ? data.clients[0] : data.clients,
    user_profiles: Array.isArray(data.user_profiles) ? data.user_profiles[0] : data.user_profiles,
  };
  res.json(normalized);
});

router.post('/', requireAuth, async (req, res) => {
  const body = cleanPayload(req.body, ['project_name', 'client_id', 'project_value']);
  const { project_name, client_id, po_number, po_date, invoice_number, invoice_date, project_value, order_date, owner_id, status } = body;
  if (!project_name || !client_id || !project_value) {
    return res.status(400).json({ error: 'project_name, client_id and project_value are required' });
  }
  const isAdmin = req.profile.role === 'admin';
  const finalOwnerId = isAdmin && owner_id ? owner_id : req.profile.id;
  const { data, error } = await supabase.from('projects').insert([{ project_name, client_id, po_number, po_date, invoice_number, invoice_date, project_value, order_date, owner_id: finalOwnerId, status: status || 'active' }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('project_created', 'project', data.id, project_name, req.profile.id, req.profile.full_name);
  res.json(data);
});

router.put('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('projects').select('owner_id, project_name').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  const isOwner = existing.owner_id === req.profile.id;
  const isAdmin = req.profile.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'You can only edit your own projects' });
  const body = cleanPayload(req.body, ['project_name', 'project_value']);
  const { project_name, client_id, po_number, po_date, invoice_number, invoice_date, project_value, order_date, status, owner_id } = body;
  const updates = { project_name, client_id, po_number, po_date, invoice_number, invoice_date, project_value, order_date, status };
  if (isAdmin && owner_id) updates.owner_id = owner_id;
  const { data, error } = await supabase.from('projects').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('project_updated', 'project', data.id, project_name || existing.project_name, req.profile.id, req.profile.full_name, { status });
  res.json(data);
});

router.patch('/:id/reassign', requireAuth, requireAdmin, async (req, res) => {
  const { owner_id } = req.body;
  if (!owner_id) return res.status(400).json({ error: 'owner_id is required' });
  const { data, error } = await supabase.from('projects').update({ owner_id }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('project_reassigned', 'project', data.id, data.project_name, req.profile.id, req.profile.full_name, { new_owner_id: owner_id });
  res.json(data);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { data: existing } = await supabase.from('projects').select('project_name').eq('id', req.params.id).single();
  const { error } = await supabase.from('projects').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('project_deleted', 'project', req.params.id, existing?.project_name, req.profile.id, req.profile.full_name);
  res.json({ success: true });
});

module.exports = router;