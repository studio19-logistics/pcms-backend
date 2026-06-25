const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../services/activityLogger');

function clean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

async function canEditProject(projectId, profile) {
  if (profile.role === 'admin') return true;
  const { data } = await supabase.from('projects').select('owner_id').eq('id', projectId).single();
  return data?.owner_id === profile.id;
}

async function getInvoicedTotal(projectId, excludeInvoiceId = null) {
  let query = supabase.from('invoices').select('invoice_value').eq('project_id', projectId);
  if (excludeInvoiceId) query = query.neq('id', excludeInvoiceId);
  const { data } = await query;
  return (data || []).reduce((sum, inv) => sum + Number(inv.invoice_value), 0);
}

router.get('/project/:projectId', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('invoices').select('*, payment_milestones(*)').eq('project_id', req.params.projectId).order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/project/:projectId/remaining', requireAuth, async (req, res) => {
  const { data: project } = await supabase.from('projects').select('project_value').eq('id', req.params.projectId).single();
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const invoicedTotal = await getInvoicedTotal(req.params.projectId);
  res.json({ project_value: project.project_value, invoiced_total: invoicedTotal, remaining: project.project_value - invoicedTotal });
});

router.post('/project/:projectId', requireAuth, async (req, res) => {
  const { invoice_number, invoice_date, invoice_value } = req.body;
  if (!invoice_number || !invoice_value) return res.status(400).json({ error: 'invoice_number and invoice_value are required' });
  const allowed = await canEditProject(req.params.projectId, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only add invoices to your own projects' });
  const { data: project } = await supabase.from('projects').select('project_value').eq('id', req.params.projectId).single();
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const invoicedTotal = await getInvoicedTotal(req.params.projectId);
  const remaining = project.project_value - invoicedTotal;
  if (Number(invoice_value) > remaining + 0.01) return res.status(400).json({ error: `Invoice value exceeds what's left to invoice on this PO. Remaining: ₹${remaining.toLocaleString('en-IN')}` });
  const { data, error } = await supabase.from('invoices').insert([{ project_id: req.params.projectId, invoice_number, invoice_date: clean(invoice_date), invoice_value, created_by: req.profile.id }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('invoice_created', 'invoice', data.id, invoice_number, req.profile.id, req.profile.full_name, { project_id: req.params.projectId, invoice_value });
  res.json(data);
});

router.put('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('invoices').select('project_id, invoice_value').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });
  const allowed = await canEditProject(existing.project_id, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only edit invoices on your own projects' });
  const { invoice_number, invoice_date, invoice_value } = req.body;
  if (invoice_value !== undefined && Number(invoice_value) !== Number(existing.invoice_value)) {
    const { data: project } = await supabase.from('projects').select('project_value').eq('id', existing.project_id).single();
    const invoicedTotal = await getInvoicedTotal(existing.project_id, req.params.id);
    const remaining = project.project_value - invoicedTotal;
    if (Number(invoice_value) > remaining + 0.01) return res.status(400).json({ error: `Invoice value exceeds what's left to invoice on this PO. Remaining: ₹${remaining.toLocaleString('en-IN')}` });
  }
  const { data, error } = await supabase.from('invoices').update({ invoice_number, invoice_date: clean(invoice_date), invoice_value }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('invoice_updated', 'invoice', data.id, invoice_number, req.profile.id, req.profile.full_name, { project_id: existing.project_id });
  res.json(data);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('invoices').select('project_id, invoice_number').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });
  const allowed = await canEditProject(existing.project_id, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only delete invoices on your own projects' });
  const { error } = await supabase.from('invoices').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('invoice_deleted', 'invoice', req.params.id, existing.invoice_number, req.profile.id, req.profile.full_name, { project_id: existing.project_id });
  res.json({ success: true });
});

module.exports = router;