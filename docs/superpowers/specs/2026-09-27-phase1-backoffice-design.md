# Spécification de conception : phase 1 du POC eTeamsys

Date : 2026-09-27

## Objectif

Faire évoluer le POC existant en une démonstration cohérente de la plateforme eTeamsys pour des entreprises avec ou sans CRM. Ajouter un backoffice interne qui permet de configurer plusieurs profils de démonstration, puis d'afficher l'application « en tant que » l'un de ces profils.

Cette phase reste un prototype. Elle ne fournit ni comptes utilisateurs, ni authentification, ni isolation robuste des données, ni connexions CRM distinctes par client.

## Approches considérées

1. **Couche de configuration locale au-dessus des adaptateurs existants** : les profils clients sont conservés dans `data/clients.json`; les routes sélectionnent un adaptateur à partir de `clientId`. C'est l'approche retenue, conforme au POC et au prompt de backoffice.
2. **Infrastructure multi-client complète** : stockage et identifiants propres à chaque client, authentification et isolation. Écartée pour cette phase, explicitement hors périmètre.
3. **Backoffice d'apparence seulement** : écran sans routes de gestion ni bascule réelle de profil. Écartée, car elle ne permettrait pas de démontrer les parcours demandés.

## Décisions de produit

- La source de données d'un profil vient de `crmExistant` :
  - `hubspot` utilise l'adaptateur HubSpot ;
  - `odoo` utilise l'adaptateur Odoo ;
  - `aucun` utilise le CRM basique eTeamsys.
- Les profils et leurs crédits sont distincts. Les sources et données CRM ne le sont pas :
  - tous les profils HubSpot utilisent le même `HUBSPOT_TOKEN` configuré dans l'environnement ;
  - tous les profils Odoo utilisent les mêmes variables Odoo ;
  - les profils sans CRM partagent le jeu fictif `data/crm-basique.json`.
- Cette configuration sert à comparer des scénarios de démonstration. Elle ne doit pas recevoir de vraies données de plusieurs clients.
- Le tableau de bord déjà existant reste accessible et continue d'utiliser ses indicateurs actuels. La personnalisation des KPI selon le secteur est reportée à la phase 4.
- Le copilote est simulé à partir des données disponibles. Aucun fournisseur d'IA ni service de paiement n'est ajouté.

## Modèle des profils clients

`data/clients.json` contient un tableau de profils avec les champs suivants :

- `id` : identifiant stable généré par le serveur.
- `nom` : nom fictif ou nom de démonstration du client.
- `secteur` : l'une des valeurs suivantes :
  - E-commerce
  - Promoteur immobilier / constructeur de maisons
  - Fabricant/installateur (vérandas, fenêtres, aménagement extérieur)
  - Services B2B (agences, cabinets, consultants)
  - Retail multi-points de vente / franchise
  - Pharma / santé
  - Artisans / TPE locales
- `crmExistant` : `aucun`, `hubspot` ou `odoo`.
- `modules` : statut `actif`, `demo` ou `non-applicable` pour chacune des clés :
  `contacts`, `entreprises`, `transactions`, `emailsMarketing`, `seo`,
  `reseauxSociaux`, `publicites`, `formulaires`, `pagesDestination`,
  `pagesSiteWeb`, `tableauxDeBord`.
- `credits` : `{ solde, historique }`, conservé avec le profil.
- `consultantReferent` : texte libre.
- `statut` : `prospect`, `actif` ou `résilié`.
- `creeLe` : date ISO.

Valeurs par défaut : secteur `Artisans / TPE locales`, `crmExistant: "aucun"`,
statut `prospect`, solde de 20 crédits, Contacts et Entreprises à `actif`,
tous les autres modules à `demo`, consultant vide, historique vide.

Sens des statuts de module :

- `actif` : module activé pour le profil et utilisable si la fonctionnalité existe.
- `demo` : aperçu consultable, marqué DÉMO.
- `non-applicable` : entrée désactivée ou indisponible pour ce profil.
- Un statut `actif` ne crée pas une fonctionnalité absente : les modules non construits
  en phase 1 restent des aperçus explicites.
