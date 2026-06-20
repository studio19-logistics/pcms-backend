const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Everyone (any logged-in user) can view all clients + their contacts.
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('clients')
    .select('*, client_contacts(*)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('clients')
    .select('*, client_contacts(*)')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Any authenticated standard user can create a client (per the doc:
// "everyone sees everything" extends to client creation being open,
// only edit/delete is restricted to creator+admin).
router.post('/', requireAuth, async (req, res) => {
  const { company_name, gst_number, company_address, industry, website, contacts } = req.body;
  if (!company_name) return res.status(400).json({ error: 'Company name is required' });

  const { data: client, error } = await supabase
    .from('clients')
    .insert([{
      company_name,
      gst_number,
      company_address,
      industry,
      website,
      created_by: req.profile.id
    }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Optionally create contacts in the same request
  if (Array.isArray(contacts) && contacts.length > 0) {
    const contactRows = contacts.map(c => ({ ...c, client_id: client.id }));
    const { error: contactError } = await supabase.from('client_contacts').insert(contactRows);
    if (contactError) return res.status(500).json({ error: contactError.message });
  }

  res.json(client);
});

// Only the creator or an admin can edit a client.
router.put('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from('clients').select('created_by').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Client not found' });

  const isOwner = existing.created_by === req.profile.id;
  if (!isOwner && req.profile.role !== 'admin') {
    return res.status(403).json({ error: "You can only edit clients you created" });
  }

  const { company_name, gst_number, company_address, industry, website } = req.body;
  const { data, error } = await supabase
    .from('clients')
    .update({ company_name, gst_number, company_address, industry, website })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Delete is admin-only per the doc ("Cannot: Delete projects" for standard
// users — same philosophy applies to clients).
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { error } = await supabase.from('clients').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ---- Contacts sub-resource ----

router.post('/:id/contacts', requireAuth, async (req, res) => {
  const { poc_name, designation, email, phone_number, mobile_number, is_primary } = req.body;
  if (!poc_name) return res.status(400).json({ error: 'Contact name is required' });

  const { data, error } = await supabase
    .from('client_contacts')
    .insert([{
      client_id: req.params.id,
      poc_name, designation, email, phone_number, mobile_number,
      is_primary: !!is_primary
    }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/contacts/:contactId', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('client_contacts')
    .delete()
    .eq('id', req.params.contactId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
