# Identifiants CRM par profil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isoler les accès HubSpot/Odoo par profil, les gérer depuis l'admin et migrer une seule fois le secret HubSpot existant vers eTeamsys.

**Architecture:** Le store conserve les identifiants localement mais ne renvoie que des indicateurs publics. Les routes transmettent le profil résolu à des connecteurs sans configuration globale. Une migration de démarrage isolée cible uniquement eTeamsys ; sans profil, les anciennes lectures externes restent en démo.

**Tech Stack:** Node.js/CommonJS, Express, fichiers JSON locaux, JavaScript navigateur, `node:test`. Aucune nouvelle dépendance runtime.

**Spec:** `docs/superpowers/specs/2026-09-28-credentials-par-client-design.md`

## Global Constraints

- Ne jamais consulter, imprimer, committer ni transmettre au navigateur la valeur du vrai `HUBSPOT_TOKEN`.
- Ne pas remplacer `data/clients.json` par un seed. Sauvegarde exclusive avant la migration, écriture atomique et permissions `0600` pour les nouveaux fichiers contenant des secrets.
- Un profil ne peut contenir que les identifiants de son `crmExistant`. Un changement de CRM supprime ceux de l'ancien.
- Tous les retours admin, y compris POST/PUT, sont filtrés. Les champs secrets du formulaire restent vides à l'ouverture.
- Sans `clientId`, aucune lecture HubSpot/Odoo LIVE. Sans identifiants complets, démo propre au CRM. `clientId` inconnu : erreur, jamais repli.
- Le copilote continue d'utiliser la clé Anthropic globale, mais ses lectures CRM utilisent le profil.
- Ne pas traiter le `429` HubSpot dans cette tâche et ne pas exposer publiquement ce POC non authentifié.
- Cette spécification et ce plan sont des **brouillons non committés** jusqu'à leur relecture par l'utilisateur. Aucune implémentation, migration réelle ou suppression de secret avant son accord.

## Review Focus

1. Le jeton d'un client A ne doit jamais être utilisé pour B dans l'overview, les contacts ou le copilote : test de deux profils HubSpot avec faux jetons différents.
2. Une réponse POST/PUT, un message d'erreur ou un objet client imbriqué ne doit pas révéler un identifiant : test de tous les retours admin.
3. Un champ secret laissé vide pendant l'édition doit conserver l'ancien jeton, alors qu'un changement de CRM doit le retirer : tests séparés.
4. Une migration répétée, ou un ancien secret encore présent après un retrait volontaire, ne doit pas réinjecter le jeton : test d'idempotence et de marqueur.
5. Si la sauvegarde échoue ou si plusieurs profils eTeamsys existent, le fichier actif ne doit pas être modifié : tests de non-écriture.

---

### Task 1: Persister et exposer les profils sans fuite d'identifiants

**Files:** Modifier `lib/client-store.js`, `lib/client-routes.js` et `.gitignore` ; tester `tests/client-store.test.js` et `tests/client-routes.test.js`.

**Interfaces:**
- `store.get(id)` / `store.list()` restent internes et retournent les objets complets aux connecteurs.
- `publicClient(client)` retourne le profil sans `credentials` ni marqueur interne, plus `credentialStatus` et `credentialsConfigured`.
- `credentialsForClient(client)` fournit les seuls champs utiles au CRM du profil, jamais à une réponse HTTP.
- `store.clearCredentials(id)` retire explicitement les identifiants sans toucher aux autres champs.

- [ ] **Step 1: Écrire les tests du modèle et des retours HTTP, puis les exécuter en échec.**

```js
const hs = store.create({ nom: 'A', crmExistant: 'hubspot', credentials: { hubspotToken: 'fake-A' } });
assert.equal(store.get(hs.id).credentials.hubspotToken, 'fake-A');
assert.throws(() => store.create({ nom: 'B', crmExistant: 'odoo',
  credentials: { hubspotToken: 'fake-B' } }), { status: 400 });
store.update(hs.id, { credentials: {} }); // champs absents : conserver
assert.equal(store.get(hs.id).credentials.hubspotToken, 'fake-A');
store.update(hs.id, { crmExistant: 'aucun' });
assert.deepEqual(store.get(hs.id).credentials, {});
// GET, POST et PUT /api/admin/clients : JSON.stringify(response) n'inclut ni fake-A ni "credentials":{.
```

