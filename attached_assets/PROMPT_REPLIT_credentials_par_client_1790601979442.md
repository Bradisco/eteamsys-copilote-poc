# Prompt pour l'agent Replit — Identifiants CRM par client (pas par application)

Vérifié directement depuis le dépôt public `Bradisco/eteamsys-copilote-poc`, commit `e51fa46` : dans `server.js`, `HUBSPOT_TOKEN` (ligne ~48) et les quatre variables `ODOO_URL`/`ODOO_DB`/`ODOO_USERNAME`/`ODOO_PASSWORD` (lignes ~51-54) sont des constantes lues une seule fois depuis `process.env` au démarrage du serveur, partagées par **toute** l'application. Confirmé aussi : `data/clients.json` est déjà listé dans `.gitignore` — c'est le bon endroit pour stocker des identifiants clients, ils ne partiront jamais vers le dépôt public.

Mike vient de créer le profil "eteamsys" et d'y attribuer un jeton HubSpot. Mais avec l'architecture actuelle, ce jeton est en réalité utilisé par **tous** les profils dont `crmExistant = hubspot`, pas seulement celui-là. Ce prompt corrige ça : chaque profil client doit porter ses propres identifiants CRM.

## Modification du modèle client (`lib/client-store.js`)

Ajoute un champ `credentials` (objet, potentiellement vide `{}`) au schéma client, en plus des champs déjà listés (`nom`, `secteur`, `crmExistant`, `modules`, `credits`, `consultantReferent`, `statut`). Sa forme dépend de `crmExistant` :

- `crmExistant: 'hubspot'` → `credentials: { hubspotToken: string }`
- `crmExistant: 'odoo'` → `credentials: { odooUrl: string, odooDb: string, odooUsername: string, odooPassword: string }`
- `crmExistant: 'aucun'` → `credentials: {}` (le CRM basique local n'a pas besoin d'identifiants externes)

Valide que la forme correspond au `crmExistant` choisi (ex. refuse un `hubspotToken` sur un profil `odoo`). Si `crmExistant` change sur un profil existant, les anciens identifiants devenus incohérents doivent être effacés, pas conservés silencieusement.

## Modification des connecteurs (`server.js`)

Supprime les constantes globales `HUBSPOT_TOKEN` / `ODOO_URL` / `ODOO_DB` / `ODOO_USERNAME` / `ODOO_PASSWORD` lues depuis `process.env`. Les fonctions `hsSearch`, `hsList`, `hsCount`, `hsSum`, `odooCall`, `odooLogin`, `odooExecuteKw`, `getHubspotOverview`, `getOdooOverview` doivent recevoir les identifiants en paramètre (ou via une petite fabrique `hubspotClient(token)` / `odooClient({url, db, username, password})`), résolus à partir du profil client actif au moment de la requête — pas au démarrage du serveur.

`sourceForClient(client)` (dans `lib/client-store.js`) continue de résoudre `crmExistant` vers `'hubspot'`/`'odoo'`/`'crm-basique'` comme aujourd'hui ; ajoute à côté une fonction qui retourne aussi les identifiants du profil (`credentialsForClient(client)` ou similaire), pour que les routes n'aient qu'à faire `getHubspotOverview(client.credentials.hubspotToken)` sans connaître les détails du connecteur.

**Comportement démo inchangé** : si `credentials.hubspotToken` est absent ou vide sur un profil `hubspot`, ce profil reste en mode démo (`HS_DEMO_SNAPSHOT`), exactement comme aujourd'hui quand la variable d'environnement était absente — seule la source de vérité change (par-client au lieu de globale), pas le comportement de repli.

## `.env.example`

Retire `HUBSPOT_TOKEN` et les 4 variables `ODOO_*` — elles n'ont plus de sens au niveau application. Garde uniquement `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`, qui restent globales à raison : ce n'est pas une donnée client, c'est le moteur du copilote partagé par toute la plateforme.

## Interface admin (`public/admin.html` / `public/admin.js`)

Ajoute, dans le formulaire d'édition d'un client, les champs d'identifiants correspondant au `crmExistant` sélectionné (affichage conditionnel, comme c'est probablement déjà fait pour d'autres champs dépendant du type de CRM). Points de sécurité d'interface, minimaux mais nécessaires :

- Les champs de type jeton/mot de passe (`hubspotToken`, `odooPassword`) sont des `<input type="password">`, jamais affichés en clair une fois enregistrés.
- Une fois un identifiant configuré, l'admin affiche un état "configuré" (ex. un badge ou un texte "Jeton enregistré") plutôt que de renvoyer la valeur réelle au navigateur — l'API ne doit jamais renvoyer les identifiants en clair dans les réponses `GET /api/admin/clients`, seulement un booléen `hasCredentials` ou équivalent.
- Modifier un identifiant existant nécessite de le ressaisir entièrement (pas de pré-remplissage avec la valeur réelle).

## Migration

Le profil "eteamsys" existe déjà dans `data/clients.json` sans ce nouveau champ `credentials` structuré (Mike l'a configuré via l'ancien mécanisme, le Secret Replit global `HUBSPOT_TOKEN`). Pour ce profil précis uniquement, migre la valeur actuelle du Secret `HUBSPOT_TOKEN` vers `credentials.hubspotToken` de ce profil lors du premier démarrage après la mise à jour (migration ponctuelle et loggée, pas un mécanisme permanent) — puis le Secret global `HUBSPOT_TOKEN` peut être supprimé des Secrets Replit. Si `data/clients.json` ne contient aucun profil `hubspot` sans `credentials`, ne fais rien de spécial.

## Tests

Ajoute/étends `tests/client-store.test.js` pour la validation du champ `credentials` selon `crmExistant`. Ajoute un test vérifiant que deux profils HubSpot avec des jetons différents obtiennent bien des réponses différentes (mock des appels API), et qu'un profil sans identifiants reste en mode démo. Vérifie aussi qu'un `GET /api/admin/clients` ne renvoie jamais les identifiants en clair.

## Ce qui n'est pas demandé

- Pas de chiffrement au repos des identifiants dans `data/clients.json` — connu et accepté comme limitation de ce stade du POC, à revoir si la plateforme dépasse l'usage interne.
- Ne touche pas au copilote Anthropic ni à `ANTHROPIC_API_KEY` — cette clé reste globale.
- Ne construis pas d'interface de rotation/expiration des identifiants — hors scope.

## Definition of done

- Deux profils clients avec des jetons HubSpot différents lisent chacun leur propre compte, sans interférence.
- `data/clients.json` reste hors Git (déjà le cas).
- `GET /api/admin/clients` ne retourne jamais un identifiant en clair.
- Le profil "eteamsys" existant continue de fonctionner après migration, sans ressaisie manuelle du jeton déjà configuré.
- Tous les tests existants + nouveaux passent.
- Commit et push vers `Bradisco/eteamsys-copilote-poc` à la fin, avec un message de commit décrivant le changement.