- Le badge d'un module et celui de sa source sont distincts : un CRM connecté peut
  alimenter un tableau de bord dont le module est encore en mode démo. Le copilote
  lui-même est toujours présenté comme une simulation dans cette phase.

Le statut client (`prospect`, `actif`, `résilié`) est une information de gestion. Sans
authentification, il ne constitue pas un contrôle d'accès.

## Backoffice interne

Créer une page séparée accessible à `/admin`, avec un lien discret « Gérer » dans la
navigation. Afficher en permanence cet avertissement :

> Outil interne — non protégé, ne pas exposer publiquement tel quel.

La page comporte :

1. Une table avec le nom, le secteur, le CRM, le statut et le solde de crédits.
2. Un formulaire de création et d'édition avec tous les champs du profil. Les modules
   ont chacun un choix à trois états. L'historique des crédits est consultable ; une
   modification manuelle du solde ajoute une entrée d'ajustement.
3. Un bouton « Voir en tant que ce client » qui ouvre la vue principale avec son
   `clientId`.
4. Une suppression de profil avec confirmation. Elle supprime uniquement la
   configuration et l'historique de crédits du profil ; elle ne supprime pas le jeu
   CRM basique partagé.

L'écran permet de créer depuis son formulaire au moins trois profils fictifs couvrant
les cas suivants : sans CRM, HubSpot et Odoo. Les comptes HubSpot/Odoo apparaissent en
mode DÉMO si leurs identifiants globaux ne sont pas configurés. Les intégrations réelles
ne sont pas nécessaires pour la démonstration.

## Navigation et vues de démonstration

Garder le HTML/CSS/JavaScript existant sans introduire de framework. Remplacer la
navigation actuelle par une barre latérale avec les entrées, dans cet ordre :

1. Contacts
2. Entreprises
3. Transactions
4. E-mails marketing
5. SEO
6. Réseaux sociaux
7. Publicités
8. Formulaires
9. Pages de destination
10. Pages de site web
11. Tableaux de bord

Contacts et Entreprises sont disponibles par défaut. Tableaux de bord, configuré
`demo` par défaut, reste également consultable afin de préserver la fonctionnalité
principale déjà démontrée ; s'il est configuré `non-applicable`, son entrée est
désactivée. Les autres modules sont déterminés par leur statut de profil ; ceux qui
ne sont pas implémentés affichent un aperçu honnête, sans fausses données présentées
comme réelles.

La vue principale indique le profil sélectionné, son secteur et son CRM, ainsi que le
statut DÉMO/LIVE fourni par l'adaptateur. Le sélecteur source global est remplacé dans
l'interface par la sélection « Voir en tant que ce client ». Les routes conservent
toutefois la compatibilité avec le paramètre historique `source`.
Si aucun profil n'existe encore ou n'est sélectionné, la page invite à ouvrir
`/admin` pour en créer ou en choisir un. Un `clientId` inconnu produit une erreur
visible, jamais une bascule silencieuse vers un autre profil.

### Contacts

- HubSpot : liste en lecture seule issue de l'objet Contacts.
- Odoo : liste en lecture seule des partenaires représentant des personnes.
- CRM basique : contacts du jeu local partagé.
- Le formulaire d'ajout et l'import Excel/CSV existants restent disponibles pour la
  source CRM basique uniquement. HubSpot et Odoo restent en lecture seule.

### Entreprises

- HubSpot : entreprises de l'objet Companies.
- Odoo : partenaires marqués comme entreprises.
- CRM basique : regroupement dérivé des contacts par champ `société`, indiqué comme
  une vue dérivée et non une table d'entreprises.

Les listes sont consultables et ne proposent pas de modification/suppression des
enregistrements HubSpot ou Odoo. Quand un adaptateur n'est pas configuré, les exemples
affichés sont fictifs et marqués DÉMO. Si un adaptateur configuré échoue, l'interface
montre l'erreur au lieu de substituer silencieusement un jeu fictif.

### Tableau de bord

