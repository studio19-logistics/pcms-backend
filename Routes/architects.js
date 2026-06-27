const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../services/activitylogger');

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('architects').select('*, architect_pocs(*)').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('architects').select('*, architect_pocs(*)').eq('id', req.params.id).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', requireAuth, async (req, res) => {
  const { company_name, gst_number, company_address, industry, website, pocs } = req.body;
  if (!company_name) return res.status(400).json({ error: 'Company name is required' });
  const { data: architect, error } = await supabase.from('architects').insert([{ company_name, gst_number, company_address, industry, website, created_by: req.profile.id }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (Array.isArray(pocs) && pocs.length > 0) {
    const pocRows = pocs.map(p => ({ ...p, architect_id: architect.id }));
    const { error: pocError } = await supabase.from('architect_pocs').insert(pocRows);
    if (pocError) return res.status(500).json({ error: pocError.message });
  }
  await logActivity('architect_created', 'architect', architect.id, company_name, req.profile.id, req.profile.full_name);
  res.json(architect);
});

router.put('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('architects').select('company_name').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Architect/PMC not found' });
  const { company_name, gst_number, company_address, industry, website } = req.body;
  const { data, error } = await supabase.from('architects').update({ company_name, gst_number, company_address, industry, website }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('architect_updated', 'architect', data.id, company_name || existing.company_name, req.profile.id, req.profile.full_name);
  res.json(data);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('architects').select('company_name').eq('id', req.params.id).single();
  const { error } = await supabase.from('architects').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('architect_deleted', 'architect', req.params.id, existing?.company_name, req.profile.id, req.profile.full_name);
  res.json({ success: true });
});

router.post('/:id/pocs', requireAuth, async (req, res) => {
  const { poc_name, designation, email, phone_number, mobile_number, is_primary } = req.body;
  if (!poc_name) return res.status(400).json({ error: 'POC name is required' });
  const { data, error } = await supabase.from('architect_pocs').insert([{ architect_id: req.params.id, poc_name, designation, email, phone_number, mobile_number, is_primary: !!is_primary }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('poc_added', 'architect', req.params.id, poc_name, req.profile.id, req.profile.full_name);
  res.json(data);
});

router.delete('/pocs/:pocId', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('architect_pocs').select('poc_name, architect_id').eq('id', req.params.pocId).single();
  const { error } = await supabase.from('architect_pocs').delete().eq('id', req.params.pocId);
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('poc_deleted', 'architect', existing?.architect_id, existing?.poc_name, req.profile.id, req.profile.full_name);
  res.json({ success: true });
});

module.exports = router;
