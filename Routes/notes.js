const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../services/activitylogger');

function normalizeAuthor(row) {
  return { ...row, user_profiles: Array.isArray(row.user_profiles) ? row.user_profiles[0] : row.user_profiles };
}

router.get('/project/:projectId', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('project_notes').select('*, user_profiles(full_name)').eq('project_id', req.params.projectId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(normalizeAuthor));
});

router.post('/project/:projectId', requireAuth, async (req, res) => {
  const { note } = req.body;
  if (!note || !note.trim()) return res.status(400).json({ error: 'Note text is required' });
  const { data, error } = await supabase.from('project_notes').insert([{ project_id: req.params.projectId, note: note.trim() }]).select('*, user_profiles(full_name)').single();
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('project_note_added', 'project', req.params.projectId, note.trim().slice(0, 50), req.profile.id, req.profile.full_name);
  res.json(normalizeAuthor(data));
});

router.delete('/project-note/:noteId', requireAuth, async (req, res) => {
  const { data: existing } = await supabase.from('project_notes').select('author_id, project_id').eq('id', req.params.noteId).single();
  if (!existing) return res.status(404).json({ error: 'Note not found' });
  const { error } = await supabase.from('project_notes').delete().eq('id', req.params.noteId);
  if (error) return res.status(500).json({ error: error.message });
  await logActivity('project_note_deleted', 'project', existing.project_id, null, req.profile.id, req.profile.full_name);
  res.json({ success: true });
});

module.exports = router;