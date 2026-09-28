# POC eTeamsys : profils clients et copilote de démonstration

Ce prototype illustre un **socle commun** (briefing, funnel, relances,
revenu attribué, hygiène des données) alimenté par trois sources CRM.
Le backoffice `/admin` crée des profils de démonstration, puis le bouton
« Voir en tant que ce client » ouvre l'application avec le profil choisi :

1. **HubSpot** — connecteur API réel, en lecture seule. Testé sur le
   vrai compte HubSpot d'eTeamsys.
2. **Odoo** — connecteur API (JSON-RPC), pour les prospects qui
   utilisent Odoo comme CRM.
3. **CRM basique eTeamsys** — pas un connecteur, mais un vrai mini-CRM
   autonome (formulaire d'ajout + import Excel/CSV), proposé aux
   prospects qui partent d'un fichier Excel ou d'un outil fait maison
   plutôt que de tenter d'absorber la complexité de leur système.

Sans clé Anthropic, le copilote répond par règles à partir des indicateurs CRM.
Avec `ANTHROPIC_API_KEY` configurée en Secret, il utilise Anthropic pour répondre
à partir des indicateurs et d'un aperçu de 20 contacts du profil actif.
Les suggestions restent calculées localement. Un crédit fictif est débité
par réponse réussie; la recharge est une simulation, sans paiement.

> **Outil interne — non protégé, ne pas exposer publiquement tel quel.**
> Les profils ne sont pas des comptes utilisateurs isolés. Ne pas importer
> de vraies données clients ni configurer un token de production sur une
> application accessible publiquement sans authentification et isolation.

## Lancer le prototype sur Replit

1. Installer les dépendances avec `npm install`, puis lancer `npm start`
   (port 5000). Lancer les vérifications avec `npm test`.
2. Ouvrir `/admin` et créer trois profils fictifs : un avec « Aucun CRM »,
   un avec HubSpot, un avec Odoo. Le nom, le secteur parmi sept choix, le
   statut, le consultant, les onze modules et le solde sont modifiables.
3. Cliquer sur « Voir en tant que ce client » pour ouvrir la vue principale.
   Sans profil sélectionné, celle-ci invite à revenir sur `/admin`.
4. Ouvrir Contacts, Entreprises et Tableaux de bord. Les autres entrées
   sont des aperçus ou désactivées selon les réglages du profil.

Les profils et crédits sont stockés dans `data/clients.json`, créé à la
première sauvegarde et ignoré par Git. La suppression d'un profil efface
sa configuration et son historique de crédits, pas les contacts partagés.
Les anciennes lectures `/api/overview?source=hubspot|odoo|crm-basique`
restent utilisables; les nouvelles routes du copilote exigent `clientId`.

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
3. Relancer le Repl. Le badge de source passe en "LIVE" si l'API répond.
   Sans token, le tableau de bord HubSpot affiche l'instantané daté du
   18/09/2026, mais **les listes Contacts/Entreprises utilisent des
   exemples fictifs** signalés DÉMO, et non des contacts tirés de cet
   instantané.

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

### Profils, navigation et crédits

Chaque profil possède ses propres réglages et son solde initial de **20
crédits**. Une question libre, le bouton Résumé ou une suggestion utilisée
coûte **1 crédit**; à zéro, le copilote affiche « Crédits épuisés ».
« Recharger (simulation) » ajoute **20 crédits fictifs**, sans paiement.
Le solde et l'historique persistent après redémarrage; un changement
manuel du solde depuis `/admin` est journalisé.

Les profils HubSpot partagent le même token global, les profils Odoo
partagent les mêmes variables Odoo, et les profils sans CRM partagent
`data/crm-basique.json`. Ces scénarios **ne séparent pas les données entre
clients**. Un connecteur configuré qui échoue affiche une erreur au lieu
de remplacer silencieusement le résultat par un exemple fictif.

| Module | État dans cette phase |
| --- | --- |
| Contacts | Liste paginée : HubSpot/Odoo en lecture seule (démo fictive sans identifiants), CRM basique avec ajout et import |
| Entreprises | HubSpot Companies/Odoo partenaires entreprises en lecture seule; CRM basique : regroupement dérivé des contacts |
| Transactions | Aperçu; le funnel existant reste dans Tableaux de bord |
| E-mails marketing | Aperçu, aucun e-mail envoyé |
| SEO | Aperçu, aucun connecteur SEOCruz actif |
| Réseaux sociaux | À venir, sans données simulées |
| Publicités | Aperçu, aucun connecteur SEA actif |
| Formulaires | Aperçu, pas de liste de formulaires active |
| Pages de destination | Aperçu, pas de constructeur client |
| Pages de site web | Aperçu, pas de connecteur Google Search Console |
| Tableaux de bord | Briefing, funnel graphique/tableau, contacts et relances existants; statut de module `demo` par défaut, vue consultable |

Chaque entrée peut être réglée sur `actif`, `demo` ou `non-applicable`.
`non-applicable` désactive l'entrée. `actif` ne construit pas pour autant
un module encore en aperçu. Le badge du CRM (LIVE/DÉMO) et le statut du
module sont distincts. Le copilote utilise Anthropic seulement si
`ANTHROPIC_API_KEY` est configurée; sinon ses réponses restent simulées,
même quand la source CRM est LIVE. `ANTHROPIC_MODEL` permet de choisir un
autre modèle (facultatif). Le `demoMode` de la réponse du copilote décrit
le mode de réponse de l'assistant, pas la provenance LIVE/DÉMO des données CRM.
« Créer » et « Réunions » sont désactivés.

## Ce que ce POC démontre

- L'architecture "socle stable + adaptateurs d'entrée" alimente les
  mêmes vues Contacts, Entreprises et Tableaux de bord selon le CRM du
  profil; le tableau de bord conserve ses indicateurs et son briefing.
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

- Pas d'authentification, d'autorisations ni d'isolation multi-client :
  `/admin` et ses routes sont accessibles sans connexion. Ne pas publier
  tel quel; prévoir une vraie sécurité avant tout usage avec données réelles.
- Le connecteur Odoo n'a pas été validé sur un compte réel (voir
  ci-dessus) — c'est le point le plus important à traiter avant de le
  montrer à un client.
- Le CRM basique utilise un fichier JSON local, pas une vraie base de
  données ni une isolation multi-clients.
- Les autres modules de la barre latérale restent des aperçus et ne sont
  pas des intégrations réelles. Les tableaux de bord sectoriels sont
  reportés à une phase ultérieure.
- Les endpoints de comptage HubSpot sont rapides, mais les sommes
  paginent jusqu'à 1000 enregistrements ; suffisant pour ce POC, à
  revoir avant un usage en production.
