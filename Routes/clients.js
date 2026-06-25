const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../services/activitylogger');

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('clients').select('*, client_contacts(*)').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('clients').select('*, client_contacts(*)').eq('id', req.params.id).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', requireAuth, async (req, res) => {
  const { company_name, gst_number, company_address, industry, website, contacts } = req.body;
  if (!company_name) return res.status(400).json({ error: 'Company name is required' });
  const { data: client, error } = await supabase.from('clients').insert([{ company_name, gst_number, company_address, industry, website, created_by: req.profile.id }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (Array.isArray(contacts) && contacts.length > 0) {
    const contactRows = contacts.map(c => ({ ...c, client_id: client.id }));
    const { error: contactError } = await supabase.from('client_contacts').insert(contactRows);
    if (contactError) return res.status(500).json({ error: contactError.message });
  }
  await logActivity('client_created', 'client', client.id, company_name, req.profile.id, req.profile.full_name);
  res.json(client);
});

router.put('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('clients').select('created_by, company_name').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  const isOwner = existing.created_by === req.profile.id;
  if (!isOwner && req.profile.role !== 'admin') return res.status(403).json({ error: 'You can only edit clients you created' });
  const { company_name, gst_number, company_address, industry, website } = req.body;
  const { data, error } = await supabase.from('clients').update({ company_name, gst_number, company_address, industry, website }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('client_updated', 'client', data.id, company_name || existing.company_name, req.profile.id, req.profile.full_name);
  res.json(data);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { data: existing } = await supabase.from('clients').select('company_name').eq('id', req.params.id).single();
  const { error } = await supabase.from('clients').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('client_deleted', 'client', req.params.id, existing?.company_name, req.profile.id, req.profile.full_name);
  res.json({ success: true });
});

router.post('/:id/contacts', requireAuth, async (req, res) => {
  const { poc_name, designation, email, phone_number, mobile_number, is_primary } = req.body;
  if (!poc_name) return res.status(400).json({ error: 'Contact name is required' });
  const { data, error } = await supabase.from('client_contacts').insert([{ client_id: req.params.id, poc_name, designation, email, phone_number, mobile_number, is_primary: !!is_primary }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('contact_added', 'client', req.params.id, poc_name, req.profile.id, req.profile.full_name);
  res.json(data);
});

router.delete('/contacts/:contactId', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('client_contacts').select('poc_name, client_id').eq('id', req.params.contactId).single();
  const { error } = await supabase.from('client_contacts').delete().eq('id', req.params.contactId);
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('contact_deleted', 'client', existing?.client_id, existing?.poc_name, req.profile.id, req.profile.full_name);
  res.json({ success: true });
});

module.exports = router;