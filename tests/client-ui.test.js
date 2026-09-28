const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { escapeHtml } = require('../public/escape-html.js');

test('navigation et copilote présents', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const js = fs.readFileSync('public/app.js', 'utf8');
  assert.match(html, /id="sideNav"/);
  assert.match(html, /id="mainContent"/);
  assert.match(html, /id="copilotPanel"/);
  for (const name of ['Contacts', 'Entreprises', 'Transactions', 'Tableaux de bord']) {
    assert.ok(js.includes(name));
  }
  assert.ok(js.indexOf('Contacts') < js.indexOf('Entreprises'));
  assert.ok(js.indexOf('Entreprises') < js.indexOf('Transactions'));
});

test('les données externes ne deviennent pas du HTML', () => {
  assert.equal(escapeHtml('"><img src=x onerror=alert(1)>'), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
});

test('assistant en simulation avec actions futures désactivées', () => {
  const js = fs.readFileSync('public/copilot-ui.js', 'utf8');
  assert.match(js, /Résumé/);
  assert.match(js, /Comment faire/);
  assert.match(js, /Bientôt disponible/);
  assert.match(js, /Recharger \(simulation\)/);
});

test('une ancienne réponse Transactions ne remplace pas les Pages sélectionnées', async () => {
  let resolveTransactions;
  const waiting = new Promise((resolve) => { resolveTransactions = resolve; });
  const main = { innerHTML: '' };
  const elements = new Map();
  const element = (id) => {
    if (id === 'mainContent') return main;
    if (!elements.has(id)) elements.set(id, { textContent: '', className: '', classList: { toggle() {} } });
    return elements.get(id);
  };
  const answer = (body) => ({ ok: true, json: async () => body });
  const context = {
    location: { search: '?clientId=p1' }, URLSearchParams, encodeURIComponent,
    document: { getElementById: element },
    fetch: (url) => {
      if (url === '/api/admin/clients') return new Promise(() => {});
      if (url.startsWith('/api/transactions')) return waiting;
      if (url.startsWith('/api/landing-pages')) return Promise.resolve(answer({ demoMode: true, items: [], note: 'Pages d’exemple' }));
      throw new Error(`Lecture imprévue : ${url}`);
    },
    esc: escapeHtml, renderCopilot() {},
    TransactionView: { render() { main.innerHTML = 'Anciennes transactions'; } },
    LandingPagesView: { render() { main.innerHTML = 'Pages sélectionnées'; } },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('public/app.js', 'utf8'), context);
  vm.runInContext(`activeClient = { id: 'p1', nom: 'Profil', secteur: 'E-commerce', crmExistant: 'aucun',
    modules: { transactions: 'demo', pagesDestination: 'demo' } };
    currentOverview = { demoMode: true }; activeView = 'transactions';`, context);
  const old = vm.runInContext('load()', context);
  vm.runInContext("activeView = 'pagesDestination'", context);
  await vm.runInContext('load()', context);
  resolveTransactions(answer({ demoMode: true, items: [], funnel: [] }));
  await old;
  assert.equal(main.innerHTML, 'Pages sélectionnées');
});

test('pages fictives : un overview LIVE tardif ne modifie pas le badge DÉMO', async () => {
  let resolveOverview;
  const waiting = new Promise((resolve) => { resolveOverview = resolve; });
  const main = { innerHTML: '' };
  const elements = new Map();
  const element = (id) => {
    if (id === 'mainContent') return main;
    if (!elements.has(id)) elements.set(id, {
      textContent: '', className: '', classList: { toggle() {} },
    });
    return elements.get(id);
  };
  const answer = (body) => ({ ok: true, json: async () => body });
  const context = {
    location: { search: '?clientId=p1' }, URLSearchParams, encodeURIComponent,
    document: { getElementById: element },
    fetch: (url) => {
      if (url === '/api/admin/clients') return new Promise(() => {});
      if (url.startsWith('/api/overview')) return waiting;
      if (url.startsWith('/api/landing-pages')) {
        return Promise.resolve(answer({ demoMode: true, source: 'hubspot', note: 'Pages fictives', items: [] }));
      }
      throw new Error(`Lecture imprévue : ${url}`);
    },
    esc: escapeHtml, renderCopilot() {},
    LandingPagesView: { render() { main.innerHTML = 'Pages DÉMO'; } },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('public/app.js', 'utf8'), context);
  vm.runInContext(`activeClient = { id: 'p1', nom: 'Profil', secteur: 'E-commerce', crmExistant: 'hubspot',
    modules: { pagesDestination: 'actif' } }; activeView = 'pagesDestination';`, context);
  const loading = vm.runInContext('load()', context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(main.innerHTML, 'Pages DÉMO');
  assert.equal(element('modeBadge').textContent, 'DÉMO · HubSpot');
  resolveOverview(answer({ demoMode: false, sourceLabel: 'HubSpot' }));
  await loading;
  assert.equal(element('modeBadge').textContent, 'DÉMO · HubSpot');
  assert.equal(element('moduleBadge').textContent, 'Actif');
});

test('le secteur précède le briefing et échappe le texte externe', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  assert.ok(html.includes('const sectorHtml = sector'));
  assert.ok(html.indexOf('${sectorHtml}') < html.indexOf('<div class="briefing">', html.indexOf('const sectorHtml')));
  assert.ok(html.includes('esc(sector.objectif)'));
  assert.ok(html.includes('esc(sector.besoin)'));
  assert.ok(html.includes('sector.modulesCles.map(label => `<span>${esc(label)}</span>`)'));
  for (const file of ['transaction-view.js', 'reminders-view.js', 'landing-pages-view.js']) {
    assert.ok(html.includes(`src="/${file}"`));
  }
});