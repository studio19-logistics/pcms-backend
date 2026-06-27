const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../services/activitylogger');

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

router.get('/team-members', async (req, res) => {
  const { data, error } = await supabase.from('team_members').select('*').order('name')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.get('/', requireAuth, async (req, res) => {
  const { status, owner_id, architect_id } = req.query;
  let query = supabase.from('projects').select('*, architects(company_name), team_members(name, email)').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (owner_id) query = query.eq('owner_id', owner_id);
  if (architect_id) query = query.eq('architect_id', architect_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const normalized = data.map(project => ({
    ...project,
    architects: Array.isArray(project.architects) ? project.architects[0] : project.architects,
    team_members: Array.isArray(project.team_members) ? project.team_members[0] : project.team_members,
  }));
  res.json(normalized);
});

router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('projects').select('*, architects(*, architect_pocs(*)), team_members(name, email)').eq('id', req.params.id).single();
  if (error) return res.status(500).json({ error: error.message });
  const normalized = {
    ...data,
    architects: Array.isArray(data.architects) ? data.architects[0] : data.architects,
    team_members: Array.isArray(data.team_members) ? data.team_members[0] : data.team_members,
  };
  res.json(normalized);
});

router.post('/', requireAuth, async (req, res) => {
  const body = cleanPayload(req.body, ['project_name', 'project_value']);
  const { project_name, architect_id, owner_id, project_value, po_number, po_date, status } = body;
  if (!project_name || !project_value) {
    return res.status(400).json({ error: 'project_name and project_value are required' });
  }
  const { data, error } = await supabase.from('projects').insert([{
    project_name, architect_id, owner_id: owner_id || null,
    project_value, po_number, po_date, status: status || 'active'
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('project_created', 'project', data.id, project_name, null, 'System');
  res.json(data);
});

router.put('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('projects').select('project_name').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  const body = cleanPayload(req.body, ['project_name', 'project_value']);
  const { project_name, architect_id, po_number, po_date, project_value, status, owner_id } = body;

  if (status === 'completed') {
    const { data: milestones } = await supabase.from('payment_milestones').select('id, status').eq('project_id', req.params.id)
    const unpaid = (milestones || []).filter(m => m.status !== 'paid')
    if (unpaid.length > 0) {
      return res.status(400).json({ error: `Cannot mark project as completed — ${unpaid.length} milestone(s) are still unpaid.` })
    }
  }

  const updates = { project_name, architect_id, po_number, po_date, project_value, status, owner_id };
  const { data, error } = await supabase.from('projects').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('project_updated', 'project', data.id, project_name || existing.project_name, null, 'System', { status });
  res.json(data);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('projects').select('project_name').eq('id', req.params.id).single();
  const { error } = await supabase.from('projects').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('project_deleted', 'project', req.params.id, existing?.project_name, null, 'System');
  res.json({ success: true });
});

module.exports = router;
