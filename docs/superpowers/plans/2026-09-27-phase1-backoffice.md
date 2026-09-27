# Phase 1 eTeamsys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le prototype eTeamsys avec profils clients de démonstration, vues Contacts/Entreprises, navigation latérale, tableau de bord conservé et copilote à crédits simulés.

**Architecture:** Ajouter une couche de sélection `clientId` au-dessus des trois adaptateurs CRM existants, sans remplacer Express ni le stockage JSON du POC. Les profils et crédits résident dans `data/clients.json`; l'interface cliente reste en HTML/CSS/JavaScript et l'administration est une page distincte `/admin`.

**Tech Stack:** Node.js >=18, Express 4, JavaScript natif, module de test `node:test`, stockage JSON local, dépendance `xlsx` existante.

**Spec:** `docs/superpowers/specs/2026-09-27-phase1-backoffice-design.md`

## Global Constraints

- Garder les adaptateurs HubSpot, Odoo et CRM basique, le tableau de bord, l'ajout de contacts et l'import Excel/CSV existants.
- Ne pas ajouter de framework, vraie IA, paiement, authentification ou isolation multi-client robuste.
- `crmExistant` vaut exactement `aucun`, `hubspot` ou `odoo`; `aucun` utilise `crm-basique`.
- Le statut du profil vaut exactement `prospect`, `actif` ou `résilié`, sans rôle de contrôle d'accès.
- Les sept secteurs et les onze clés de modules ont les valeurs exactes de la spécification.
- Modules : `actif`, `demo`, `non-applicable`; par défaut Contacts/Entreprises à `actif`, les neuf autres à `demo`.
- Crédits par profil : 20 à la création, 1 par question, +20 par recharge explicitement simulée.
- Les profils sans CRM partagent le CRM basique fictif; tous les profils d'une même source externe partagent ses identifiants globaux.
- Un `clientId` fourni prime sur `source`; un `clientId` inconnu ne doit jamais retomber sur une autre source.
- Les nouvelles routes du copilote exigent `clientId`; les lectures sans `clientId` préservent `source=hubspot|odoo|crm-basique`.
- Un connecteur configuré qui échoue doit afficher une erreur, jamais des exemples présentés comme résultats de l'appel.
- `/admin` reste sans protection et affiche « Outil interne — non protégé, ne pas exposer publiquement tel quel. »

## Review Focus

1. `data/clients.json` invalide : erreur explicite, sans écraser ni réinitialiser les profils; test de Task 1.
2. Nom de profil/contact contenant des caractères HTML ou des guillemets : afficher du texte, sans injection HTML; test de Task 5. Les valeurs CRM/secteur/module/solde invalides sont aussi testées en Tasks 1 et 2.
3. `clientId` inconnu associé à `source=hubspot` : rejet 404, pas de repli vers HubSpot; test de Task 2.
4. API HubSpot/Odoo configurée mais en échec : erreur propagée, pas de remplacement par la liste démo; test de Task 3.
5. Solde à zéro et changement de profil : aucune question débitée, crédits des autres profils inchangés; test de Task 6.

## File Map

- `lib/client-store.js` : validation, persistance atomique et crédits par profil.
- `lib/client-routes.js` : CRUD administratif et résolution `clientId`/`source`.
- `lib/crm-directory.js` : lecture paginée et normalisation Contacts/Entreprises des trois sources.
- `lib/demo-copilot.js` : suggestions et réponses déterministes fondées sur l'overview.
- `server.js` : assemblage des modules, routes de lecture et du copilote; logique CRM et import existants préservés.
- `public/admin.html`, `public/admin.css`, `public/admin.js` : administration interne.
- `public/index.html`, `public/app.css`, `public/app.js`, `public/escape-html.js`, `public/copilot-ui.js` : interface cliente, échappement HTML, navigation, vues et assistant.
- `tests/*.test.js` : tests `node:test` du stockage, du routage, des listes et du copilote.
- `.gitignore`, `package.json`, `README.md`, `replit.md` : fichier de données ignoré, commande de test et documentation honnête.

---

### Task 1: Stocker les profils et leurs crédits sans perdre les données

