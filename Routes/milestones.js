const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

// Helper: confirm the requester owns the parent project (or is admin).
async function canEditProject(projectId, profile) {
  if (profile.role === 'admin') return true;
  const { data } = await supabase.from('projects').select('owner_id').eq('id', projectId).single();
  return data?.owner_id === profile.id;
}

router.get('/project/:projectId', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('payment_milestones')
    .select('*')
    .eq('project_id', req.params.projectId)
    .order('sort_order', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Bulk save — replaces the entire milestone set for a project in one call.
// This is what the "Dynamic Payment Structure Builder" UI calls when the
// user adds/removes/edits stages and hits Save. Percentages across the
// whole set must total exactly 100 — that's the one rule raw SQL can't
// enforce cleanly (it's a cross-row constraint), so it lives here.
router.put('/project/:projectId', requireAuth, async (req, res) => {
  const { milestones } = req.body; // [{ stage_name, stage_type, percentage, expected_date }, ...]
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return res.status(400).json({ error: 'At least one milestone is required' });
  }

  const allowed = await canEditProject(req.params.projectId, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only edit milestones on your own projects' });

  const totalPercentage = milestones.reduce((sum, m) => sum + Number(m.percentage || 0), 0);
  // Allow tiny floating point drift (e.g. 33.33 x 3 = 99.99) up to 0.01
  if (Math.abs(totalPercentage - 100) > 0.01) {
    return res.status(400).json({
      error: `Milestone percentages must total 100%. Currently: ${totalPercentage.toFixed(2)}%`
    });
  }

  const { data: project } = await supabase
    .from('projects').select('project_value').eq('id', req.params.projectId).single();
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Replace strategy: delete existing rows not in the incoming set,
  // then upsert. Simpler and safer than diffing for a builder UI where
  // the whole structure is edited together.
  const { error: deleteError } = await supabase
    .from('payment_milestones')
    .delete()
    .eq('project_id', req.params.projectId);
  if (deleteError) return res.status(500).json({ error: deleteError.message });

  const rows = milestones.map((m, index) => ({
    project_id: req.params.projectId,
    stage_name: m.stage_name,
    stage_type: m.stage_type || 'custom',
    percentage: m.percentage,
    amount: Math.round((project.project_value * m.percentage / 100) * 100) / 100, // auto-calculated
    expected_date: m.expected_date,
    status: m.status || 'pending',
    sort_order: index
  }));

  const { data, error } = await supabase
    .from('payment_milestones')
    .insert(rows)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Mark a single milestone as paid (or revert to pending) — this is the
// day-to-day action, separate from the full structure rebuild above.
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status, actual_payment_date } = req.body;
  if (!['pending', 'paid', 'overdue'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const { data: milestone } = await supabase
    .from('payment_milestones').select('project_id').eq('id', req.params.id).single();
  if (!milestone) return res.status(404).json({ error: 'Milestone not found' });

  const allowed = await canEditProject(milestone.project_id, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only update milestones on your own projects' });

  const updates = { status };
  if (status === 'paid') {
    updates.actual_payment_date = actual_payment_date || new Date().toISOString().slice(0, 10);
  } else {
    updates.actual_payment_date = null;
  }

  const { data, error } = await supabase
    .from('payment_milestones')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
