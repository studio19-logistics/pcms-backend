const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

// Helper: confirm the requester owns the project that the invoice
// belongs to (or is admin). Walks invoice -> project -> owner_id.
async function canEditInvoice(invoiceId, profile) {
  if (profile.role === 'admin') return true;
  const { data } = await supabase
    .from('invoices')
    .select('project_id, projects(owner_id)')
    .eq('id', invoiceId)
    .single();
  const ownerId = Array.isArray(data?.projects) ? data.projects[0]?.owner_id : data?.projects?.owner_id;
  return ownerId === profile.id;
}

router.get('/invoice/:invoiceId', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('payment_milestones')
    .select('*')
    .eq('invoice_id', req.params.invoiceId)
    .order('sort_order', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Bulk save — replaces the entire milestone set for ONE INVOICE in one
// call (not the whole project, since a project can have many invoices,
// each with its own independent payment plan). Percentages across this
// invoice's milestone set must total exactly 100% of the invoice's
// value — that's the rule raw SQL can't enforce cleanly, so it lives here.
router.put('/invoice/:invoiceId', requireAuth, async (req, res) => {
  const { milestones } = req.body; // [{ stage_name, stage_type, percentage, expected_date }, ...]
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return res.status(400).json({ error: 'At least one milestone is required' });
  }

  const allowed = await canEditInvoice(req.params.invoiceId, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only edit milestones on invoices under your own projects' });

  const totalPercentage = milestones.reduce((sum, m) => sum + Number(m.percentage || 0), 0);
  // Allow tiny floating point drift (e.g. 33.33 x 3 = 99.99) up to 0.01
  if (Math.abs(totalPercentage - 100) > 0.01) {
    return res.status(400).json({
      error: `Milestone percentages must total 100% of this invoice's value. Currently: ${totalPercentage.toFixed(2)}%`
    });
  }

  const { data: invoice } = await supabase
    .from('invoices').select('invoice_value').eq('id', req.params.invoiceId).single();
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  // Replace strategy: delete existing rows not in the incoming set,
  // then insert fresh. Simpler and safer than diffing for a builder UI
  // where the whole structure is edited together.
  const { error: deleteError } = await supabase
    .from('payment_milestones')
    .delete()
    .eq('invoice_id', req.params.invoiceId);
  if (deleteError) return res.status(500).json({ error: deleteError.message });

  const rows = milestones.map((m, index) => ({
    invoice_id: req.params.invoiceId,
    stage_name: m.stage_name,
    stage_type: m.stage_type || 'custom',
    percentage: m.percentage,
    amount: Math.round((invoice.invoice_value * m.percentage / 100) * 100) / 100, // auto-calculated off invoice value
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

// Mark a single milestone as paid (or revert to pending) — the
// day-to-day action, separate from the full structure rebuild above.
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status, actual_payment_date } = req.body;
  if (!['pending', 'paid', 'overdue'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const { data: milestone } = await supabase
    .from('payment_milestones').select('invoice_id').eq('id', req.params.id).single();
  if (!milestone) return res.status(404).json({ error: 'Milestone not found' });

  const allowed = await canEditInvoice(milestone.invoice_id, req.profile);
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