**Files:**
- Create: `lib/client-store.js`
- Create: `tests/client-store.test.js`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Produces: `createClientStore(filePath)` avec les méthodes synchrones `list()`, `get(id)`, `create(input)`, `update(id, input)`, `remove(id)`, `charge(id, reason)` et `recharge(id)`.
- Produces: `ClientStoreError(message, status)`; les erreurs de validation portent `status=400`, les identifiants absents `404`, les crédits épuisés `409`, le JSON illisible `500`.
- Produces: `SECTORS`, `MODULE_KEYS`, `DEFAULT_MODULES` et `sourceForClient(client)`.

- [ ] **Step 1: Écrire le test de stockage et de validation qui échoue.**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClientStore, MODULE_KEYS } = require('../lib/client-store');

test('création, valeurs par défaut et validation', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-clients-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createClientStore(path.join(dir, 'clients.json'));
  const client = store.create({ nom: 'Atelier fictif' });
  assert.equal(client.crmExistant, 'aucun');
  assert.equal(client.credits.solde, 20);
  assert.deepEqual(Object.keys(client.modules).sort(), [...MODULE_KEYS].sort());
  assert.throws(() => store.update(client.id, { crmExistant: 'salesforce' }), { status: 400 });
  assert.throws(() => store.update(client.id, { secteur: 'Secteur inconnu' }), { status: 400 });
  assert.throws(() => store.update(client.id, { modules: { contacts: 'bloqué' } }), { status: 400 });
  assert.throws(() => store.update(client.id, { credits: { solde: -1 } }), { status: 400 });
  assert.equal(store.get(client.id).crmExistant, 'aucun');
});

test('JSON corrompu : pas de remise à zéro silencieuse', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-clients-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'clients.json');
  fs.writeFileSync(file, '{invalide');
  assert.throws(() => createClientStore(file).list(), { status: 500 });
  assert.equal(fs.readFileSync(file, 'utf8'), '{invalide');
});
```

- [ ] **Step 2: Confirmer l'échec initial.** Run: `node --test tests/client-store.test.js`. Expected: FAIL, module `lib/client-store.js` absent.
- [ ] **Step 3: Implémenter le modèle et le stockage.** Utiliser `fs.readFileSync` et `JSON.parse` avec erreur explicite, valider les énumérations et le solde entier non négatif, écrire via fichier temporaire suivi de `renameSync`. Les valeurs structurantes sont :

```js
const MODULE_KEYS = [
  'contacts', 'entreprises', 'transactions', 'emailsMarketing', 'seo',
  'reseauxSociaux', 'publicites', 'formulaires', 'pagesDestination',
  'pagesSiteWeb', 'tableauxDeBord'
];
const SECTORS = [
  'E-commerce',
  'Promoteur immobilier / constructeur de maisons',
  'Fabricant/installateur (vérandas, fenêtres, aménagement extérieur)',
  'Services B2B (agences, cabinets, consultants)',
  'Retail multi-points de vente / franchise',
  'Pharma / santé',
  'Artisans / TPE locales'
];
const DEFAULT_MODULES = Object.fromEntries(
  MODULE_KEYS.map(key => [key, ['contacts', 'entreprises'].includes(key) ? 'actif' : 'demo'])
);
function sourceForClient(client) {
  return client.crmExistant === 'aucun' ? 'crm-basique' : client.crmExistant;
}
function atomicWrite(file, clients) {
  const fs = require('node:fs');
  const path = require('node:path');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(clients, null, 2));
  fs.renameSync(temporary, file);
}
```

Créer `id` et `creeLe` côté serveur, conserver les champs non modifiés sur `update`, n'accepter que les champs autorisés. `charge` refuse à zéro et ajoute une entrée d'historique `question` pour un débit de 1. `recharge` ajoute 20 avec entrée `recharge-simulee`. Un ajustement manuel du solde via l'admin ajoute une entrée `ajustement-admin`. `remove` n'efface pas `data/crm-basique.json`.

- [ ] **Step 4: Vérifier le passage et ajouter les fichiers de configuration.** Run: `node --test tests/client-store.test.js`. Expected: PASS. Ajouter `data/clients.json` à `.gitignore` et `"test": "node --test tests/*.test.js"` aux scripts de `package.json`.
- [ ] **Step 5: Commit.** Run: `git add lib/client-store.js tests/client-store.test.js .gitignore package.json && git commit -m "Add local demo client store and credit ledger"`.

### Task 2: Gérer les profils et sélectionner la bonne source dans l'API

**Files:**
- Create: `lib/client-routes.js`
- Create: `tests/client-routes.test.js`
- Modify: `server.js`

**Interfaces:**
- Consumes: `createClientStore(filePath)` et `sourceForClient(client)` de Task 1.
- Produces: `registerAdminRoutes(app, store)` et `resolveClientSource({ clientId, source }, store) -> { client, source }`.
- Produces dans `server.js`: `getOverviewForSource(source) -> Promise<overview>` avec le briefing ajouté, réutilisable par la route du copilote en Task 6.
- `resolveClientSource` renvoie `client: null` en mode historique sans `clientId`; `source` vaut `hubspot` par défaut si les deux paramètres sont absents.

- [ ] **Step 1: Écrire le test de précédence et de rejet.**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveClientSource } = require('../lib/client-routes');
const store = {
  get(id) {
    if (id !== 'client-1') throw Object.assign(new Error('Profil inconnu'), { status: 404 });
    return { id, crmExistant: 'aucun' };
  }
};
test('clientId prime, même si source est fourni', () => {
  assert.equal(resolveClientSource({ clientId: 'client-1', source: 'hubspot' }, store).source, 'crm-basique');
  assert.throws(
    () => resolveClientSource({ clientId: 'inconnu', source: 'hubspot' }, store),
    { status: 404 }
  );
  assert.equal(resolveClientSource({ source: 'odoo' }, store).source, 'odoo');
});
```

