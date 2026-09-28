---
name: Vérification de Preview
description: Diagnostic des écarts entre l'application servie et l'onglet Preview de l'utilisateur.
---

Quand un utilisateur voit encore un ancien écran alors que la racine fonctionne dans une capture, ne pas conclure que Preview est réparé. Vérifier aussi les chemins directs possibles, l'adresse proxifiée et le cache, puis demander quel écran ou quelle adresse apparaît réellement.

**Why:** Une capture de l'application à la racine affichait l'administration, tandis que l'utilisateur voyait encore l'ancien écran client. Une vérification serveur ne garantit donc pas l'état de son onglet.

**How to apply:** Lors des changements du point d'entrée de Preview, contrôler les chemins directs vers la page et les liens avec paramètres, sans attribuer le problème au serveur ni à la plateforme tant que l'adresse ouverte par l'utilisateur n'est pas connue.