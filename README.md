# POC — Copilote Commercial IA eTeamsys

Prototype qui illustre l'architecture retenue pour le module CRM :
un **socle commun** (briefing, funnel commercial, relances, revenu
attribué, hygiène des données) alimenté par **trois sources
interchangeables**, sélectionnables en direct dans la page via les
pastilles "Source :" en haut :

1. **HubSpot** — connecteur API réel, en lecture seule. Testé sur le
   vrai compte HubSpot d'eTeamsys.
2. **Odoo** — connecteur API (JSON-RPC), pour les prospects qui
   utilisent Odoo comme CRM.
3. **CRM basique eTeamsys** — pas un connecteur, mais un vrai mini-CRM
   autonome (formulaire d'ajout + import Excel/CSV), proposé aux
   prospects qui partent d'un fichier Excel ou d'un outil fait maison
   plutôt que de tenter d'absorber la complexité de leur système.

Aucune IA "boîte noire" : toute la logique de calcul est lisible dans
`server.js`. Les modules **Acquisition** et **SEO Cruz** restent
simulés (étiquetés "aperçu") en attendant la confirmation de l'accès
aux données du générateur de trafic / SEO Cruz.

## Déployer sur Replit

1. Créer un nouveau Repl → Node.js (ou "Blank Repl" en précisant
   Node.js), puis importer ce dossier (`eteamsys_poc`) — voir la
   section "Comment importer sans GitHub" plus bas si besoin.
2. Lancer `npm install` dans le shell Replit (installe Express et la
   librairie `xlsx` utilisée pour l'import Excel).
3. Cliquer sur "Run". Le site s'ouvre avec la source **HubSpot** par
   défaut, en **mode démo** (badge orange). C'est normal tant qu'aucune
   variable n'est configurée.
4. Le **CRM basique eTeamsys** fonctionne immédiatement, sans rien
   configurer : cliquez sur la pastille "Source : CRM basique
   eTeamsys" pour voir le formulaire d'ajout de contact et l'import de
   fichier Excel/CSV.

### Comment importer sans GitHub

Si vous n'avez pas de dépôt GitHub pour ce projet : décompressez le
zip sur votre ordinateur, puis dans le panneau de fichiers de Replit,
utilisez "Upload file"/glisser-déposer pour transférer tout le contenu
du dossier (`server.js`, `package.json`, `public/`, `data/`,
`README.md`, `.env.example`).

## Connecter les vraies données (optionnel, pour passer en live)

### HubSpot

1. HubSpot → Paramètres → Intégrations → Applications privées → créer
   une application privée avec les scopes en lecture seule :
   `crm.objects.contacts.read`, `crm.objects.deals.read`,
   `crm.objects.companies.read`.
2. **Ne jamais coller ce token dans un chat.** Dans Replit : onglet
   "Secrets" → nouvelle variable `HUBSPOT_TOKEN` → coller le token là.
3. Relancer le Repl. Le badge passe en "LIVE".

### Odoo

1. Dans Replit "Secrets", ajouter `ODOO_URL` (ex.
   `https://monclient.odoo.com`), `ODOO_DB` (nom de la base), et un
   couple `ODOO_USERNAME` / `ODOO_PASSWORD` (idéalement un utilisateur
   dédié en lecture seule si votre configuration Odoo le permet).
2. Relancer le Repl.

**Important, honnêteté de scope** : ce connecteur Odoo suit les
conventions standards de l'API externe Odoo (JSON-RPC sur
`/jsonrpc`, modèle `crm.lead` pour les leads/opportunités, `stage_id`
pour l'étape du pipeline, `expected_revenue` pour le montant,
`res.partner` pour les clients). Il **n'a pas pu être testé sur un
compte Odoo réel** dans cette session (aucun compte de test
disponible) — contrairement au connecteur HubSpot, validé sur les
vraies données eTeamsys. Avant toute mise en production, il faut
vérifier ces noms de champs sur une instance Odoo réelle (ils peuvent
varier selon la version et la configuration du client : `is_won` sur
`stage_id` par exemple n'existe pas dans toutes les versions). Le
code est écrit pour échouer proprement et remonter l'erreur plutôt que
de planter si un champ ne correspond pas.

### CRM basique eTeamsys

Rien à configurer : il tourne toujours, avec un stockage local dans
`data/crm-basique.json` (créé automatiquement à partir de
`data/crm-basique.seed.json` au premier démarrage — un exemple fictif,
"Menuiserie Delvaux", inspiré du profil "artisan/TPE" déjà identifié
dans la segmentation client). Depuis la page, on peut :

- Ajouter un contact via un formulaire simple (nom, société, email,
  téléphone, statut).
- Importer un fichier Excel (`.xlsx`) ou CSV : les colonnes sont
  reconnues automatiquement par un mapping heuristique (nom / société
  / email / téléphone, quel que soit l'ordre ou les accents dans les
  en-têtes) — testé avec succès sur un fichier d'exemple pendant cette
  session. C'est une version simple du "mapping assisté" évoqué dans
  le document de vision ; une version future pourrait le rendre plus
  robuste avec un vrai modèle de langage plutôt qu'une liste de
  synonymes.

Le stockage JSON local est adapté à un POC, pas à de la production
(pas de gestion multi-clients, pas de base de données réelle) — à
remplacer par une vraie base avant d'aller plus loin.

## Ce que ce POC démontre

- L'architecture "socle stable + adaptateurs d'entrée" retenue pour le
  module CRM fonctionne réellement : la même page (briefing, funnel,
  relances, revenu, hygiène des données) s'affiche à l'identique quelle
  que soit la source choisie — HubSpot, Odoo, ou le CRM basique
  propriétaire. Ce n'est pas trois maquettes différentes, c'est un seul
  frontend alimenté par trois backends normalisés.
- Une vraie photographie des données eTeamsys au 18/09/2026 côté
  HubSpot (voir `HS_DEMO_SNAPSHOT` dans `server.js`) : environ 25 000
  contacts, un pipeline commercial qui coexiste avec 3 autres pipelines
  HubSpot (RH, ventes partagées, contrats en cours), et plusieurs
  centaines d'opportunités ouvertes jamais mises à jour — ce qui
  justifie concrètement la couche de nettoyage "Palier 0" évoquée dans
  la vision produit.
- Un import Excel fonctionnel de bout en bout pour le CRM basique : un
  fichier avec des en-têtes français accentués ("Société", "E-mail",
  "Téléphone") a été importé avec succès pendant cette session, preuve
  que le mapping heuristique fonctionne au-delà d'un cas jouet.

## Limites de ce POC

- Pas d'authentification, pas de cache — à ne pas exposer publiquement
  avec un vrai token sans ajouter au moins un mot de passe basique.
- Le connecteur Odoo n'a pas été validé sur un compte réel (voir
  ci-dessus) — c'est le point le plus important à traiter avant de le
  montrer à un client.
- Le CRM basique utilise un fichier JSON local, pas une vraie base de
  données ni une isolation multi-clients.
- Acquisition et SEO Cruz sont des cartes non connectées, pas des
  intégrations réelles.
- Les endpoints de comptage HubSpot sont rapides, mais les sommes
  paginent jusqu'à 1000 enregistrements ; suffisant pour ce POC, à
  revoir avant un usage en production.