- [ ] **Step 2: Confirmer l'échec initial.** Run: `node --test tests/client-routes.test.js`. Expected: FAIL, module `lib/client-routes.js` absent.
- [ ] **Step 3: Ajouter les handlers Express et la résolution.**

```js
function resolveClientSource({ clientId, source }, store) {
  if (clientId) {
    const client = store.get(clientId);
    return { client, source: sourceForClient(client) };
  }
  const selected = source || 'hubspot';
  if (!['hubspot', 'odoo', 'crm-basique'].includes(selected)) {
    throw Object.assign(new Error('Source inconnue'), { status: 400 });
  }
  return { client: null, source: selected };
}
```

`registerAdminRoutes` ajoute les quatre routes `GET/POST /api/admin/clients` et `PUT/DELETE /api/admin/clients/:id`; convertir `ClientStoreError.status` en HTTP 400/404/409/500 sans masquer sa raison. Dans `server.js`, instancier `const clientStore = createClientStore(path.join(__dirname, 'data', 'clients.json'))`, enregistrer les routes et extraire la sélection d'overview existante dans la fonction suivante, puis appeler `resolveClientSource(req.query, clientStore)` dans `GET /api/overview` :

```js
async function getOverviewForSource(source) {
  const readers = {
    hubspot: getHubspotOverview,
    odoo: getOdooOverview,
    'crm-basique': getCrmBasiqueOverview
  };
  const payload = await readers[source]();
  payload.briefing = buildBriefing(payload);
  return payload;
}
```

La route renvoie `getOverviewForSource(source)` et garde les messages d'erreur HTTP explicites.

- [ ] **Step 4: Vérifier les routes.** Étendre `tests/client-routes.test.js` avec une application Express isolée, sans écrire dans le vrai `data/clients.json` :

```js
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClientStore } = require('../lib/client-store');
const { registerAdminRoutes } = require('../lib/client-routes');
test('CRUD administratif par HTTP', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-admin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = express();
  app.use(express.json());
  registerAdminRoutes(app, createClientStore(path.join(dir, 'clients.json')));
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const created = await fetch(`${base}/api/admin/clients`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom: 'Client fictif', crmExistant: 'aucun' })
  });
  assert.equal(created.status, 201);
  const client = await created.json();
  const invalid = await fetch(`${base}/api/admin/clients`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom: 'Erreur', crmExistant: 'inconnu' })
  });
  assert.equal(invalid.status, 400);
  assert.equal((await fetch(`${base}/api/admin/clients`)).status, 200);
  assert.equal((await fetch(`${base}/api/admin/clients/inconnu`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nom: 'Absent' })
  })).status, 404);
  assert.equal((await fetch(`${base}/api/admin/clients/${client.id}`, { method: 'DELETE' })).status, 200);
});
```

