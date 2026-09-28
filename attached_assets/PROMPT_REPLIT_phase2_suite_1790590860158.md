# Prompt pour l'agent Replit — Phase 2, les 4 modules restants

Vérifié directement depuis le dépôt (commit `33033bd`) : le copilote réel est en place, mais les 4 autres points de la Phase 2 n'ont pas encore été construits — ils affichent seulement un texte statique. Précisément, dans `public/app.js`, `MODULE_DESCRIPTIONS` contient les textes placeholder pour `transactions`, `emailsMarketing`, `pagesDestination`, et `renderPreview()` (~ligne 126) est ce qui les affiche tel quel via la vue générique. Ce prompt remplace ces textes par du vrai contenu, un module à la fois.

**Rappel de fonctionnement à respecter** : le statut d'un module (`actif` / `demo` / `non-applicable`) reste piloté par profil depuis le back office (`lib/client-store.js`, champ `modules`) — construire la logique réelle d'un module ne veut pas dire le débloquer partout. Ce qui change, c'est qu'un module en `demo` montre désormais un aperçu avec de vraies données d'exemple cohérentes (pas un texte "à venir"), et qu'un module en `actif` montre les mêmes données mais sans le badge DÉMO — exactement le mécanisme déjà en place pour Contacts/Entreprises.

## 1. Transactions

**Constat important à ne pas ignorer** : `data/crm-basique.seed.json` contient déjà un tableau `opportunities` (contactId, titre, montant, etape, dateMaj) avec des valeurs d'étape actuelles (`nouveau`, `qualifie`, `proposition`, `gagne`, `perdu`) qui ne correspondent pas exactement aux 5 stades demandés. **Ne crée pas un second tableau `transactions` en parallèle** — renomme/complète ce tableau existant pour qu'il porte exactement ces 5 valeurs d'étape : `initiation`, `offre-envoyee`, `negociation`, `gagne`, `perdu`. Migre les valeurs actuelles (`nouveau`→`initiation`, `qualifie`→`initiation` ou `negociation` selon ce qui semble le plus proche au cas par cas, `proposition`→`offre-envoyee`, `gagne`→`gagne`, `perdu`→`perdu`) et ajoute au moins un exemple en `negociation` puisqu'aucun n'existe actuellement.

- Pour les profils CRM basique : nouvelle vue `transactions` affichant un funnel des 5 stades (comptage par étape, montant total), sur le modèle visuel du funnel déjà affiché dans Tableaux de bord.
- Pour les profils HubSpot/Odoo : réutilise `overview.funnel` (déjà présent dans la réponse de `/api/overview`, voir `HS_DEAL_STAGES` dans `server.js`) — même vue, pas de nouvelle lecture de données.
- Branche cette vue dans `public/app.js` : dans `load()`, ajoute `transactions` à la liste des vues avec logique dédiée (actuellement seuls `contacts`/`entreprises`/`tableauxDeBord` ont une logique spécifique, tout le reste tombe dans `renderPreview()`).

## 2. E-mails marketing (Option 2 déjà actée : pas d'outil d'envoi)

Liste des contacts à relancer, réutilise les données déjà calculées côté serveur (`relanceItems` / `relanceMQL` / `relanceSQL` selon la source — voir `HS_DEMO_SNAPSHOT` dans `server.js` pour la forme exacte). Colonnes : nom, e-mail, dernier contact, raison de la relance. Aucun composeur, aucun tracking — un simple tableau en lecture seule, sur le modèle de `renderDirectory()` déjà existant dans `app.js` pour Contacts.

## 3. Pages de destination (lecture seule, pas de constructeur)

Ajoute un tableau `landingPages` (titre, url, statut publié/brouillon, date) — même logique de partage que les contacts du CRM basique aujourd'hui ("Les contacts d'un même CRM sont partagés entre profils", cf. `data/crm-basique.seed.json`) : les profils sans CRM partagent une liste d'exemple commune, les profils HubSpot/Odoo peuvent avoir leur propre liste d'exemple statique. Vue en lecture seule, pas de formulaire de création — cohérent avec la décision déjà actée que ces pages sont produites par l'équipe eTeamsys, jamais par le client depuis la plateforme.

## 4. Tableaux de bord — contenu réel par secteur

Actuellement, la vue `tableauxDeBord` (fonction `render(data)` dans `public/index.html`, ligne ~172) affiche le briefing et le funnel, mais rien de spécifique au secteur du profil. `lib/client-store.js` a déjà la liste des 7 secteurs (`SECTORS`) mais pas leurs métadonnées.

- Crée un nouveau fichier `lib/sector-templates.js` exportant, pour chacun des 7 secteurs déjà listés dans `SECTORS`, l'objectif principal, le besoin spécifique, et les modules clés (reprends le contenu exact du tableau "Catégories de clients et besoins" déjà utilisé pour le back office — les mêmes 7 lignes, ne les réinvente pas).
- Dans la vue Tableaux de bord, affiche ce contenu en tête (objectif + besoin), et mets en évidence dans la nav ou dans un encart les modules listés comme "clés" pour ce secteur — les autres modules restent visibles mais en second plan visuellement.
- Garde le principe déjà en place du briefing narratif — ce nouveau contenu s'ajoute au-dessus, il ne le remplace pas.

## Tests

Ajoute un fichier de test par nouvelle capacité (`tests/transactions.test.js`, etc.), sur le modèle des tests déjà présents (`tests/anthropic-copilot.test.js`, `tests/crm-directory.test.js`) — même style, même rigueur.

## Definition of done

- Les 4 modules affichent du contenu réel (ou un exemple clairement démo) au lieu du texte "à venir" actuel.
- Le funnel Transactions utilise le tableau `opportunities` migré, pas un doublon.
- Tableaux de bord affiche un contenu différent selon le secteur du profil actif.
- Tous les tests existants + nouveaux passent.
- Commit et push vers `Bradisco/eteamsys-copilote-poc` à la fin, avec un message de commit décrivant le changement.
