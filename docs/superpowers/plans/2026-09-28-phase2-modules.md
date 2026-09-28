# Phase 2 Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace four remaining placeholder experiences with working Transactions, read-only relances, read-only landing pages and a sector-aware dashboard.

**Architecture:** The Express server owns CRM normalization, migration and write validation. The existing `opportunities` array remains the sole transaction store; views consume small, source-aware JSON contracts. Separate browser view helpers render the new modules while `public/app.js` retains navigation and request-version control.

**Tech Stack:** Node.js 18+, CommonJS, Express 4, local JSON files, vanilla browser JavaScript and CSS, `node:test`; no new runtime package.

**Spec:** `docs/superpowers/specs/2026-09-28-phase2-modules-design.md`

## Global Constraints

- Preserve every existing contact and opportunity; never replace `data/crm-basique.json` with the seed. Make a distinct backup before the first on-disk migration write.
- Use precisely `initiation`, `offre-envoyee`, `negociation`, `gagne`, `perdu`; visible labels are Initiation, Offre envoyée, Négociation, Won, Lost.
- `opportunities` is the only CRM basique transaction array. Unknown stages and corrupt data fail explicitly, not as empty arrays.
- New write routes require a CRM basique profile with its Transactions module `actif`; `demo` is read-only and `non-applicable` is disabled.
- HubSpot/Odoo transactions and their reminder counters stay read-only; never invent per-stage amounts, contacts or last-contact dates.
- Landing page examples remain clearly marked DÉMO even when the module is `actif`; module status and data provenance are separate.
- Keep the existing briefing, sidebar order, copilote and existing routes functional. No SEO/SEA/GSC connectors, email sending, authentication or payment.
- This is an unprotected internal POC: do not use real client data in fixtures and do not treat the `clientId` check as authorization for public use.

## Review Focus

1. A corrupt CRM JSON file must return an error and remain byte-for-byte unchanged; pin this in Task 1's migration test.
2. A pre-existing backup must never be overwritten; pin this in Task 1's backup-collision test.
3. A `demo` profile sharing the same CRM as an `actif` profile must be unable to change a stage through HTTP; pin this in Task 2's route test.
4. A relance contact with no e-mail must remain in the list but have no clickable mail action; pin this in Task 3's view test.
5. A slow request for an old module must not replace the newly selected view; pin this in Task 5's navigation test.

---

### Task 1: Normalize the existing opportunities without losing data

**Files:**
- Create: `lib/crm-transactions.js` (stage catalog, pure normalization and funnel aggregation).
- Create: `lib/crm-basique-store.js` (safe file loading, backup and atomic migration write).
- Modify: `server.js` (replace the silent fallback in `loadCrmBasique`; share the new funnel aggregation).
- Modify: `data/crm-basique.seed.json` (stage codes and one distinct negotiation example).
- Modify: `data/crm-basique.json` (migrate **through the store**, never by replacing the file with the seed).
- Modify: `.gitignore` (exclude backup copies, not the active JSON).
- Test: `tests/transactions.test.js`.

**Interfaces:**
- Produces: `STAGES` ordered array of `{ id, label }`; `migrateOpportunities(db)` returns `{ data, changed }` with all unknown fields retained; `summarizeOpportunities(opportunities)` returns stage rows `{ id, label, short, count, amount, hasAmount }`; `createCrmBasiqueStore(filePath, seedPath)` returns `{ load, save, backup }`, where `load()` migrates safely, `save(data)` writes atomically and `backup()` creates a uniquely named, non-overwriting copy of the current file.
- Later tasks consume the same stage catalog, the persisted `opportunities`, and the five-row overview funnel.

