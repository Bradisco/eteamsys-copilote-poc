# Phase 2 : Transactions, relances, pages de destination et tableau de bord sectoriel

## Intention et périmètre

Compléter les quatre vues encore réduites à un texte d'attente dans le POC eTeamsys. Un profil de démonstration conserve ses réglages `actif`, `demo` ou `non-applicable` par module. Le CRM basique partage ses données entre les profils qui l'utilisent ; HubSpot et Odoo restent des sources communes à leurs profils respectifs, sans isolation multi-client. Le copilote Anthropic et les autres modules ne sont pas modifiés.

Le résultat attendu : une vue Transactions avec cinq stades et des actions pour le CRM basique, une liste de relances sans envoi d'e-mail, des pages de destination en lecture seule et un tableau de bord qui explique le secteur actif sans supprimer son briefing narratif. Pas de connecteur SEO/SEA, de constructeur de pages, d'authentification ni de paiement dans ce chantier.

## Approche retenue

Le serveur prépare les données normalisées et valide les écritures. Le navigateur affiche les vues et leurs états ; il ne recalcule ni les règles de relance ni les stades des transactions. Le tableau `opportunities` du CRM basique demeure l'unique stockage des transactions. Les autres CRM continuent à fournir leur pipeline par `overview.funnel`. Aucun second tableau `transactions` et aucun filtre CRM externe non disponible ne sont créés.

## Transactions et migration

### Données

Les cinq codes autorisés sont, dans cet ordre : `initiation`, `offre-envoyee`, `negociation`, `gagne`, `perdu`. Leurs libellés visibles sont **Initiation**, **Offre envoyée**, **Négociation**, **Won** et **Lost**. Le funnel de `getCrmBasiqueOverview()` utilise ces cinq stades et le même tableau `opportunities` que la vue Transactions, y compris le stade Lost.

Migration des anciennes valeurs : `nouveau` et `qualifie` deviennent `initiation` (une qualification ne prouve pas une négociation) ; `proposition` devient `offre-envoyee` ; `gagne` et `perdu` restent inchangés. Une étape inconnue entraîne une erreur explicite, sans effacement ni reclassement arbitraire. La migration conserve identifiants, `contactId`, titre, montant et `dateMaj`, ainsi que tout autre champ existant. La date de création d'une ancienne entrée reste absente si elle n'est pas connue ; les nouvelles entrées ont `creeLe` et `dateMaj`. L'opération est idempotente, conserve une copie du fichier actif avant sa première écriture de migration et n'écrase jamais une copie de sauvegarde préexistante. En cas d'échec de sauvegarde ou de fichier invalide, elle échoue sans remplacer les données par une liste vide.

Le fichier d'exemple initial est migré de la même manière et reçoit **un nouvel exemple distinct** en `negociation`. Il ne sert jamais à remplacer le fichier actif. Le fichier actif existant conserve ses lignes : on ne lui injecte pas automatiquement le nouvel exemple.

### API et permissions

- `GET /api/transactions?clientId=...` exige un profil connu et un module Transactions différent de `non-applicable`. Il retourne la provenance des données, le funnel et, pour le CRM basique, les entrées avec leurs contacts associés. Chaque stade CRM basique porte un comptage et la somme des montants renseignés. Pour HubSpot/Odoo, il réutilise `overview.funnel` : les montants par stade absents sont indiqués comme indisponibles, jamais égaux à zéro par défaut.
- `POST /api/crm-basique/transactions` exige `clientId`, `contactId`, un titre non vide, un stade parmi les cinq (par défaut `initiation`) et un montant facultatif, numérique, fini et positif ou nul. Il n'écrit que dans `opportunities`. Il exige un profil CRM basique dont le module est `actif`, et un contact existant.
- `PATCH /api/crm-basique/transactions/:id` exige le même droit d'écriture et ne change que le stade et `dateMaj`. Une transaction introuvable, un contact inconnu, un profil incorrect, un module non actif ou un stade invalide produisent une erreur HTTP claire, sans écriture.

Le CRM basique est partagé : un changement réalisé avec un profil CRM basique autorisé est visible dans les autres profils CRM basique. HubSpot/Odoo restent en lecture seule, quel que soit leur statut de module. Ce POC n'a pas d'authentification ; ces vérifications empêchent les erreurs de source et de statut, mais ne constituent pas une protection contre un visiteur externe.

## E-mails marketing : liste de relances uniquement

`GET /api/email-reminders?clientId=...` exige un profil dont le module n'est pas `non-applicable`. Pour le CRM basique, le serveur utilise **la même règle** que `getCrmBasiqueOverview()` : contact lead ou qualifié sans `derniereRelance`, ou dont la dernière relance date de plus de sept jours. La réponse contient les contacts éligibles, leur nom, e-mail s'il existe, date de dernière relance connue ou absence de date, et raison calculée. Le tableau porte les colonnes **Nom**, **E-mail**, **Dernier contact connu** et **Raison** ; une note précise que la seule date disponible est la dernière relance, pas un journal complet des échanges. Un contact sans e-mail est signalé comme tel, pas présenté comme directement joignable.

Pour HubSpot et Odoo, cette route renvoie exclusivement les `relanceItems` agrégés déjà calculés par l'overview, avec la date/provenance de cet overview. La vue affiche ces nombres et dit clairement que ni la liste nominative ni la date individuelle de dernier contact ne sont disponibles. Aucun nom, date ou e-mail fictif n'est extrapolé à partir d'un compteur.

Aucun composeur, envoi, tracking ou écriture de contact.

## Pages de destination

