const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

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

// Sum of all existing invoices under a project, optionally excluding
// one invoice (used when editing, so the invoice being edited doesn't
// count against itself).
async function getInvoicedTotal(projectId, excludeInvoiceId = null) {
  let query = supabase.from('invoices').select('invoice_value').eq('project_id', projectId);
  if (excludeInvoiceId) query = query.neq('id', excludeInvoiceId);
  const { data } = await query;
  return (data || []).reduce((sum, inv) => sum + Number(inv.invoice_value), 0);
}

// All invoices under a project, each with its own milestones attached
// so the frontend can render the full project → invoices → milestones
// tree in one request.
router.get('/project/:projectId', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, payment_milestones(*)')
    .eq('project_id', req.params.projectId)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Tells the frontend how much of the project's value is still free to
// invoice, so the Add Invoice form can show a live "remaining" figure
// the same way the milestone builder shows a running percentage total.
router.get('/project/:projectId/remaining', requireAuth, async (req, res) => {
  const { data: project } = await supabase
    .from('projects').select('project_value').eq('id', req.params.projectId).single();
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const invoicedTotal = await getInvoicedTotal(req.params.projectId);
  res.json({
    project_value: project.project_value,
    invoiced_total: invoicedTotal,
    remaining: project.project_value - invoicedTotal,
  });
});

// Create a new invoice under a project — this is what happens each
// time a shipment goes out and a new invoice is raised against the PO.
// Only the project's owner or an admin can add invoices to it. The
// invoice's value cannot push the project's total invoiced amount
// above the project's overall value — an invoice represents part of
// the PO, never more than the whole PO.
router.post('/project/:projectId', requireAuth, async (req, res) => {
  const { invoice_number, invoice_date, invoice_value } = req.body;
  if (!invoice_number || !invoice_value) {
    return res.status(400).json({ error: 'invoice_number and invoice_value are required' });
  }

  const allowed = await canEditProject(req.params.projectId, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only add invoices to your own projects' });

  const { data: project } = await supabase
    .from('projects').select('project_value').eq('id', req.params.projectId).single();
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const invoicedTotal = await getInvoicedTotal(req.params.projectId);
  const remaining = project.project_value - invoicedTotal;
  if (Number(invoice_value) > remaining + 0.01) {
    return res.status(400).json({
      error: `Invoice value exceeds what's left to invoice on this PO. Remaining: ₹${remaining.toLocaleString('en-IN')}`
    });
  }

  const { data, error } = await supabase
    .from('invoices')
    .insert([{
      project_id: req.params.projectId,
      invoice_number,
      invoice_date: clean(invoice_date),
      invoice_value,
      created_by: req.profile.id,
    }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('invoices').select('project_id, invoice_value').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });

  const allowed = await canEditProject(existing.project_id, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only edit invoices on your own projects' });

  const { invoice_number, invoice_date, invoice_value } = req.body;

  if (invoice_value !== undefined && Number(invoice_value) !== Number(existing.invoice_value)) {
    const { data: project } = await supabase
      .from('projects').select('project_value').eq('id', existing.project_id).single();
    const invoicedTotal = await getInvoicedTotal(existing.project_id, req.params.id);
    const remaining = project.project_value - invoicedTotal;
    if (Number(invoice_value) > remaining + 0.01) {
      return res.status(400).json({
        error: `Invoice value exceeds what's left to invoice on this PO. Remaining: ₹${remaining.toLocaleString('en-IN')}`
      });
    }
  }

  const { data, error } = await supabase
    .from('invoices')
    .update({
      invoice_number,
      invoice_date: clean(invoice_date),
      invoice_value,
    })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Deleting an invoice cascades to its milestones (per the schema's
// on delete cascade) — same owner/admin rule as everything else.
router.delete('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('invoices').select('project_id').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });

  const allowed = await canEditProject(existing.project_id, req.profile);
  if (!allowed) return res.status(403).json({ error: 'You can only delete invoices on your own projects' });

  const { error } = await supabase.from('invoices').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;