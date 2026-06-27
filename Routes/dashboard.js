const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

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
    .sort((a, b) => b.amount - a.amount);

  const { data: recentlyCollected, error: rcError } = await supabase
    .from('payment_milestones')
    .select('*, projects(project_name, architects(company_name))')
    .eq('status', 'paid')
    .order('actual_payment_date', { ascending: false })
    .limit(10);
  if (rcError) return res.status(500).json({ error: rcError.message });

  const normalizedRecent = recentlyCollected.map(m => {
    const project = Array.isArray(m.projects) ? m.projects[0] : m.projects;
    const architect = Array.isArray(project?.architects) ? project.architects[0] : project?.architects;
    return {
      ...m,
      project_name: project?.project_name,
      architect_name: architect?.company_name,
    };
  });

  res.json({ due_today: dueToday, upcoming, overdue, recently_collected: normalizedRecent });
});

router.get('/kpis', requireAuth, async (req, res) => {
  const { data: projects, error: projError } = await supabase
    .from('projects').select('status, project_value');
  if (projError) return res.status(500).json({ error: projError.message });

  const { data: milestones, error: msError } = await supabase
    .from('payment_milestones_live').select('amount, status, live_status');
  if (msError) return res.status(500).json({ error: msError.message });

  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const totalValue = projects.reduce((sum, p) => sum + Number(p.project_value), 0);
  const received = milestones.filter(m => m.status === 'paid').reduce((sum, m) => sum + Number(m.amount), 0);
  const outstanding = milestones.filter(m => m.status !== 'paid').reduce((sum, m) => sum + Number(m.amount), 0);
  const overdueAmount = milestones.filter(m => m.live_status === 'overdue').reduce((sum, m) => sum + Number(m.amount), 0);

  res.json({
    total_projects: totalProjects,
    active_projects: activeProjects,
    total_project_value: totalValue,
    amount_received: received,
    outstanding_amount: outstanding,
    overdue_amount: overdueAmount,
    payments_due_today: milestones.filter(m => m.live_status === 'due_today').length,
    payments_overdue: milestones.filter(m => m.live_status === 'overdue').length,
    payments_due_this_week: milestones.filter(m => m.live_status === 'upcoming').length,
  });
});

// People-wise analytics: per team_member owner, project + collection stats
router.get('/people', requireAuth, async (req, res) => {
  const { data: owners, error: ownerError } = await supabase.from('team_members').select('id, name, email').order('name');
  if (ownerError) return res.status(500).json({ error: ownerError.message });

  const { data: projects, error: projError } = await supabase
    .from('projects').select('id, owner_id, status, project_value');
  if (projError) return res.status(500).json({ error: projError.message });

  const { data: milestones, error: msError } = await supabase
    .from('payment_milestones_live').select('amount, status, owner_id');
  if (msError) return res.status(500).json({ error: msError.message });

  const result = owners.map(owner => {
    const ownerProjects = projects.filter(p => p.owner_id === owner.id);
    const ownerMilestones = milestones.filter(m => m.owner_id === owner.id);
    const totalValue = ownerProjects.reduce((sum, p) => sum + Number(p.project_value), 0);
    const received = ownerMilestones.filter(m => m.status === 'paid').reduce((sum, m) => sum + Number(m.amount), 0);
    const outstanding = ownerMilestones.filter(m => m.status !== 'paid').reduce((sum, m) => sum + Number(m.amount), 0);
    const collectionPct = totalValue > 0 ? Math.round((received / totalValue) * 10000) / 100 : 0;

    return {
      owner_id: owner.id,
      owner_name: owner.name,
      owner_email: owner.email,
      total_projects: ownerProjects.length,
      active_projects: ownerProjects.filter(p => p.status === 'active').length,
      completed_projects: ownerProjects.filter(p => p.status === 'completed').length,
      total_project_value: totalValue,
      amount_received: received,
      outstanding_amount: outstanding,
      collection_percentage: collectionPct,
    };
  });

  res.json(result);
});

router.get('/activity', requireAuth, async (req, res) => {
  const limit = parseInt(req.query.limit) || 50
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router;
