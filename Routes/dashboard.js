const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

// Single endpoint that returns all four Collections Dashboard sections
// at once, since the frontend renders them together on one page.
// Pulls from payment_milestones_live (defined in the schema), which
// computes overdue/due_today/upcoming fresh on every query instead of
// relying on a cron job to have updated a status column.
router.get('/collections', requireAuth, async (req, res) => {
  const { data: rows, error } = await supabase
    .from('payment_milestones_live')
    .select('*')
    .neq('status', 'paid');
  if (error) return res.status(500).json({ error: error.message });

  const dueToday = rows.filter(r => r.live_status === 'due_today');
  const upcoming = rows.filter(r => r.live_status === 'upcoming')
    .sort((a, b) => new Date(a.expected_date) - new Date(b.expected_date));
  const overdue = rows.filter(r => r.live_status === 'overdue')
    .sort((a, b) => b.amount - a.amount); // highest amount first, per the doc

  const { data: recentlyCollected, error: rcError } = await supabase
    .from('payment_milestones')
    .select('*, projects(project_name, clients(company_name))')
    .eq('status', 'paid')
    .order('actual_payment_date', { ascending: false })
    .limit(10);
  if (rcError) return res.status(500).json({ error: rcError.message });

  res.json({
    due_today: dueToday,
    upcoming,
    overdue,
    recently_collected: recentlyCollected
  });
});

// KPI cards for the main dashboard.
router.get('/kpis', requireAuth, async (req, res) => {
  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select('status, project_value');
  if (projError) return res.status(500).json({ error: projError.message });

  const { data: milestones, error: msError } = await supabase
    .from('payment_milestones_live')
    .select('amount, status, live_status');
  if (msError) return res.status(500).json({ error: msError.message });

  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const totalValue = projects.reduce((sum, p) => sum + Number(p.project_value), 0);

  const received = milestones.filter(m => m.status === 'paid')
    .reduce((sum, m) => sum + Number(m.amount), 0);
  const outstanding = milestones.filter(m => m.status !== 'paid')
    .reduce((sum, m) => sum + Number(m.amount), 0);
  const overdueAmount = milestones.filter(m => m.live_status === 'overdue')
    .reduce((sum, m) => sum + Number(m.amount), 0);

  const paymentsDueToday = milestones.filter(m => m.live_status === 'due_today').length;
  const paymentsOverdue = milestones.filter(m => m.live_status === 'overdue').length;
  const paymentsDueThisWeek = milestones.filter(m => m.live_status === 'upcoming').length;

  res.json({
    total_projects: totalProjects,
    active_projects: activeProjects,
    total_project_value: totalValue,
    amount_received: received,
    outstanding_amount: outstanding,
    overdue_amount: overdueAmount,
    payments_due_today: paymentsDueToday,
    payments_overdue: paymentsOverdue,
    payments_due_this_week: paymentsDueThisWeek
  });
});

module.exports = router;
