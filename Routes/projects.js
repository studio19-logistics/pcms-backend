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
  const { status, owner_id, client_id } = req.query;
  let query = supabase.from('projects').select('*, clients(company_name), team_members(name, email)').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (owner_id) query = query.eq('owner_id', owner_id);
  if (client_id) query = query.eq('client_id', client_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const normalized = data.map(project => ({
    ...project,
    clients: Array.isArray(project.clients) ? project.clients[0] : project.clients,
    team_members: Array.isArray(project.team_members) ? project.team_members[0] : project.team_members,
  }));
  res.json(normalized);
});

router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('projects').select('*, clients(*), team_members(name, email)').eq('id', req.params.id).single();
  if (error) return res.status(500).json({ error: error.message });
  const normalized = {
    ...data,
    clients: Array.isArray(data.clients) ? data.clients[0] : data.clients,
    team_members: Array.isArray(data.team_members) ? data.team_members[0] : data.team_members,
  };
  res.json(normalized);
});

router.post('/', requireAuth, async (req, res) => {
  const body = cleanPayload(req.body, ['project_name', 'client_id', 'project_value']);
  const { project_name, client_id, po_number, po_date, invoice_number, invoice_date, project_value, order_date, owner_id, status } = body;
  if (!project_name || !client_id || !project_value) {
    return res.status(400).json({ error: 'project_name, client_id and project_value are required' });
  }
  const { data, error } = await supabase.from('projects').insert([{
    project_name, client_id, po_number, po_date, invoice_number, invoice_date,
    project_value, order_date, owner_id: owner_id || null, status: status || 'active'
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('project_created', 'project', data.id, project_name, null, 'System');
  res.json(data);
});

router.put('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('projects').select('project_name').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  const body = cleanPayload(req.body, ['project_name', 'project_value']);
  const { project_name, client_id, po_number, po_date, invoice_number, invoice_date, project_value, order_date, status, owner_id } = body;

  if (status === 'completed') {
    const { data: invoices } = await supabase.from('invoices').select('id, payment_milestones(id, status)').eq('project_id', req.params.id)
    const unpaid = invoices?.flatMap(inv => (inv.payment_milestones || []).filter(m => m.status !== 'paid')) || []
    if (unpaid.length > 0) {
      return res.status(400).json({ error: `Cannot mark project as completed — ${unpaid.length} milestone(s) are still unpaid.` })
    }
  }

  const updates = { project_name, client_id, po_number, po_date, invoice_number, invoice_date, project_value, order_date, status, owner_id };
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