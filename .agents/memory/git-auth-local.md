---
name: Authentification Git locale
description: Choix durable pour les pushs GitHub de ce projet sans connexion de compte partagée ni jeton stocké dans l'URL.
---

Utiliser pour ce dépôt un `credential.helper` local qui lit le Secret GitHub de l'environnement au moment du push. Le script du helper doit rester hors du dépôt. Ne pas placer le jeton dans l'URL du remote ni dans une configuration Git persistée, et ne pas rétablir une connexion de compte GitHub partagée pour ce besoin.

**Why:** La connexion GitHub partagée risque d'interférer avec d'autres applications ; une URL contenant le jeton le révélerait dans `git remote -v` et `.git/config`. Le push précédent avait utilisé un helper temporaire propre à une commande, pas la connexion partagée.

**How to apply:** Vérifier que le Secret est disponible dans l'environnement, que `origin` reste une URL HTTPS sans identifiant, puis faire un push de test sans l'askpass hérité. Le panneau Git est censé respecter la configuration du dépôt selon la documentation Replit, mais son bouton n'a pas été testé directement dans cette session.