Conserver le briefing, le funnel, la répartition des contacts, les relances, le
changement de vue graphique/tableau et les autres indicateurs actuels. Ajouter les
identifiants du profil comme contexte d'affichage, sans calcul sectoriel en phase 1.

## Copilote et crédits simulés

Ajouter un panneau latéral de copilote, utilisable depuis les vues principales :

- message d'accueil générique, sans supposer l'identité d'un utilisateur ;
- 2 à 4 suggestions calculées uniquement à partir des données disponibles pour la
  source sélectionnée ; omettre une suggestion si la donnée nécessaire n'existe pas ;
- actions « Résumé » et « Comment faire » ;
- champ de question libre, limité à des réponses de démonstration fondées sur les
  données chargées ; indiquer clairement lorsqu'une question ne peut pas être traitée ;
- boutons « Créer » et « Réunions » désactivés, avec une indication « Bientôt
  disponible » ;
- pour HubSpot ou Odoo, expliquer que l'assistant est fourni par eTeamsys et non par
  l'IA native du CRM, sans annoncer de prix.

Chaque question, résumé ou suggestion exécutée coûte un crédit. Le solde initial est
de 20 par profil. Une recharge simulée ajoute 20 crédits et est proposée quand le solde
est épuisé. Le solde et l'historique sont persistés dans le profil client ; aucune
transaction réelle n'est effectuée.

## Routes et sélection de profil

Ajouter les routes de gestion :

- `GET /api/admin/clients`
- `POST /api/admin/clients`
- `PUT /api/admin/clients/:id`
- `DELETE /api/admin/clients/:id`

Ajouter `GET /api/contacts`, `GET /api/companies`, `POST /api/copilot/ask`,
`GET /api/copilot/credits` et `POST /api/copilot/recharge`. Les lectures normalisées
Contacts et Entreprises, ainsi que `GET /api/overview`, acceptent `clientId`
comme paramètre de sélection. S'il est présent, il détermine `crmExistant` et prime
sur `source`. Sans `clientId`, ces routes de lecture continuent d'accepter
`source=hubspot|odoo|crm-basique` pour préserver l'usage existant de
`GET /api/overview`. Les nouvelles routes du copilote exigent `clientId`, car les
crédits sont rattachés à un profil et ne peuvent pas être débités sur une source
globale sans propriétaire.

Un identifiant inconnu renvoie une erreur explicite. Les entrées d'administration sont
validées côté serveur avant sauvegarde. Aucune route d'administration n'est protégée
par authentification dans ce prototype.

## Hors périmètre

- authentification, autorisations ou isolation multi-client robuste ;
- identifiants ou connexions HubSpot/Odoo propres à chaque profil ;
- préparation à l'exposition publique ou à l'utilisation avec des données clients réelles ;
- vraie IA générative, paiement, écriture CRM par le copilote ;
- transactions, e-mails marketing, SEO, réseaux sociaux, publicités, formulaires,
  pages de destination et pages de site web fonctionnels ;
- tableaux de bord spécialisés par secteur.

L'adaptateur Odoo reste non validé sur une instance réelle. Les profils Odoo de test
utilisent donc l'exemple DÉMO tant que l'instance et ses identifiants ne sont pas
configurés et validés.

## Vérifications de fin de phase

- Créer depuis `/admin` les trois profils de démonstration demandés, puis les modifier,
  consulter et supprimer un profil de test.
- Basculer avec « Voir en tant que ce client » entre CRM basique, HubSpot et Odoo ;
  vérifier les badges DÉMO/LIVE et les erreurs explicites en cas d'échec.
- Vérifier Contacts, Entreprises, le regroupement dérivé du CRM basique et le maintien
  du tableau de bord.
- Vérifier que les crédits sont distincts par profil, débités à chaque appel du
  copilote, rechargés uniquement en simulation et persistés après redémarrage.
- Vérifier que l'ajout de contacts et l'import Excel/CSV restent fonctionnels dans le
  CRM basique.
- Vérifier le rendu sur grand et petit écran, ainsi que la navigation clavier de
  l'administration et du panneau assistant.
- Documenter le backoffice, le partage des données de démonstration et l'avertissement
  de sécurité dans le README.