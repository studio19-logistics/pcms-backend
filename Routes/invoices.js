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

router.get('/milestone/:milestoneId', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('invoices').select('*').eq('milestone_id', req.params.milestoneId).order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/milestone/:milestoneId', requireAuth, async (req, res) => {
  const { invoice_number, invoice_date, invoice_value, due_date } = req.body;
  if (!invoice_number || !invoice_value) return res.status(400).json({ error: 'invoice_number and invoice_value are required' });
  const { data: milestone } = await supabase.from('payment_milestones').select('id, stage_name').eq('id', req.params.milestoneId).single();
  if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
  const { data, error } = await supabase.from('invoices').insert([{
    milestone_id: req.params.milestoneId, invoice_number, invoice_date: clean(invoice_date),
    invoice_value, due_date: clean(due_date), payment_status: 'Pending', created_by: req.profile.id
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('invoice_created', 'invoice', data.id, invoice_number, req.profile.id, req.profile.full_name, { milestone_id: req.params.milestoneId, invoice_value });
  res.json(data);
});

router.put('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('invoices').select('milestone_id').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });
  const { invoice_number, invoice_date, invoice_value, due_date } = req.body;
  const { data, error } = await supabase.from('invoices').update({
    invoice_number, invoice_date: clean(invoice_date), invoice_value, due_date: clean(due_date)
  }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('invoice_updated', 'invoice', data.id, invoice_number, req.profile.id, req.profile.full_name, { milestone_id: existing.milestone_id });
  res.json(data);
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const { payment_status } = req.body;
  if (!['Pending', 'Paid'].includes(payment_status)) return res.status(400).json({ error: 'Invalid payment_status' });
  const { data: existing } = await supabase.from('invoices').select('invoice_number, milestone_id').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });
  const { data, error } = await supabase.from('invoices').update({ payment_status }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity(`invoice_marked_${payment_status.toLowerCase()}`, 'invoice', data.id, existing.invoice_number, req.profile.id, req.profile.full_name, { milestone_id: existing.milestone_id });
  res.json(data);
});

router.patch('/:id/snooze', requireAuth, async (req, res) => {
  const { days } = req.body;
  if (!days || typeof days !== 'number' || days < 1 || days > 30) return res.status(400).json({ error: 'days must be a number between 1 and 30' });
  const { data: invoice } = await supabase.from('invoices').select('invoice_number').eq('id', req.params.id).single();
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const snoozedUntil = new Date();
  snoozedUntil.setDate(snoozedUntil.getDate() + days);
  const snoozedUntilStr = snoozedUntil.toISOString().slice(0, 10);
  const { data, error } = await supabase.from('invoices').update({ snoozed_until: snoozedUntilStr }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('invoice_snoozed', 'invoice', data.id, invoice.invoice_number, req.profile.id, req.profile.full_name, { snoozed_until: snoozedUntilStr, days });
  res.json(data);
});

router.patch('/:id/unsnooze', requireAuth, async (req, res) => {
  const { data: invoice } = await supabase.from('invoices').select('invoice_number').eq('id', req.params.id).single();
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const { data, error } = await supabase.from('invoices').update({ snoozed_until: null }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('invoice_unsnoozed', 'invoice', data.id, invoice.invoice_number, req.profile.id, req.profile.full_name);
  res.json(data);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('invoices').select('milestone_id, invoice_number').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });
  const { error } = await supabase.from('invoices').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('invoice_deleted', 'invoice', req.params.id, existing.invoice_number, req.profile.id, req.profile.full_name, { milestone_id: existing.milestone_id });
  res.json({ success: true });
});

module.exports = router;