Run: `node --test tests/client-routes.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.** Run: `git add lib/client-routes.js tests/client-routes.test.js server.js && git commit -m "Add demo client admin API and source resolution"`.

### Task 3: Lire les contacts et entreprises des trois sources

**Files:**
- Create: `lib/crm-directory.js`
- Create: `tests/crm-directory.test.js`
- Modify: `server.js`

**Interfaces:**
- Consumes: `resolveClientSource` de Task 2 et les fonctions existantes `odooExecuteKw`, `loadCrmBasique`.
- Produces dans `server.js`: `hsList(objectType, properties, cursor, limit) -> Promise<{results,paging}>`.
- Produces: `createDirectory({ hubspotConfigured, odooConfigured, hsList, odooExecuteKw, loadCrmBasique })` avec `contacts(source, cursor, limit)` et `companies(source, cursor, limit)`.
- Chaque lecture renvoie `{ items, nextCursor, demoMode, note, derived }`. Les objets Contacts utilisent `id`, `nom`, `societe`, `email`, `telephone`, `statut`; les objets Entreprises utilisent `id`, `nom`, `domaine`, `nombreContacts`.

- [ ] **Step 1: Écrire les tests pour CRM basique et erreur réelle.**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDirectory } = require('../lib/crm-directory');
test('les sociétés du CRM basique sont dérivées des contacts', async () => {
  const directory = createDirectory({
    hubspotConfigured: false, odooConfigured: false,
    hsList: async () => { throw new Error('non appelé'); },
    odooExecuteKw: async () => { throw new Error('non appelé'); },
    loadCrmBasique: () => ({ contacts: [
      { id: '1', nom: 'A', societe: 'Atelier fictif' },
      { id: '2', nom: 'B', societe: 'Atelier fictif' }
    ] })
  });
  const result = await directory.companies('crm-basique', '', 50);
  assert.equal(result.derived, true);
  assert.equal(result.items[0].nombreContacts, 2);
});
test('une API configurée en erreur ne sert pas une liste fictive', async () => {
  const directory = createDirectory({
    hubspotConfigured: true, odooConfigured: false,
    hsList: async () => { throw new Error('HubSpot 403'); },
    odooExecuteKw: async () => [],
    loadCrmBasique: () => ({ contacts: [] })
  });
  await assert.rejects(directory.contacts('hubspot', '', 50), /HubSpot 403/);
});
test('source non configurée : noms fictifs et badge démo', async () => {
  const directory = createDirectory({
    hubspotConfigured: false, odooConfigured: false,
    hsList: async () => { throw new Error('non appelé'); },
    odooExecuteKw: async () => [],
    loadCrmBasique: () => ({ contacts: [] })
  });
  const result = await directory.contacts('hubspot', '', 50);
  assert.equal(result.demoMode, true);
  assert.match(result.items[0].nom, /\(exemple\)/);
});
```

- [ ] **Step 2: Confirmer l'échec initial.** Run: `node --test tests/crm-directory.test.js`. Expected: FAIL, module absent.
- [ ] **Step 3: Ajouter le modèle normalisé et les adaptateurs de liste.** Les fixtures HubSpot et Odoo sans identifiants utilisent exclusivement des noms fictifs suffixés `(exemple)` et un `note` DÉMO. Le regroupement local est calculé uniquement à partir du champ `societe`. Exemple de pagination locale :

```js
function page(items, cursor, limit) {
  const offset = cursor === '' ? 0 : Number(cursor);
  if (!Number.isInteger(offset) || offset < 0) throw Object.assign(new Error('Curseur invalide'), { status: 400 });
  const results = items.slice(offset, offset + limit);
  return { items: results, nextCursor: offset + limit < items.length ? String(offset + limit) : null };
}
```

HubSpot connecté : requête GET en lecture seule sur `/crm/v3/objects/contacts` ou `/crm/v3/objects/companies` avec propriétés explicites et curseur `after`. Dans `server.js`, injecter cette fonction dans `createDirectory` :

