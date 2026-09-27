---
name: Encodage des imports CSV
description: Pourquoi décoder explicitement le texte CSV avant de le confier à XLSX.
---

Pour les imports CSV français, décoder explicitement le contenu texte avant son analyse par XLSX, en tenant compte de l'UTF-8 sans BOM et des fichiers Windows-1252. Garder le traitement binaire pour les classeurs Excel.

**Why:** XLSX appelé avec un buffer de CSV UTF-8 sans BOM a interprété « Société » et « Téléphone » avec des accents déformés. Le mapping heuristique des colonnes a alors manqué « Société » sans signaler d'erreur, et l'entreprise dérivée du contact n'a pas été créée.

**How to apply:** Lorsqu'un parcours d'import CSV change, vérifier de bout en bout les noms de colonnes accentués sans BOM ainsi qu'un CSV Windows-1252, au lieu de se contenter d'un fichier Excel ou d'un CSV ASCII.