- [ ] **Step 2: Ajouter validation stricte, fusion non destructive et projections publiques.**

```js
const CREDENTIAL_KEYS = {
  aucun: [], hubspot: ['hubspotToken'],
  odoo: ['odooUrl', 'odooDb', 'odooUsername', 'odooPassword'],
};
// validateInput(input, previous) refuse les clés étrangères ; si CRM changé,
// repartir de {} avant la fusion. Une valeur absente conserve, '' ne remplace pas ;
// l'URL Odoo saisie doit être HTTPS. credentialsForClient ne lit pas process.env.
// publicClient sélectionne explicitement les champs publics au lieu de
// propager {...client}, pour masquer aussi le marqueur de migration.
```

Mettre `mode: 0o600` sur les nouvelles écritures temporaires du store et sauvegardes de migration. Ajouter l'ignore du fichier de sauvegarde locale à `.gitignore`. Filtrer GET/POST/PUT dans `registerAdminRoutes`. L'action de retrait doit être une route admin explicite avec confirmation côté navigateur, par exemple `DELETE /api/admin/clients/:id/credentials`, et non `credentials: {}` ambigu.

- [ ] **Step 3: Ajouter les cas URL incorrecte, objet mal formé, retrait explicite, crédits et historique préservés ; exécuter `node --test tests/client-store.test.js tests/client-routes.test.js`.**

### Task 2: Résoudre les connexions par profil dans toutes les lectures

**Files:** Modifier `server.js`, `lib/crm-directory.js`, `tests/crm-directory.test.js`, `tests/client-routes.test.js`, `tests/helpers/server-fixture.js` ; ajouter `tests/client-credentials-routes.test.js`.

**Interfaces:**
- `getOverviewForSource(source, client = null)` utilise les identifiants du client ou les exemples externes quand `client === null`.
- `directory.contacts(source, cursor, limit, client = null)` et `directory.companies(...)` suivent le même contrat.
- Une fabrique HubSpot lie `hsSearch`, `hsList`, `hsCount`, `hsSum` au seul jeton passé ; une fabrique Odoo lie `odooCall`, `odooLogin`, `odooExecuteKw` aux quatre champs du seul profil.

- [ ] **Step 1: Écrire un test réseau simulé de deux profils HubSpot et du repli sans profil, puis le faire échouer.**

```js
// Faux fetch HubSpot : inspecter Authorization sans appeler HubSpot réel.
// /api/overview?clientId=A et ?clientId=B utilisent respectivement fake-A
// et fake-B ; ?source=hubspot utilise la démo et n'émet aucun appel externe.
// Un clientId inconnu ne déclenche aucun appel externe.
```

- [ ] **Step 2: Extraire les appels HubSpot/Odoo dans des fonctions recevant leur configuration ; retirer les constantes globales d'exploitation du serveur.**

```js
async function getOverviewForSource(source, client = null) {
  const credentials = client ? credentialsForClient(client) : {};
  // HubSpot/Odoo : démo si incomplet, client de lecture sinon.
  // CRM basique : comportement existant.
}
```

La seule lecture temporaire autorisée de `process.env.HUBSPOT_TOKEN` sera dans la migration du Task 4. Ne jamais utiliser une variable d'environnement comme repli dans les connecteurs. Adapter les messages de démarrage : ils ne doivent plus prétendre qu'un CRM entier est LIVE.

- [ ] **Step 3: Propager `client` dans chaque route qui lit un CRM externe.**

```js
const { client, source } = resolveClientSource(req.query, clientStore);
const overview = await getOverviewForSource(source, client);
const list = await directory.contacts(source, cursor, limit, client);
```

Appliquer aussi aux routes Transactions, relances et `/api/copilot/ask`, y compris l'échantillon de contacts transmis au copilote. Garder les routes qui exigent déjà `clientId` et le briefing existant. Les anciennes routes `?source=` utilisent la démo ; les erreurs LIVE restent visibles.

- [ ] **Step 4: Tester les deux jetons distincts sur overview et contacts, l'absence d'interférence Odoo, la démo sans `clientId`, le client inconnu, les transactions/relances et la sélection copilote ; exécuter les tests concernés puis `npm test`.**

### Task 3: Saisir les identifiants dans l'admin sans les relire

**Files:** Modifier `public/admin.html`, `public/admin.js`, `public/admin.css` et les tests d'interface admin pertinents.

