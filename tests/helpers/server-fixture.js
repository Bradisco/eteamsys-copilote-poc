const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createClientStore } = require('../../lib/client-store');

const root = path.resolve(__dirname, '../..');

async function freePort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  socket.close();
  await once(socket, 'close');
  return port;
}

async function startServer(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-phase2-'));
  fs.mkdirSync(path.join(dir, 'data'));
  fs.copyFileSync(path.join(root, 'server.js'), path.join(dir, 'server.js'));
  fs.copyFileSync(path.join(root, 'data/crm-basique.seed.json'), path.join(dir, 'data/crm-basique.json'));
  fs.symlinkSync(path.join(root, 'lib'), path.join(dir, 'lib'));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  const file = path.join(dir, 'data/crm-basique.json');
  const store = createClientStore(path.join(dir, 'data/clients.json'));
  const active = store.create({ nom: 'CRM actif', secteur: 'E-commerce', modules: { transactions: 'actif', emailsMarketing: 'actif', pagesDestination: 'actif' } });
  const demo = store.create({ nom: 'CRM aperçu', secteur: 'Artisans / TPE locales' });
  const disabled = store.create({ nom: 'CRM désactivé', modules: { transactions: 'non-applicable', emailsMarketing: 'non-applicable', pagesDestination: 'non-applicable' } });
  const hubspot = store.create({ nom: 'HubSpot aperçu', crmExistant: 'hubspot' });
  const odoo = store.create({ nom: 'Odoo aperçu', crmExistant: 'odoo' });
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(dir, 'server.js')], {
    env: {
      ...process.env, PORT: String(port), ANTHROPIC_API_KEY: '', HUBSPOT_TOKEN: '',
      ODOO_URL: '', ODOO_DB: '', ODOO_USERNAME: '', ODOO_PASSWORD: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${base}/api/admin/clients`);
      if (response.ok) { ready = true; break; }
    } catch (_) { /* attend le serveur */ }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(ready, `Le serveur isolé doit démarrer : ${stderr}`);
  return {
    base, active, demo, disabled, hubspot, odoo, file,
    readCrm: () => JSON.parse(fs.readFileSync(file, 'utf8')),
    updateCrm: (data) => fs.writeFileSync(file, JSON.stringify(data)),
  };
}

async function postJson(base, url, body, method = 'POST') {
  return fetch(`${base}${url}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

module.exports = { startServer, postJson };