const { sourceForClient } = require('./client-store');

function resolveClientSource({ clientId, source } = {}, store) {
  if (clientId !== undefined) {
    const client = store.get(clientId);
    return { client, source: sourceForClient(client) };
  }
  const selected = typeof source === 'string' ? source.toLowerCase() : 'hubspot';
  if (!['hubspot', 'odoo', 'crm-basique'].includes(selected)) {
    throw Object.assign(new Error('Source inconnue.'), { status: 400 });
  }
  return { client: null, source: selected };
}

function sendError(res, error) {
  res.status(error.status || 500).json({ error: error.message || 'Erreur interne.' });
}

function registerAdminRoutes(app, store) {
  app.get('/api/admin/clients', (req, res) => {
    try { res.json(store.list()); } catch (error) { sendError(res, error); }
  });
  app.post('/api/admin/clients', (req, res) => {
    try { res.status(201).json(store.create(req.body)); } catch (error) { sendError(res, error); }
  });
  app.put('/api/admin/clients/:id', (req, res) => {
    try { res.json(store.update(req.params.id, req.body)); } catch (error) { sendError(res, error); }
  });
  app.delete('/api/admin/clients/:id', (req, res) => {
    try { store.remove(req.params.id); res.json({ ok: true }); } catch (error) { sendError(res, error); }
  });
}

module.exports = { resolveClientSource, registerAdminRoutes, sendError };