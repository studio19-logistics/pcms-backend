const express = require('express');
const cors = require('cors');
require('dotenv').config();

const clientRoutes = require('./Routes/clients');
const projectRoutes = require('./Routes/projects');
const invoiceRoutes = require('./Routes/invoices');
const milestoneRoutes = require('./Routes/milestones');
const notesRoutes = require('./Routes/notes');
const dashboardRoutes = require('./Routes/dashboard');

const remindersRoutes = require('./Routes/reminders');
const app = express();
const PORT = process.env.PORT || 3001;


app.use(cors());

// Log every incoming request before anything else touches it.
// If a request never prints here, it never reached this server at all
// (wrong port, wrong URL, CORS preflight blocked, network issue, etc).
app.use((req, res, next) => {
  console.log(`>>> ${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.json());

// If the request body is malformed JSON, express.json() throws before
// any route handler runs. Without this, that error vanishes silently —
// no console output, no response, the request just hangs or fails with
// no explanation. This catches it and logs + responds properly.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    console.log('!!! JSON parse error on', req.method, req.originalUrl, '-', err.message);
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }
  next(err);
});

app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reminders', remindersRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'PCMS backend is running' });
});

// Catch-all 404 — anything that reaches here matched no route at all.
app.use((req, res) => {
  console.log('!!! 404 NO ROUTE MATCHED:', req.method, req.originalUrl);
  res.status(404).json({ error: 'Route not found' });
});

// Final safety net — catches any error thrown anywhere in any route
// that wasn't already handled, so it always logs + responds instead
// of silently failing.
app.use((err, req, res, next) => {
  console.log('!!! UNHANDLED ERROR:', err.message);
  console.log(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('PCMS backend running on port ' + PORT);
});
