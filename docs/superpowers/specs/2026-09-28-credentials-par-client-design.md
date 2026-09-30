# Identifiants CRM propres à chaque profil client

## But et périmètre

Le profil eTeamsys HubSpot existe déjà. Aujourd'hui, le secret d'application `HUBSPOT_TOKEN` est utilisé par tous les profils HubSpot. Il faut isoler les accès HubSpot et Odoo par profil, gérer leurs identifiants dans le formulaire admin et préserver le profil eTeamsys sans ressaisie. Le CRM basique reste partagé entre les profils qui l'utilisent. Le copilote Anthropic garde sa clé et son fonctionnement globaux.

Le POC est **interne et sans authentification**. Cette évolution n'en fait pas un service multi-client publiable : les routes admin et les données CRM live restent accessibles aux personnes ayant accès à l'application. Les identifiants seront stockés en clair dans `data/clients.json`, limitation explicitement acceptée pour ce stade. Ce fichier est ignoré par Git ; une sauvegarde ou un export externe doit recevoir la même protection.

## Modèle et écriture des profils

Chaque profil possède `credentials`, objet éventuellement vide. Seules les clés correspondant à son `crmExistant` sont admises : `hubspotToken` pour `hubspot`, `odooUrl`, `odooDb`, `odooUsername` et `odooPassword` pour `odoo`, aucune pour `aucun`. Les valeurs fournies doivent être des chaînes non vides et de longueur bornée ; l'URL Odoo doit être une URL HTTPS valide. Les profils existants sans champ `credentials` sont lus comme ayant `{}` sans écriture destructive automatique.

À la création, des champs absents signifient qu'aucun accès externe n'est configuré. À la mise à jour, un champ d'identifiant absent signifie « conserver la valeur existante » ; une nouvelle valeur non vide la remplace. Une chaîne vide dans le formulaire ne remplace pas le secret. Un changement de CRM efface automatiquement **tous** les anciens identifiants avant d'appliquer les éventuels nouveaux champs du CRM sélectionné. Un champ d'un autre CRM ou une forme incorrecte est refusé avant toute écriture. Pour effacer volontairement un accès sans changer de CRM, une action explicite « Retirer les identifiants » est nécessaire, avec confirmation et sans effacer les autres données du profil.

Les écritures du fichier local restent atomiques. Le fichier contenant des secrets et ses fichiers temporaires ou sauvegardes sont créés avec des permissions restrictives (`0600`). Les données de crédits, l'historique, les modules et les autres champs existants sont préservés.

## API admin et formulaire

`GET /api/admin/clients`, `POST /api/admin/clients` et `PUT /api/admin/clients/:id` ne renvoient **jamais** `credentials`, un jeton, un mot de passe ou un marqueur de migration. Les réponses exposent seulement `credentialStatus`, objet de booléens pour les champs du CRM du profil, et `credentialsConfigured`, vrai seulement si tous les champs requis pour ce CRM sont présents. Les autres propriétés publiques conservent leur contrat. Les erreurs et logs ne recopient jamais une valeur d'identifiant.

Le formulaire admin montre les champs du CRM sélectionné et masque les autres. Les jetons et mots de passe utilisent `type="password"` ; aucun identifiant enregistré n'est prérempli, y compris URL et nom d'utilisateur. L'état « configuré » est affiché sans valeur. Un champ laissé vide lors d'une modification conserve sa valeur ; le retrait explicite et le changement de CRM sont clairement signalés. Le texte qui affirme que tous les contacts d'un même CRM sont partagés est corrigé : seul le CRM basique est partagé. Le navigateur ne conserve pas de secrets dans la liste des profils.

## Résolution des accès aux sources

Les connecteurs HubSpot et Odoo reçoivent les identifiants du profil **à chaque requête**, pour l'overview, les contacts, les entreprises, les transactions en lecture seule, les compteurs de relance et les données utilisées par le copilote. La provenance et le mode LIVE/DÉMO reflètent ce profil, pas une variable globale. Deux profils du même CRM ne partagent ni jeton, ni session, ni cache de données dans ce chantier.
Le libellé de source HubSpot en démo est neutre, même si la note précise que l'instantané de référence provient du compte eTeamsys.

Un profil sans jeu complet d'identifiants externes reste en démo. Une requête historique avec `source` mais **sans `clientId`** ne choisit jamais implicitement un profil : les sources externes renvoient leur démo, même si un autre profil est configuré en LIVE. Un `clientId` inconnu ou invalide échoue explicitement ; il ne se replie pas sur un autre profil. Les routes qui exigent déjà `clientId` continuent de l'exiger. Les erreurs de connexion d'un profil configuré sont affichées, sans remplacer silencieusement ses données live par un autre compte ou par des exemples.

`HUBSPOT_TOKEN` et les quatre `ODOO_*` cessent d'être utilisés comme configuration permanente des connecteurs. `.env.example` et le README décrivent les identifiants par profil ; seules les variables Anthropic y demeurent comme configuration globale du copilote.

## Migration ponctuelle du profil eTeamsys

Au premier démarrage du nouveau code, la migration examine uniquement un profil dont le nom satisfait `trim().toLowerCase() === 'eteamsys'` avec `crmExistant: 'hubspot'`. Si et seulement si ce profil est unique, n'a pas déjà de jeton, et si l'ancien secret `HUBSPOT_TOKEN` est présent, elle effectue une sauvegarde locale exclusive du fichier actif puis copie ce secret vers **ce profil seul** par une écriture atomique. Aucun autre profil HubSpot ne reçoit ce jeton. La sauvegarde n'est jamais écrasée ; un fichier invalide ou une sauvegarde impossible interrompent la migration sans remplacer les profils. Le jeton et la sauvegarde ne sont pas journalisés.

Un marqueur de migration interne, conservé dans le profil eTeamsys et jamais exposé par l'API, garantit qu'un retrait ultérieur du jeton ne le recopiera pas au prochain démarrage tant que l'ancien secret existe. Si le profil a déjà un jeton, celui-ci n'est pas remplacé et la migration est marquée comme résolue après sauvegarde. Si le profil est absent, si plusieurs profils portent ce nom ou si son CRM ne correspond pas, aucune valeur n'est copiée arbitrairement ; une ambiguïté est signalée sans écriture. Une fois la migration vérifiée, l'utilisateur pourra supprimer l'ancien secret Replit ; l'agent ne le supprime pas à sa place. Le secret global n'est pas utilisé comme repli applicatif.

## Vérification et limites

Tests du schéma et des mises à jour, du changement de CRM, de la conservation/retrait explicite, de l'absence de secrets dans **toutes** les réponses admin et erreurs, de la migration unique sans perte ni collision de sauvegarde, et de la sélection par profil de deux faux jetons HubSpot distincts avec appels API simulés. Tests du repli démo sans profil ou sans identifiants, des routes de données et du copilote. Aucun vrai jeton ni aucune donnée CRM réelle ne figure dans les fixtures, les logs de test ou le dépôt. Exécuter tous les tests, redémarrer l'application, vérifier le Preview et inspecter le statut du profil eTeamsys avant commit/push, sans afficher de secret. Le rapport final donne le **nom exact du profil enregistré** et le booléen `credentialsConfigured` lu dans la réponse de l'API admin, sans exposer la valeur du jeton.

**Point ouvert, hors de ce chantier :** le token global récemment ajouté est reconnu, mais l'overview HubSpot renvoie actuellement une erreur amont `429` (limitation de débit). L'isolation des identifiants ne la corrige pas. Une piste à étudier séparément est un cache court de l'overview par profil et une réduction des appels HubSpot ; aucun cache ou retry n'est ajouté ici.