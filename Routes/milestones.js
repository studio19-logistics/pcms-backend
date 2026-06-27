const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../services/activitylogger');

router.get('/project/:projectId', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('payment_milestones').select('*, invoices(*)').eq('project_id', req.params.projectId).order('sort_order', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/project/:projectId', requireAuth, async (req, res) => {
  const { milestones } = req.body;
  if (!Array.isArray(milestones) || milestones.length === 0) return res.status(400).json({ error: 'At least one milestone is required' });

  const totalPercentage = milestones.reduce((sum, m) => sum + Number(m.percentage || 0), 0);
  if (Math.abs(totalPercentage - 100) > 0.01) return res.status(400).json({ error: `Milestone percentages must total 100%. Currently: ${totalPercentage.toFixed(2)}%` });

  const { data: project } = await supabase.from('projects').select('project_value, project_name').eq('id', req.params.projectId).single();
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Immutability guard: once any invoice exists against this project's
  // milestones, the structure can no longer be wiped and rebuilt — doing so
  // would orphan those invoices (their milestone_id would dangle).
  const { data: existingMilestones } = await supabase.from('payment_milestones').select('id').eq('project_id', req.params.projectId);
  const existingIds = (existingMilestones || []).map(m => m.id);
  if (existingIds.length > 0) {
    const { count, error: countError } = await supabase
      .from('invoices').select('id', { count: 'exact', head: true }).in('milestone_id', existingIds);
    if (countError) return res.status(500).json({ error: countError.message });
    if (count > 0) {
      return res.status(400).json({ error: 'Payment terms cannot be modified after invoices have been created. Please complete the existing workflow or create a new project if the payment structure has fundamentally changed.' });
    }
  }

  const { error: deleteError } = await supabase.from('payment_milestones').delete().eq('project_id', req.params.projectId);
  if (deleteError) return res.status(500).json({ error: deleteError.message });

  const rows = milestones.map((m, index) => ({
    project_id: req.params.projectId,
    stage_name: m.stage_name,
    stage_type: m.stage_type || 'custom',
    percentage: m.percentage,
    amount: Math.round((project.project_value * m.percentage / 100) * 100) / 100,
    expected_date: m.expected_date,
    status: m.status || 'pending',
    sort_order: index
  }));
  const { data, error } = await supabase.from('payment_milestones').insert(rows).select();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('milestones_updated', 'project', req.params.projectId, project.project_name, req.profile.id, req.profile.full_name, { count: milestones.length });
  res.json(data);
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status, actual_payment_date } = req.body;
  if (!['pending', 'paid'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const { data: milestone } = await supabase.from('payment_milestones').select('stage_name, project_id').eq('id', req.params.id).single();
  if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
  const updates = { status };
  updates.actual_payment_date = status === 'paid' ? (actual_payment_date || new Date().toISOString().slice(0, 10)) : null;
  const { data, error } = await supabase.from('payment_milestones').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity(`milestone_marked_${status}`, 'milestone', data.id, milestone.stage_name, req.profile.id, req.profile.full_name, { project_id: milestone.project_id, amount: data.amount });
  res.json(data);
});

router.patch('/:id/snooze', requireAuth, async (req, res) => {
  const { days } = req.body;
  if (!days || typeof days !== 'number' || days < 1 || days > 30) return res.status(400).json({ error: 'days must be a number between 1 and 30' });
  const { data: milestone } = await supabase.from('payment_milestones').select('stage_name').eq('id', req.params.id).single();
  if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
  const snoozedUntil = new Date();
  snoozedUntil.setDate(snoozedUntil.getDate() + days);
  const snoozedUntilStr = snoozedUntil.toISOString().slice(0, 10);
  const { data, error } = await supabase.from('payment_milestones').update({ snoozed_until: snoozedUntilStr }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('milestone_snoozed', 'milestone', data.id, milestone.stage_name, req.profile.id, req.profile.full_name, { snoozed_until: snoozedUntilStr, days });
  res.json(data);
});

router.patch('/:id/unsnooze', requireAuth, async (req, res) => {
  const { data: milestone } = await supabase.from('payment_milestones').select('stage_name').eq('id', req.params.id).single();
  if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
  const { data, error } = await supabase.from('payment_milestones').update({ snoozed_until: null }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('milestone_unsnoozed', 'milestone', data.id, milestone.stage_name, req.profile.id, req.profile.full_name);
  res.json(data);
});

module.exports = router;