const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createClientStore } = require('../lib/client-store');

const root = path.join(__dirname, '..');

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  return port;
}

async function withServer(t, mode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-copilot-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'data'));
  fs.copyFileSync(path.join(root, 'server.js'), path.join(dir, 'server.js'));
  fs.copyFileSync(path.join(root, 'data', 'crm-basique.seed.json'), path.join(dir, 'data', 'crm-basique.json'));
  fs.symlinkSync(path.join(root, 'lib'), path.join(dir, 'lib'));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  const store = createClientStore(path.join(dir, 'data', 'clients.json'));
  const client = store.create({ nom: 'Profil isolé', credits: { solde: 2 } });
  const port = await freePort();
  const preloader = path.join(dir, 'mock-fetch.js');
  fs.writeFileSync(preloader, `
    global.fetch = async (url) => {
      if (url !== 'https://api.anthropic.com/v1/messages') throw new Error('Appel externe inattendu');
      return process.env.MOCK_MODE === 'error'
        ? new Response('Indisponible', { status: 503 })
        : new Response(JSON.stringify({ content: [{ type: 'text', text: 'Réponse IA du profil.' }] }), { status: 200 });
    };
  `);
  const child = spawn(process.execPath, ['--require', preloader, path.join(dir, 'server.js')], {
    env: {
      ...process.env, PORT: String(port), ANTHROPIC_API_KEY: mode === 'demo' ? '' : 'cle-test',
      HUBSPOT_TOKEN: '', ODOO_URL: '', ODOO_DB: '', ODOO_USERNAME: '', ODOO_PASSWORD: '',
      MOCK_MODE: mode,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${base}/api/copilot/credits?clientId=${client.id}`);
      if (response.ok) { ready = true; break; }
    } catch { /* attend le démarrage du processus */ }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(ready, 'Le serveur de test doit démarrer');
  return { base, client, clientFile: path.join(dir, 'data', 'clients.json') };
}

for (const mode of ['demo', 'success', 'error']) {
  test(`route copilote : ${mode}`, async (t) => {
    const { base, client, clientFile } = await withServer(t, mode);
    const response = await fetch(`${base}/api/copilot/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: client.id, question: 'Fais-moi un résumé' }),
    });
    const result = await response.json();
    if (mode === 'error') {
      assert.equal(response.status, 502);
      assert.match(result.error, /Anthropic/);
      assert.equal(createClientStore(clientFile).get(client.id).credits.solde, 2);
      assert.equal(createClientStore(clientFile).get(client.id).credits.historique.length, client.credits.historique.length);
    } else {
      assert.equal(response.status, 200);
      assert.equal(result.demoMode, mode === 'demo');
      if (mode === 'success') assert.equal(result.answer, 'Réponse IA du profil.');
      else assert.ok(result.answer.length > 0);
      assert.equal(result.credits.solde, 1);
      assert.equal(createClientStore(clientFile).get(client.id).credits.historique.length, client.credits.historique.length + 1);
    }
  });
}