```js
async function hsList(objectType, properties, cursor, limit) {
  const url = new URL(`https://api.hubapi.com/crm/v3/objects/${objectType}`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('properties', properties.join(','));
  if (cursor) url.searchParams.set('after', cursor);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } });
  if (!response.ok) throw new Error(`HubSpot ${response.status}`);
  return response.json();
}
```

Odoo connecté : `odooExecuteKw('res.partner', 'search_read', [[['is_company', '=', kind === 'companies']]], { fields: ['name', 'email', 'phone', 'parent_id', 'website'], offset, limit })` avec `offset` obtenu du curseur local. Ne pas prétendre que le chemin Odoo a été validé sur un compte réel.

- [ ] **Step 4: Brancher les routes et vérifier.** Dans `server.js`, ajouter `GET /api/contacts` et `GET /api/companies`; résoudre `clientId` ou `source` avec Task 2, borner `limit` à 1–100 et propager les erreurs configurées. Run: `node --test tests/crm-directory.test.js`. Expected: PASS. Une fois le workflow démarré, vérifier `curl -fsS 'http://127.0.0.1:5000/api/contacts?source=hubspot' | jq '{demoMode, count: (.items|length)}'`, puis remplacer `hubspot` par `odoo` et `crm-basique`; faire le même contrôle sur `/api/companies`.
- [ ] **Step 5: Commit.** Run: `git add lib/crm-directory.js tests/crm-directory.test.js server.js && git commit -m "Expose read-only CRM contact and company directories"`.

### Task 4: Créer le backoffice interne

**Files:**
- Create: `public/admin.html`
- Create: `public/admin.css`
- Create: `public/admin.js`
- Create: `tests/admin-ui.test.js`
- Modify: `server.js`

**Interfaces:**
- Consumes: les routes `/api/admin/clients` de Task 2.
- Produces: `/admin` et son action « Voir en tant que ce client » qui ouvre `/?clientId=<id>`.

- [ ] **Step 1: Écrire le test de présence de l'écran.**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('le backoffice expose ses contrôles et son avertissement', () => {
  const html = fs.readFileSync('public/admin.html', 'utf8');
  assert.match(html, /Outil interne/);
  assert.match(html, /id="clientForm"/);
  assert.match(html, /id="clientsTable"/);
  assert.match(html, /admin\.js/);
});
```

- [ ] **Step 2: Confirmer l'échec initial.** Run: `node --test tests/admin-ui.test.js`. Expected: FAIL, page absente.
- [ ] **Step 3: Créer la page et son contrôleur.** La table affiche nom, secteur, CRM, statut et solde. Le formulaire comporte nom, sept secteurs, CRM, consultant, statut, solde et onze menus de module à trois états; l'identifiant, la date et l'historique sont consultables en édition. Le contrôleur appelle GET/POST/PUT/DELETE de Task 2, actualise la table sans reload, montre les erreurs de validation et confirme la suppression. Utiliser `textContent` pour tous les noms/champs issus des profils dans la table, jamais du HTML non échappé :

```js
async function saveClient(payload, id) {
  const response = await fetch(id ? `/api/admin/clients/${encodeURIComponent(id)}` : '/api/admin/clients', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Enregistrement impossible');
  return result;
}
function viewAsClient(id) {
  window.location.href = `/?clientId=${encodeURIComponent(id)}`;
}
```

Ajouter la route `GET /admin` avant `express.static`, qui sert `public/admin.html`; conserver la mise en garde visible et les contrastes/labels du formulaire.

- [ ] **Step 4: Vérifier la page.** Run: `node --test tests/admin-ui.test.js`. Expected: PASS. Vérifier `curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5000/admin` : `200`. Capturer `/admin` en desktop avec l'aperçu de l'app et en mobile avec `chromium --headless --no-sandbox --window-size=390,844 --screenshot=/tmp/eteamsys-admin-mobile.png http://127.0.0.1:5000/admin`; ouvrir l'image pour contrôler les débordements. Créer, modifier et consulter trois profils fictifs avec le formulaire, puis supprimer un quatrième profil de test après confirmation.
- [ ] **Step 5: Commit.** Run: `git add public/admin.html public/admin.css public/admin.js tests/admin-ui.test.js server.js && git commit -m "Add internal demo client backoffice"`.

### Task 5: Ajouter la navigation et préserver le tableau de bord

