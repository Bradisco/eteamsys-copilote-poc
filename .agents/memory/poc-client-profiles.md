---
name: Profils clients du POC
description: Séparation volontaire entre configuration du scénario client et données CRM partagées dans le prototype.
---

Les profils de démonstration ont chacun leurs réglages et leurs crédits, mais partagent les données et identifiants globaux de leur source CRM. Le backoffice n'est pas protégé. Ne pas interpréter ce mécanisme comme une isolation multi-client ni y placer de vraies données de plusieurs clients.

**Why:** L'utilisateur a validé ce compromis pour démontrer rapidement plusieurs scénarios sans construire une infrastructure multi-client complète durant la phase 1.

**How to apply:** Conserver les réglages et crédits propres à chaque profil dans le POC. Avant tout usage réel avec des données clients, traiter séparément l'authentification, l'isolation des données et les connexions CRM propres à chaque client.