`GET /api/landing-pages?clientId=...` renvoie une liste en lecture seule pour un module différent de `non-applicable`. Le CRM basique partage un tableau `landingPages` d'exemples ajouté à ses données initiales et à son fichier actif sans supprimer ses autres champs. Les profils HubSpot et Odoo reçoivent chacun leur propre liste statique d'exemples, sans prétendre qu'ils viennent de ces CRM. Chaque ligne a un titre, une URL, un statut `publie` ou `brouillon` et une date de création. Les exemples emploient des URL d'exemple et sont identifiés comme tels, même quand le module est `actif`.

La vue présente titre, URL, statut et date ; elle ne comporte aucun bouton de création, de modification ou de suppression. Les URL sont échappées et validées avant d'être rendues comme liens ; un brouillon peut être affiché sans lien actif.

## Tableau de bord sectoriel

`lib/sector-templates.js` contient une entrée pour chacun des sept secteurs **déjà autorisés** par `SECTORS`, et un test vérifie cette correspondance exacte. L'objet porte objectif, besoin, libellés de modules clés et, quand une entrée correspond réellement à la navigation, sa clé de module. Le panneau Copilote reste visible indépendamment de la nav. La réponse `/api/overview?clientId=...` ajoute le gabarit du secteur de ce profil ; la lecture historique par `source` sans `clientId` conserve son contrat actuel.

| Secteur | Objectif | Besoin | Modules clés issus du cadrage |
| --- | --- | --- | --- |
| E-commerce | Croissance des ventes en ligne | Définir l'audience cible, identifier des niches produit, réduire le coût d'acquisition | Acquisition + Copilote (attribution par campagne/produit) |
| Promoteur immobilier / constructeur de maisons | Remplir le showroom / la maison témoin | Visites qualifiées, leads triés par budget et échéance d'achat, suivi sur cycle long | Acquisition (SEA local) + CRM + Copilote (scoring, MQL/SQL, relance) |
| Fabricant/installateur (vérandas, fenêtres, aménagement extérieur) | Volume de devis | Qualification rapide (zone, budget, urgence), relance quasi immédiate | Acquisition + SEO local + Copilote (score temps réel + brouillon de relance) |
| Services B2B (agences, cabinets, consultants) | Pipeline commercial qualifié | Qualification des demandes entrantes, nurturing long, priorisation commerciale | CRM + Copilote (MQL/SQL + séquences de nurturing) |
| Retail multi-points de vente / franchise | Trafic en magasin | Trafic localisé, attribution online-to-offline | Acquisition (SEA/SEO local) + Copilote (attribution) |
| Pharma / santé | Génération de leads conformes | Ciblage fin pro santé vs grand public, contraintes réglementaires | Acquisition (ciblage fin) + CRM + Copilote (contenu contrôlé) |
| Artisans / TPE locales | Simplicité, gain de temps | CRM basique, relance automatique, peu de temps disponible | CRM basique + Copilote (score simple) |

Ces libellés sont des priorités métier, **pas une affirmation que les fonctions entre parenthèses sont déjà construites**. Les modules présents dans la nav peuvent être mis en évidence via leurs clés existantes ; acquisition et copilote peuvent apparaître comme catégories ou panneau, sans ajouter de fausse entrée de navigation. Les indicateurs sectoriels n'utilisent que les mesures déjà disponibles dans l'overview ; trafic local, attribution, scoring et conformité sont explicitement indisponibles s'ils ne sont pas mesurés. Le bloc objectif/besoin et les modules clés précèdent le briefing narratif existant, qui demeure inchangé. Les autres modules restent visibles dans la nav.

## Présentation, états et erreurs

Le navigateur remplace `renderPreview()` uniquement pour les trois vues concernées et enrichit `render()` du tableau de bord. Transactions réutilise les classes et principes graphiques du funnel existant, sans deuxième logique de calcul. Sa liste de transactions et son formulaire apparaissent seulement pour un profil CRM basique avec le module `actif`. Une réussite rafraîchit Transactions et l'overview utilisé par le briefing/copilote ; les autres vues préservent leur fonctionnement. Les états vides sont explicites.

`demo` donne accès à une vue consultable mais sans écriture ; `actif` retire le badge de statut DÉMO du module. La **provenance** est affichée séparément : un module actif montrant des exemples conserve un badge de données DÉMO, et une source CRM live n'efface pas le caractère fictif des pages statiques. `non-applicable` demeure désactivé dans la nav et refusé par les nouvelles routes. Les erreurs de chargement, de validation ou de sauvegarde sont visibles dans la vue, jamais remplacées silencieusement par des exemples.

Les textes externes (contacts, titres, URL) sont échappés avant insertion HTML. Les requêtes concurrentes conservent le mécanisme de version de `load()` pour éviter qu'une réponse tardive remplace la vue sélectionnée.

## Vérification et limites

Ajouter des tests séparés pour Transactions, relances, pages de destination et secteurs, avec des cas serveur et interface pertinents. Vérifier la migration idempotente sans perte de lignes ni de sauvegarde, les cinq stades et leurs sommes, la création et le changement de stade autorisés/refusés, les données partagées entre profils CRM basique, les compteurs seuls sur HubSpot/Odoo, les pages d'exemple clairement signalées, les sept secteurs, les badges et les états vides/erreurs. Exécuter tous les tests existants, redémarrer l'application et inspecter les vues visibles avant commit et push vers le dépôt connecté.

Ne pas activer de connecteurs SEO/SEA/Formulaires/GSC, réseaux sociaux, paiement réel, authentification ou IA native des CRM. Ne pas exposer publiquement ce POC sans revoir l'accès aux profils et aux données partagées.