**Files:**
- Modify: `public/index.html`
- Create: `public/app.css`
- Create: `public/app.js`
- Create: `public/escape-html.js`
- Create: `tests/client-ui.test.js`

**Interfaces:**
- Consumes: `/?clientId=<id>`, `/api/admin/clients`, `/api/overview`, `/api/contacts`, `/api/companies`.
- Produces: vues Contacts, Entreprises et Tableaux de bord, plus aperçus honnêtes pour les autres modules.
- Expose: un conteneur `#copilotPanel` pour Task 7.

- [ ] **Step 1: Écrire le test du conteneur et de l'ordre des vues.**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { escapeHtml } = require('../public/escape-html.js');
test('la page cliente charge la navigation et garde le copilote', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const js = fs.readFileSync('public/app.js', 'utf8');
  assert.match(html, /id="sideNav"/);
  assert.match(html, /id="mainContent"/);
  assert.match(html, /id="copilotPanel"/);
  assert.ok(js.indexOf('Contacts') < js.indexOf('Entreprises'));
  assert.ok(js.indexOf('Entreprises') < js.indexOf('Transactions'));
  assert.ok(js.indexOf('Transactions') < js.indexOf('Tableaux de bord'));
});
test('les noms et attributs issus du CRM ne deviennent pas du HTML', () => {
  assert.equal(
    escapeHtml('"><img src=x onerror=alert(1)>'),
    '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'
  );
});
```

- [ ] **Step 2: Confirmer l'échec initial.** Run: `node --test tests/client-ui.test.js`. Expected: FAIL, `public/escape-html.js` ou `public/app.js` absent.
- [ ] **Step 3: Déplacer le CSS/JS existant dans les fichiers dédiés et ajouter la navigation.** Garder `render(data)` et `renderCrmBasiqueAdmin()` avec leurs comportements existants. Remplacer l'ancien `esc` incomplet par `escapeHtml` dans `public/escape-html.js`, chargé avant `app.js`, pour échapper `&`, `<`, `>`, `"` et `'` dans texte et attributs HTML. Afficher en haut le nom du profil sélectionné, son secteur, son CRM et le badge DÉMO/LIVE de l'adaptateur, distinct du badge de module. Les vues Contacts/Entreprises appellent les nouveaux endpoints paginés; HubSpot/Odoo y sont en lecture seule, tandis que le CRM basique conserve son formulaire/import. Après ajout ou import de contact, rafraîchir la liste et l'overview sans renvoyer l'utilisateur vers une autre vue. Les modules `non-applicable` ont une entrée désactivée; `actif` ne rend pas fonctionnel un module absent. Les aperçus restent explicites, sans données prétendument réelles. La vue Tableaux de bord garde l'overview actuel et reste accessible avec son statut `demo` par défaut. Pour éviter une réponse périmée après un changement de profil/vue :

```js
function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, character => entities[character]);
}
if (typeof module === 'object' && module.exports) module.exports = { escapeHtml };
else window.escapeHtml = escapeHtml;

let requestVersion = 0;
async function loadView(endpoint, renderResult) {
  const version = ++requestVersion;
  try {
    const response = await fetch(endpoint);
    const payload = await response.json();
    if (version !== requestVersion) return;
    if (!response.ok) throw new Error(payload.error || 'Lecture impossible');
    renderResult(payload);
  } catch (error) {
    if (version === requestVersion) document.getElementById('mainContent').textContent = error.message;
  }
}
```

La page sans profil sélectionné invite à aller sur `/admin`; un profil introuvable produit un message explicite. Garder l'ordre des onze modules de la spécification et le lien « Gérer » en bas de la barre latérale. Sur mobile, la navigation et le panneau latéral doivent rester accessibles sans défilement horizontal.