**Interfaces:** L'admin ne consomme que `credentialStatus` et `credentialsConfigured` ; le formulaire n'envoie que des valeurs nouvellement saisies. Le retrait explicite appelle la route du Task 1.

- [ ] **Step 1: Écrire un test d'interface pour l'affichage conditionnel, les champs password vides en édition, la conservation d'un jeton avec formulaire vide et le retrait explicite ; le faire échouer.**

```js
// Éditer un profil hubspot avec credentialStatus.hubspotToken === true :
// hubspotToken.value === '' ; statut « Jeton enregistré » visible.
// Passer à odoo : champs HubSpot masqués/exclus, champs Odoo visibles.
// Sauvegarder sans nouvelle saisie : payload.credentials absent.
```

- [ ] **Step 2: Construire les champs conditionnels et l'état configuré sans lire les valeurs.**

```html
<input id="hubspotToken" type="password" autocomplete="new-password">
<input id="odooPassword" type="password" autocomplete="new-password">
```

Ne pas préremplir URL Odoo ni utilisateur. Réinitialiser les champs lors de chaque changement de profil/CRM. Afficher une confirmation avant « Retirer les identifiants ». Corriger le libellé qui attribue à tous les CRM le partage réservé au CRM basique.

- [ ] **Step 3: Vérifier les modes vide, configuré, changement de CRM, erreur de sauvegarde, navigation mobile et absence de valeurs secrètes dans le DOM après recharge. Exécuter les tests UI.**

### Task 4: Migrer eTeamsys une seule fois, documenter et livrer

**Files:** Ajouter `lib/client-credentials-migration.js`, modifier `server.js`, `.env.example`, `README.md`, `tests/helpers/server-fixture.js` ; ajouter `tests/client-credentials-migration.test.js`.

**Interfaces:** `migrateEteamsysHubspotCredential(store, oldToken)` cible un profil eTeamsys unique, sauvegarde avant écriture, renseigne `credentials.hubspotToken` et un marqueur interne non exposé ; renvoie seulement `{ migrated: boolean }`. Aucune valeur n'est journalisée.

- [ ] **Step 1: Écrire et faire échouer les tests en répertoire temporaire.**

```js
// Quatre profils dont un unique eTeamsys hubspot : seul ce profil reçoit fake-token.
// Deuxième exécution : aucun nouveau backup ni écriture.
// Après retrait volontaire et avec l'ancien secret encore présent :
// pas de réinjection grâce au marqueur.
// Nom absent, deux noms eTeamsys, secret absent, profil déjà configuré :
// aucune affectation arbitraire.
// JSON corrompu ou sauvegarde impossible : fichier actif inchangé.
```

- [ ] **Step 2: Implémenter une sauvegarde exclusive avant migration et une écriture atomique.** Réutiliser le store, préserver tous les profils/champs/crédits, ne jamais écraser une sauvegarde existante ; enregistrer le marqueur dans le seul profil ciblé. Au démarrage, appeler la migration avec `process.env.HUBSPOT_TOKEN` uniquement à cet endroit. Journaliser succès/absence/ambiguïté sans jeton ni données CRM. La suppression du Secret Replit attend la vérification et reste à la main de l'utilisateur.

- [ ] **Step 3: Supprimer les variables CRM globales de `.env.example`, mettre à jour le README (admin, isolation, stockage local en clair, risque d'accès public), et conserver `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` globaux. Mentionner explicitement le `429` HubSpot comme incident distinct non corrigé.**

- [ ] **Step 4: Exécuter `npm test && git diff --check`, puis redémarrer le workflow une fois après l'ensemble des changements.** Vérifier sans afficher de secrets : eTeamsys configuré, les autres profils HubSpot en démo, les API admin expurgées, Preview admin/client, logs sans valeur sensible. Noter dans le rapport final le nom exact du profil enregistré et le booléen `credentialsConfigured` renvoyé par l'API. Ne pas interpréter un `429` comme une migration échouée ; le signaler séparément.

- [ ] **Step 5: Après accord de l'utilisateur sur ce plan et implémentation validée, committer uniquement le code, la documentation et les tests puis pousser `main` vers le dépôt existant.** Ne pas forcer l'ajout de `data/clients.json`, sauvegardes ou document joint. Vérifier `git status -sb` et le suivi distant.