- [ ] **Step 1: Write failing tests for migration and aggregation.**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrateOpportunities, summarizeOpportunities, STAGES } = require('../lib/crm-transactions');
const { createCrmBasiqueStore } = require('../lib/crm-basique-store');
const root = path.join(__dirname, '..');
test('conserve les entrées et normalise les cinq étapes', () => {
  const original = { contacts: [{ id: 'c1' }], opportunities: [
    { id: 'o1', contactId: 'c1', etape: 'qualifie', montant: 42, dateMaj: '2026-01-01', note: 'préservée' },
    { id: 'o2', contactId: 'c1', etape: 'proposition', montant: null },
  ] };
  const { data, changed } = migrateOpportunities(original);
  assert.equal(changed, true);
  assert.deepEqual(data.opportunities.map(x => x.etape), ['initiation', 'offre-envoyee']);
  assert.equal(data.opportunities[0].note, 'préservée');
  assert.equal(migrateOpportunities(data).changed, false);
  assert.deepEqual(STAGES.map(x => x.id), ['initiation', 'offre-envoyee', 'negociation', 'gagne', 'perdu']);
  assert.equal(summarizeOpportunities(data.opportunities)[0].amount, 42);
  assert.throws(() => migrateOpportunities({ opportunities: [{ etape: 'autre' }] }), /étape/i);
});
```

- [ ] **Step 2: Run `node --test tests/transactions.test.js`; expect a missing-module failure.**
- [ ] **Step 3: Add the small normalization module and wire it into the existing overview.**

```js
const STAGES = [
  { id: 'initiation', label: 'Initiation' }, { id: 'offre-envoyee', label: 'Offre envoyée' },
  { id: 'negociation', label: 'Négociation' }, { id: 'gagne', label: 'Won' },
  { id: 'perdu', label: 'Lost' },
];
const LEGACY = { nouveau: 'initiation', qualifie: 'initiation', proposition: 'offre-envoyee' };
function migrateOpportunities(db) {
  if (!Array.isArray(db.opportunities)) throw new Error('Opportunités invalides.');
  let changed = false;
  const opportunities = db.opportunities.map(entry => {
    const etape = LEGACY[entry.etape] || entry.etape;
    if (!STAGES.some(stage => stage.id === etape)) throw new Error('Étape inconnue.');
    if (etape !== entry.etape) changed = true;
    return { ...entry, etape };
  });
  return { data: { ...db, opportunities }, changed };
}
function summarizeOpportunities(opportunities) {
  return STAGES.map(({ id, label }) => {
    const rows = opportunities.filter(row => row.etape === id);
    const amounts = rows.filter(row => row.montant !== null && row.montant !== undefined &&
      Number.isFinite(Number(row.montant)) && Number(row.montant) >= 0);
    return { id, label, short: label, count: rows.length,
      amount: amounts.reduce((sum, row) => sum + Number(row.montant), 0),
      hasAmount: amounts.length > 0 };
  });
}
```

In `server.js`, use the exported aggregator for `getCrmBasiqueOverview()` instead of `CB_ETAPE_LABELS`/`CB_FUNNEL_ORDER`. Make `loadCrmBasique` delegate to `createCrmBasiqueStore(CRM_BASIQUE_FILE, CRM_BASIQUE_SEED_FILE).load` and `saveCrmBasique` to its `.save`; the store throws on corrupt JSON rather than returning empty contacts. `backup()` creates a unique copy using `fs.writeFileSync(backupPath, originalBytes, { flag: 'wx' })`; if the name exists, choose a new unique name, never overwrite. Write new JSON to a temporary sibling and rename it over the active file only after the backup succeeds. `load()` calls `backup()` once only when legacy stages need migrating; `save(data)` uses the same atomic-write method. Add `data/*.backup-*.json` to `.gitignore`. Do not backfill a fictitious `creeLe`.

- [ ] **Step 4: Add tests for a corrupt file and a pre-existing backup, then run `node --test tests/transactions.test.js`.**

```js
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-migrate-'));
const active = path.join(dir, 'crm-basique.json');
fs.writeFileSync(active, '{invalide');
const store = createCrmBasiqueStore(active, path.join(root, 'data/crm-basique.seed.json'));
assert.throws(() => store.load(), /JSON|invalide/i);
assert.equal(fs.readFileSync(active, 'utf8'), '{invalide');
const oldJson = JSON.stringify({ contacts: [], opportunities: [{ id: 'o1', etape: 'nouveau' }] });
fs.writeFileSync(active, oldJson);
const existing = `${active}.backup-existing.json`;
fs.writeFileSync(existing, 'à garder');
assert.equal(store.load().opportunities[0].etape, 'initiation');
assert.equal(fs.readFileSync(existing, 'utf8'), 'à garder');
const backups = fs.readdirSync(dir).filter(name => name.includes('.backup-'));
assert.equal(backups.length, 2);
assert.ok(backups.some(name => fs.readFileSync(path.join(dir, name), 'utf8') === oldJson));
store.load();
assert.equal(fs.readdirSync(dir).filter(name => name.includes('.backup-')).length, 2);
```

- [ ] **Step 5: Convert stage fields in the seed and add a separate seeded `negociation` example; invoke `store.load()` once on the active JSON so it creates its backup and migrates only existing entries. Run `npm test` and inspect `git diff -- data/` plus the backup file.**
- [ ] **Step 6: Commit only Task 1 files** with `git add .gitignore lib/crm-transactions.js lib/crm-basique-store.js server.js data/crm-basique.seed.json data/crm-basique.json tests/transactions.test.js && git commit -m "Normalize CRM opportunity stages safely"`.

### Task 2: Serve and edit transactions with a source-aware view

**Files:**
- Modify: `server.js` (three routes and source/module checks).
- Modify: `public/app.js` (dispatch, remove the Transactions placeholder and refresh).
- Create: `public/transaction-view.js` (funnel HTML, list, form and stage controls).
- Modify: `public/index.html` (load script before `app.js`; reuse existing funnel styles).
- Test: `tests/transactions.test.js` (API and browser-view cases).

**Interfaces:**
- Consumes: `STAGES`, `summarizeOpportunities()` and the migrated CRM file from Task 1.
- Produces: `GET /api/transactions?clientId=...` as `{ source, demoMode, note, funnel, items, canEdit }`; `POST /api/crm-basique/transactions` as a created row; `PATCH /api/crm-basique/transactions/:id` as the updated row. `window.TransactionView.render(data, client, onChange)` mounts the view and receives a refresh callback.

- [ ] **Step 1: Add failing HTTP tests for reading all three sources and validating writes.**

```js
test('le CRM basique actif crée et change une transaction, demo ne peut pas écrire', async (t) => {
  const { base, active, demo, readCrm } = await startIsolatedServer(t);
  const get = await fetch(`${base}/api/transactions?clientId=${active.id}`);
  assert.equal(get.status, 200);
  assert.deepEqual((await get.json()).funnel.map(x => x.id), STAGES.map(x => x.id));
  const created = await fetch(`${base}/api/crm-basique/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: active.id, contactId: 'c1', titre: 'Devis exemple', montant: 25 }),
  });
  assert.equal(created.status, 201);
  const row = await created.json();
  const denied = await fetch(`${base}/api/crm-basique/transactions/${row.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: demo.id, etape: 'gagne' }),
  });
  assert.equal(denied.status, 403);
  assert.equal(readCrm().opportunities.find(x => x.id === row.id).etape, 'initiation');
  const updated = await fetch(`${base}/api/crm-basique/transactions/${row.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: active.id, etape: 'negociation' }),
  });
  assert.equal(updated.status, 200);
  assert.equal(readCrm().opportunities.find(x => x.id === row.id).etape, 'negociation');
});
```

`startIsolatedServer(t)` is a **test-only** helper in `tests/transactions.test.js`: follow `tests/copilot-route.test.js` lines 13-66 to create a temporary directory, copy `server.js` and the seed, symlink `lib` and `node_modules`, use `createClientStore` to create `active` and `demo` profiles with `modules.transactions` set accordingly, spawn with `ANTHROPIC_API_KEY=''`, `HUBSPOT_TOKEN=''` and all Odoo variables empty, and stop/remove everything in `t.after`. It returns the allocated HTTP `base` and a `readCrm()` that parses the temporary active file. Add separate HTTP assertions for invalid contact/stage/amount and `non-applicable` reads, checking the file is unchanged on failure.

- [ ] **Step 2: Run `node --test tests/transactions.test.js`; expect missing-route failures.**
- [ ] **Step 3: Implement server contracts with explicit validation and shared-source reads.**

```js
function editableBasicProfile(clientId) {
  const client = clientStore.get(clientId);
  if (sourceForClient(client) !== 'crm-basique' || client.modules.transactions !== 'actif') {
    throw Object.assign(new Error('Transactions non modifiables pour ce profil.'), { status: 403 });
  }
  return client;
}
// GET checks modules.transactions !== 'non-applicable'; for basic it returns
// db.opportunities and summarizeOpportunities(db.opportunities), with contact labels.
// For HubSpot/Odoo call getOverviewForSource(source) once and return overview.funnel;
// leave unavailable stage amounts absent. POST validates contactId, titre, optional
// finite nonnegative montant and stage (default initiation); PATCH only stage/dateMaj.
```

- [ ] **Step 4: Implement `TransactionView.render` and the dispatcher in `load()`.**

```js
if (activeView === 'transactions') {
  const data = await getJson(`/api/transactions?clientId=${encodeURIComponent(clientId)}`);
  if (version !== requestVersion) return;
  TransactionView.render(data, activeClient, () => { currentOverview = null; load(true); });
}
// Put <script src="/transaction-view.js" defer></script> before app.js.
// Remove MODULE_DESCRIPTIONS.transactions so an active module gets its active badge.
// Render five existing-style funnel segments, counts and sums, a basic-CRM
// transaction list, and create/stage controls only when data.canEdit is true.
// Wrap the route fetch and writes in try/catch; showMessage on load failure and
// display write errors inline. Use esc() for every external title/contact/error.
```

- [ ] **Step 5: Test visible funnel/controls, 403 feedback, and `non-applicable` read refusal; run `node --test tests/transactions.test.js && npm test`.**
- [ ] **Step 6: Commit Task 2 files** with `git add server.js public/app.js public/index.html public/transaction-view.js tests/transactions.test.js && git commit -m "Add transaction pipeline and CRM editing"`.

### Task 3: Show real basic-CRM reminders without sending mail

**Files:**
- Create: `lib/email-reminders.js` (shared basic contact selection and response assembly).
- Modify: `server.js` (overview count and `GET /api/email-reminders`).
- Modify: `public/app.js` (dedicated view dispatch and remove E-mails placeholder).
- Create: `public/reminders-view.js`.
- Modify: `public/index.html` (include view script).
- Test: `tests/email-reminders.test.js`.

**Interfaces:**
- Produces: `buildBasicReminders(contacts, cutoffISO)` returns rows `{ nom, email, dernierContact, raison }`; `GET /api/email-reminders?clientId=...` returns `{ source, demoMode, asOf, items, counters, note }`. Basic response has `items` and an empty `counters`; HubSpot/Odoo have empty `items` and `overview.relanceItems` as `counters`.

- [ ] **Step 1: Write failing tests for the seven-day rule and absent e-mail.**

```js
const { buildBasicReminders } = require('../lib/email-reminders');
test('lead et qualifié anciens seulement, sans inventer de date ou email', () => {
  const rows = buildBasicReminders([
    { nom: 'A', statut: 'lead', email: '', derniereRelance: null },
    { nom: 'B', statut: 'qualifie', email: 'b@example.com', derniereRelance: '2026-09-01' },
    { nom: 'C', statut: 'client', email: 'c@example.com', derniereRelance: null },
  ], '2026-09-21');
  assert.deepEqual(rows.map(r => r.nom), ['A', 'B']);
  assert.equal(rows[0].dernierContact, null);
  assert.equal(rows[0].email, '');
});
```

- [ ] **Step 2: Run `node --test tests/email-reminders.test.js`; expect missing-module failure.**
- [ ] **Step 3: Use the same helper for the basic overview count and the new route.**

```js
function buildBasicReminders(contacts, cutoffISO) {
  return contacts
    .filter(c => ['lead', 'qualifie'].includes(c.statut) &&
      (!c.derniereRelance || c.derniereRelance < cutoffISO))
    .map(c => ({
      nom: c.nom || '', email: c.email || '',
      dernierContact: c.derniereRelance || null,
      raison: c.derniereRelance ? 'Dernière relance ancienne' : 'Aucune relance enregistrée',
    }));
}
const notRelanced = buildBasicReminders(contacts, daysAgoISO(7));
// GET resolves client/source and modules.emailsMarketing. Basic: return these
// rows and note "Dernier contact connu : dernière relance enregistrée".
// HubSpot/Odoo: await getOverviewForSource(source) once; return only
// overview.relanceItems, with a note that names and individual dates are unavailable.
```

- [ ] **Step 4: Build the read-only table/count view and wire `load()`.**

```js
if (activeView === 'emailsMarketing') {
  const data = await getJson(`/api/email-reminders?clientId=${encodeURIComponent(clientId)}`);
  if (version !== requestVersion) return;
  RemindersView.render(data); // HTML-escape cells; mailto only for nonempty valid email.
}
// Include reminders-view.js before app.js, render columns Nom, E-mail,
// Dernier contact connu and Raison, or only aggregate counter cards.
// Remove MODULE_DESCRIPTIONS.emailsMarketing. On load failure use showMessage;
// no POST, composer, tracking or sending button.
```

- [ ] **Step 5: Test a no-email row without a `mailto:` link, an unknown/disabled profile, and HubSpot/Odoo counters without fabricated rows; run `node --test tests/email-reminders.test.js && npm test`.**
- [ ] **Step 6: Commit Task 3 files** with `git add lib/email-reminders.js server.js public/app.js public/index.html public/reminders-view.js tests/email-reminders.test.js && git commit -m "Show source-aware reminder lists and counts"`.

### Task 4: List example landing pages, with provenance visible

**Files:**
- Create: `lib/landing-pages.js` (source-specific examples and normalized read response).
- Modify: `data/crm-basique.seed.json` and `data/crm-basique.json` (append `landingPages` only if absent).
- Modify: `server.js` (`GET /api/landing-pages` and safe first-time addition to active data).
- Modify: `public/app.js` (remove Pages placeholder); create `public/landing-pages-view.js`; modify `public/index.html`.
- Test: `tests/landing-pages.test.js`.

**Interfaces:**
- Produces: `landingPagesForSource(source, basicData)` returning `{ items, demoMode: true, note }`; `GET /api/landing-pages?clientId=...` attaches `source`. Items have `{ titre, url, statut, date }`, where `statut` is `publie` or `brouillon`.

- [ ] **Step 1: Add failing tests for shared basic examples and separate HubSpot/Odoo examples.**

```js
const { landingPagesForSource } = require('../lib/landing-pages');
test('les pages restent fictives même si le module est actif', () => {
  const basic = { landingPages: [{ titre: 'Exemple', url: 'https://example.com/a', statut: 'publie', date: '2026-09-28' }] };
  assert.equal(landingPagesForSource('crm-basique', basic).demoMode, true);
  assert.notDeepEqual(landingPagesForSource('hubspot', basic).items, landingPagesForSource('odoo', basic).items);
  assert.deepEqual(landingPagesForSource('crm-basique', basic).items, basic.landingPages);
});
```

- [ ] **Step 2: Run `node --test tests/landing-pages.test.js`; expect missing-module failure.**
- [ ] **Step 3: Implement examples and append-only persistence with a backup.**

```js
const BASIC_EXAMPLE_PAGES = [
  { titre: 'Page devis (exemple)', url: 'https://example.com/devis',
    statut: 'publie', date: '2026-09-28' },
];
if (!Object.hasOwn(db, 'landingPages')) {
  const next = { ...db, landingPages: BASIC_EXAMPLE_PAGES };
  store.backup();
  store.save(next);
}
// If landingPages already exists (including []), preserve it without edits.
// HubSpot/Odoo return separate fixed example.com datasets, never CRM-derived claims.
// GET rejects non-applicable and unknown clients, and returns demoMode:true for all.
```

- [ ] **Step 4: Build the read-only view and dispatch.**

```js
if (activeView === 'pagesDestination') {
  const data = await getJson(`/api/landing-pages?clientId=${encodeURIComponent(clientId)}`);
  if (version !== requestVersion) return;
  LandingPagesView.render(data); // escape title/status/date; only valid http(s) URLs are links.
}
// Include landing-pages-view.js before app.js; show a separate DÉMO data badge.
// Remove MODULE_DESCRIPTIONS.pagesDestination; load failures use showMessage.
// No page creation, update or delete control; drafts need not be clickable.
```

- [ ] **Step 5: Test empty existing arrays, unsafe URLs, HTML escaping, a disabled module, and unchanged existing contact/opportunity entries; run `node --test tests/landing-pages.test.js && npm test`.**
- [ ] **Step 6: Commit Task 4 files** with `git add lib/landing-pages.js data/crm-basique.seed.json data/crm-basique.json server.js public/app.js public/index.html public/landing-pages-view.js tests/landing-pages.test.js && git commit -m "Add read-only landing page examples"`.

### Task 5: Make the dashboard sector-aware without losing its briefing

**Files:**
- Create: `lib/sector-templates.js` (exact seven-sector metadata and existing nav keys).
- Modify: `server.js` (attach `sectorTemplate` to profile-scoped overview only).
- Modify: `public/index.html` (sector block before briefing, data provenance and visual emphasis).
- Modify: `public/app.js` (keep sidebar order, status badges and request-version guard).
- Test: `tests/sector-templates.test.js`, `tests/client-ui.test.js`.

**Interfaces:**
- Produces: `templateForSector(sector)` returning `{ objectif, besoin, modulesCles, navKeys }`; `GET /api/overview?clientId=...` adds `sectorTemplate`. `source`-only overview does not gain a fabricated sector.

- [ ] **Step 1: Write failing tests for exact coverage and different client sectors.**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SECTORS } = require('../lib/client-store');
const { SECTOR_TEMPLATES, templateForSector } = require('../lib/sector-templates');
test('chaque secteur autorisé a son objectif et son besoin', () => {
  assert.deepEqual(Object.keys(SECTOR_TEMPLATES).sort(), [...SECTORS].sort());
  for (const sector of SECTORS) {
    assert.ok(templateForSector(sector).objectif);
    assert.ok(templateForSector(sector).besoin);
    assert.ok(templateForSector(sector).modulesCles.length);
  }
  assert.notDeepEqual(templateForSector(SECTORS[0]), templateForSector(SECTORS[6]));
});
```

- [ ] **Step 2: Run `node --test tests/sector-templates.test.js`; expect missing-module failure.**
- [ ] **Step 3: Transcribe the seven exact rows from the approved spec and attach them to profile overview.**

```js
const { client, source } = resolveClientSource(req.query, clientStore);
const overview = await getOverviewForSource(source);
if (client) overview.sectorTemplate = templateForSector(client.secteur);
res.json(overview);
// navKeys contain only keys actually present in MODULE_KEYS; terms such as
// Acquisition and Copilote remain labels when no matching nav entry exists.
```

- [ ] **Step 4: Render sector context before the existing `.briefing`.**

```js
const sector = data.sectorTemplate;
const sectorHtml = sector ? `<section class="card sector-context">
  <h2>${esc(activeClient.secteur)}</h2>
  <p><strong>Objectif :</strong> ${esc(sector.objectif)}</p>
  <p><strong>Besoin :</strong> ${esc(sector.besoin)}</p>
  <div class="sector-key-modules">${sector.modulesCles.map(esc).join(' · ')}</div>
</section>` : '';
// Insert sectorHtml above the old briefing inside render(data).
// Style .sector-key-modules as prominent chips; the existing navigation retains
// its complete order. Do not claim absent traffic, attribution, scoring or
// compliance KPIs exist.
```

- [ ] **Step 5: Test HTML escaping, briefing still present, `source`-only overview unchanged, two different sectors, and a delayed old-view request not replacing the new one; run `node --test tests/sector-templates.test.js tests/client-ui.test.js && npm test`.**
- [ ] **Step 6: Commit Task 5 files** with `git add lib/sector-templates.js server.js public/index.html public/app.js tests/sector-templates.test.js tests/client-ui.test.js && git commit -m "Add sector context to dashboard"`.

### Task 6: Complete verification and publish the commits to GitHub

**Files:**
- Modify: `README.md` (describe the four views, status vs provenance, shared basic CRM, and internal-only security warning).
- Test: existing and new `tests/*.test.js`.

- [ ] **Step 1: Update the README with concrete capabilities and limits.**

```md
Transactions utilise les opportunités du CRM basique et ses cinq stades.
Seul un module actif sur un profil CRM basique permet de créer ou changer un stade.
HubSpot/Odoo affichent leur pipeline et des compteurs de relance sans liste nominative.
Les pages de destination sont des exemples en lecture seule, même sur un module actif.
Le tableau de bord explique le secteur sélectionné sans inventer de nouveaux KPI.
```

- [ ] **Step 2: Run `npm test && git diff --check`; expect all tests passing and no whitespace errors.**
- [ ] **Step 3: Restart the existing `Start application` workflow once after the code batch; inspect workflow and browser logs, then screenshot a basic-CRM profile and one external-CRM profile. Verify all four modules, both status badges, dashboard sector variation, and error/empty states.**
- [ ] **Step 4: Commit the README and any necessary verification fixes, then push `main` to the existing `Bradisco/eteamsys-copilote-poc` remote without storing credentials in its URL.**

```bash
git add README.md
git commit -m "Document phase 2 modules and limits"
git status -sb
# Push only after tests and review, via the already-authorized safe Git credential flow.
```