- [ ] **Step 4: Vérifier les vues et la régression CRM basique.** Run: `node --test tests/client-ui.test.js`. Expected: PASS. Ouvrir successivement les liens `/?clientId=<id>` des trois profils de test, vérifier Contacts, Entreprises et Tableaux de bord. Pour `aucun`, ajouter un contact fictif puis importer un CSV de test à colonnes `Nom,Société,E-mail,Téléphone`; vérifier la nouvelle ligne et les indicateurs. Contrôler le funnel en vues graphique et tableau. Afficher une vue `demo`, une vue `non-applicable`, un profil inconnu, puis inspecter l'interface mobile avec `chromium --headless --no-sandbox --window-size=390,844 --screenshot=/tmp/eteamsys-client-mobile.png 'http://127.0.0.1:5000/?clientId=<id>'`.
- [ ] **Step 5: Commit.** Run: `git add public/index.html public/app.css public/app.js public/escape-html.js tests/client-ui.test.js && git commit -m "Add client navigation and preserve dashboard"`.

### Task 6: Répondre avec le copilote de démonstration et débiter les crédits

**Files:**
- Create: `lib/demo-copilot.js`
- Create: `tests/demo-copilot.test.js`
- Modify: `server.js`
- Modify: `tests/client-store.test.js`

**Interfaces:**
- Consumes: `createClientStore` de Task 1 et sélection de source de Task 2.
- Produces: `buildSuggestions(overview) -> [{label, question}]` et `answerQuestion(overview, question) -> string`.
- Ajoute `suggestions: [{label, question}]` à la réponse de `GET /api/overview`, calculées côté serveur pour que l'interface cliente ne duplique pas la logique.
- Produces: `POST /api/copilot/ask` avec `{ clientId, question }`, `GET /api/copilot/credits?clientId=...` et `POST /api/copilot/recharge` avec `{ clientId }`.

