# eTeamsys Copilote Commercial IA

## Lancer le projet

Le projet utilise Node.js et Express.

```bash
npm start
```

L'application écoute sur le port `5000` et fonctionne immédiatement en mode démo.
`npm test` lance les tests du modèle client, des routes, des listes et du
copilote. Ouvrir `/admin` pour créer des profils de démonstration, puis
utiliser « Voir en tant que ce client » pour sélectionner le profil.

## Configuration optionnelle

Les connexions HubSpot et Odoo utilisent des variables d'environnement à configurer
dans les Secrets Replit. Le CRM basique eTeamsys fonctionne sans configuration
externe et conserve ses données localement dans `data/crm-basique.json`.

## Limites importantes du POC

Le backoffice `/admin` n'a aucune authentification. Les profils ont leurs
propres réglages et crédits dans `data/clients.json`, mais les profils
ayant une même source CRM partagent les données et identifiants de cette
source. Ne pas exposer publiquement cet outil avec de vraies données
clients. Les crédits, la recharge et les réponses du copilote sont
simulés, sans IA générative ni paiement. Contacts et Entreprises sont
consultables, Tableaux de bord conserve ses indicateurs actuels; les
autres modules de la barre latérale sont des aperçus ou indisponibles.
L'adaptateur Odoo réel n'a pas été testé sur une instance.