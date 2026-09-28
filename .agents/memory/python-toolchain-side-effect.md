---
name: Outillage Python temporaire
description: Effet de bord possible quand un outil Python ponctuel est invoqué dans ce projet Node.js.
---

L'invocation de `python3` pour un diagnostic ponctuel a ajouté automatiquement un module Python à la configuration du projet, alors qu'aucune dépendance Python n'était nécessaire à l'application.

**Why:** Un simple contrôle de navigateur ne devrait pas modifier le toolchain durable du POC Node.js ; l'ajout a dû être retiré par le gestionnaire de modules.

**How to apply:** Après un outil ponctuel non Node.js, inspecter les modifications de configuration et retirer un module ajouté involontairement avec la gestion des langages, plutôt qu'en éditant directement la configuration Replit.