- [ ] **Step 1: Écrire les tests de réponse et de solde indépendant.**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSuggestions, answerQuestion } = require('../lib/demo-copilot');
const { createClientStore } = require('../lib/client-store');
test('suggestions et réponses ne fabriquent pas de noms de contacts', () => {
  const overview = { briefing: 'Bilan réel de la source', relanceItems: [
    { label: 'Leads à relancer', count: 3 }
  ], dataHygiene: null };
  assert.equal(buildSuggestions(overview)[0].question.includes('relancer'), true);
  assert.match(answerQuestion(overview, 'résumé'), /Bilan réel de la source/);
  assert.match(answerQuestion(overview, 'Quel est le prénom de mon directeur ?'), /démonstration|disponibles/i);
});
test('crédits propres à chaque profil et refus à zéro', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eteamsys-credits-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createClientStore(path.join(dir, 'clients.json'));
  const a = store.create({ nom: 'A', credits: { solde: 1, historique: [] } });
  const b = store.create({ nom: 'B' });
  store.charge(a.id, 'question');
  assert.throws(() => store.charge(a.id, 'question'), { status: 409 });
  assert.equal(store.get(b.id).credits.solde, 20);
  assert.equal(store.recharge(a.id).credits.solde, 20);
});
```

- [ ] **Step 2: Confirmer l'échec initial.** Run: `node --test tests/demo-copilot.test.js`. Expected: FAIL, module absent.
- [ ] **Step 3: Ajouter le moteur déterministe et les routes.** Les intentions prises en charge portent sur résumé, relances, opportunités/funnel et hygiène quand les champs existent. Si `relanceItems` contient une entrée utile, placer sa suggestion en premier; produire entre 2 et 4 suggestions seulement quand les données correspondantes existent. Les demandes hors données retournent une limite explicite et restent une question facturée en crédits simulés. Un échec de lecture du CRM n'est pas facturé. `GET /api/overview` ajoute `payload.suggestions = buildSuggestions(payload)` avant sa réponse. Le routeur contrôle le solde avant de lire la source puis débite après avoir calculé la réponse :

```js
app.post('/api/copilot/ask', async (req, res) => {
  const { clientId, question } = req.body || {};
  if (!clientId || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Profil et question obligatoires.' });
  }
  try {
    const client = clientStore.get(clientId);
    if (client.credits.solde === 0) {
      return res.status(409).json({ error: 'Crédits épuisés', credits: client.credits });
    }
    const overview = await getOverviewForSource(sourceForClient(client));
    const answer = answerQuestion(overview, question);
    const updated = clientStore.charge(clientId, 'question');
    res.json({ answer, credits: updated.credits, demoMode: true });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});
```

Pour `GET /api/copilot/credits`, renvoyer le solde du profil. Pour `POST /api/copilot/recharge`, appeler `store.recharge(clientId)` et renvoyer le nouveau solde avec `demoMode: true`; n'appeler aucune API de paiement. Réutiliser les données de l'overview, sans inventer de propriétaire ou de campagne.

- [ ] **Step 4: Vérifier.** Run: `node --test tests/demo-copilot.test.js tests/client-store.test.js`. Expected: PASS. Par HTTP, vérifier une question, un solde à zéro, une recharge et l'indépendance entre deux profils.
- [ ] **Step 5: Commit.** Run: `git add lib/demo-copilot.js tests/demo-copilot.test.js tests/client-store.test.js server.js && git commit -m "Add read-only demo copilot and per-client credits"`.

### Task 7: Intégrer l'assistant, documenter et vérifier la phase complète

**Files:**
- Create: `public/copilot-ui.js`
- Modify: `public/index.html`
- Modify: `public/app.css`
- Modify: `public/app.js`
- Modify: `tests/client-ui.test.js`
- Modify: `README.md`
- Modify: `replit.md`

**Interfaces:**
- Consumes: endpoints du copilote de Task 6 et profil/vues de Task 5.
- Produces: panneau latéral « Suggéré », « Résumé », « Comment faire », champ libre, solde et recharge simulée.

- [ ] **Step 1: Étendre le test de présence du panneau et des actions.**

```js
test('le copilote présente la simulation et interdit les actions d’écriture', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const js = fs.readFileSync('public/copilot-ui.js', 'utf8');
  assert.match(html, /copilot-ui\.js/);
  assert.match(js, /Résumé/);
  assert.match(js, /Comment faire/);
  assert.match(js, /Bientôt disponible/);
  assert.match(js, /Recharger \(simulation\)/);
});
```

- [ ] **Step 2: Confirmer l'échec initial.** Run: `node --test tests/client-ui.test.js`. Expected: FAIL, `public/copilot-ui.js` absent.
- [ ] **Step 3: Construire le panneau et ses états.** Montrer un badge « Copilote de démonstration » même si le CRM est LIVE. Les suggestions proviennent du `GET /api/overview?clientId=...` déjà chargé; leur clic et « Résumé » appellent la route de Task 6. « Créer » et « Réunions » sont désactivés et leurs info-bulles disent « Bientôt disponible ». Un solde à zéro affiche « Crédits épuisés » et le bouton de recharge simulée. Rendre les réponses avec `textContent`, jamais `innerHTML`. Utiliser le contexte du client sélectionné :

```js
async function askDemoCopilot(clientId, question) {
  const response = await fetch('/api/copilot/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, question })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Question impossible');
  return result;
}
```

Ajouter sur HubSpot/Odoo la mention « Assistant eTeamsys, distinct de l'IA native du CRM » sans prix; garder le panneau utilisable au clavier et sur mobile.
Conserver près de cette mention un commentaire dans `public/copilot-ui.js` : `Tarif eTeamsys à confirmer : ne pas afficher de montant`.
Conserver dans `public/copilot-ui.js` un commentaire `Tarif eTeamsys à confirmer : ne pas afficher de montant` près de cette mention.

- [ ] **Step 4: Mettre à jour la documentation.** Dans `README.md` et `replit.md`, documenter `npm start`, `npm test`, `/admin`, les trois scénarios, le partage de données fictives, les crédits sans paiement, l'absence d'authentification et l'interdiction d'utiliser de vraies données clients sur une URL publique non protégée. Donner pour chacun des onze modules son état fonctionnel/testé/simulé/non applicable et rappeler que l'adaptateur Odoo réel n'a pas été validé.
- [ ] **Step 5: Vérifier tout le périmètre en une passe.** Run: `npm test && node --check server.js && git diff --check`. Restart `Start application` une fois, lire ses logs, vérifier `/`, `/admin`, `/api/overview?source=hubspot`, les trois profils et les endpoints Contacts/Entreprises/Copilote. Capturer l'interface principale et l'administration à taille desktop et mobile. Ne pas prétendre avoir validé Odoo sur une vraie instance sans identifiants.
- [ ] **Step 6: Commit.** Run: `git add public/copilot-ui.js public/index.html public/app.css public/app.js tests/client-ui.test.js README.md replit.md && git commit -m "Complete phase one demo experience and documentation"`.