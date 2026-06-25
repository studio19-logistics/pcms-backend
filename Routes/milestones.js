const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../services/activityLogger');

async function canEditInvoice(invoiceId, profile) {
  if (profile.role === 'admin') return true;
  const { data } = await supabase.from('invoices').select('project_id, projects(owner_id)').eq('id', invoiceId).single();
  const ownerId = Array.isArray(data?.projects) ? data.projects[0]?.owner_id : data?.projects?.owner_id;
  return ownerId === profile.id;
}

router.get('/invoice/:invoiceId', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('payment_milestones').select('*').eq('invoice_id', req.params.invoiceId).order('sort_order', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/invoice/:invoiceId', requireAuth, async (req, res) => {
  const { milestones } = req.body;
  if (!Array.isArray(milestones) || milestones.length === 0) return res.status(400).json({ error: 'At least one milestone is required' });
  const allowed = await canEditInvoice(req.params.invoiceId, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only edit milestones on invoices under your own projects' });
  const totalPercentage = milestones.reduce((sum, m) => sum + Number(m.percentage || 0), 0);
  if (Math.abs(totalPercentage - 100) > 0.01) return res.status(400).json({ error: `Milestone percentages must total 100%. Currently: ${totalPercentage.toFixed(2)}%` });
  const { data: invoice } = await supabase.from('invoices').select('invoice_value, invoice_number').eq('id', req.params.invoiceId).single();
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const { error: deleteError } = await supabase.from('payment_milestones').delete().eq('invoice_id', req.params.invoiceId);
  if (deleteError) return res.status(500).json({ error: deleteError.message });
  const rows = milestones.map((m, index) => ({ invoice_id: req.params.invoiceId, stage_name: m.stage_name, stage_type: m.stage_type || 'custom', percentage: m.percentage, amount: Math.round((invoice.invoice_value * m.percentage / 100) * 100) / 100, expected_date: m.expected_date, status: m.status || 'pending', sort_order: index }));
  const { data, error } = await supabase.from('payment_milestones').insert(rows).select();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('milestones_updated', 'invoice', req.params.invoiceId, invoice.invoice_number, req.profile.id, req.profile.full_name, { count: milestones.length });
  res.json(data);
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status, actual_payment_date } = req.body;
  if (!['pending', 'paid', 'overdue'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const { data: milestone } = await supabase.from('payment_milestones').select('invoice_id, stage_name').eq('id', req.params.id).single();
  if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
  const allowed = await canEditInvoice(milestone.invoice_id, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only update milestones on your own projects' });
  const updates = { status };
  if (status === 'paid') {
    updates.actual_payment_date = actual_payment_date || new Date().toISOString().slice(0, 10);
  } else {
    updates.actual_payment_date = null;
  }
  const { data, error } = await supabase.from('payment_milestones').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity(`milestone_marked_${status}`, 'milestone', data.id, milestone.stage_name, req.profile.id, req.profile.full_name, { invoice_id: milestone.invoice_id, amount: data.amount });
  res.json(data);
});

router.patch('/:id/snooze', requireAuth, async (req, res) => {
  const { days } = req.body;
  if (!days || typeof days !== 'number' || days < 1 || days > 30) return res.status(400).json({ error: 'days must be a number between 1 and 30' });
  const { data: milestone } = await supabase.from('payment_milestones').select('invoice_id, stage_name').eq('id', req.params.id).single();
  if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
  const allowed = await canEditInvoice(milestone.invoice_id, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only snooze milestones on your own projects' });
  const snoozedUntil = new Date();
  snoozedUntil.setDate(snoozedUntil.getDate() + days);
  const snoozedUntilStr = snoozedUntil.toISOString().slice(0, 10);
  const { data, error } = await supabase.from('payment_milestones').update({ snoozed_until: snoozedUntilStr }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('milestone_snoozed', 'milestone', data.id, milestone.stage_name, req.profile.id, req.profile.full_name, { snoozed_until: snoozedUntilStr, days });
  res.json(data);
});

router.patch('/:id/unsnooze', requireAuth, async (req, res) => {
  const { data: milestone } = await supabase.from('payment_milestones').select('invoice_id, stage_name').eq('id', req.params.id).single();
  if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
  const allowed = await canEditInvoice(milestone.invoice_id, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only unsnooze milestones on your own projects' });
  const { data, error } = await supabase.from('payment_milestones').update({ snoozed_until: null }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('milestone_unsnoozed', 'milestone', data.id, milestone.stage_name, req.profile.id, req.profile.full_name);
  res.json(data);
});

module.exports = router;