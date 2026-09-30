# Prompt pour l'agent Replit — Authentification git au push, sans jeton dans l'URL du remote

Contexte validé avec Mike : `origin` pointe déjà vers `https://github.com/Bradisco/eteamsys-copilote-poc.git` (sans identifiant dans l'URL), et le Secret `GITHUB_PUSH_TOKEN` existe déjà dans ce Repl (jeton Fine-grained `eteamsys-poc-push`, scopé uniquement sur ce dépôt, permission "Contents: Read and write"). Ta proposition d'éviter `git remote set-url` avec le jeton en clair est la bonne approche — `git remote -v` en ligne de commande afficherait sinon le jeton en clair localement (contrairement à l'affichage web de GitHub qui le masque), et il resterait stocké dans `.git/config`. On confirme cette direction : mets en place une authentification résolue au moment du push, jamais écrite dans le dépôt ni dans sa configuration persistée.

## Ce qu'il faut clarifier avant de considérer que c'est fait

**1. D'où venait l'authentification du dernier push réussi ?** Tu indiques que le dernier push a fonctionné sans jeton dans l'URL. Avant d'ajouter ce nouveau mécanisme, détermine précisément par quel moyen ce push s'est authentifié — connexion de compte GitHub partagée au niveau Replit (celle qu'on cherche justement à éviter, cause de l'interférence sur les autres apps de Mike), ou un autre mécanisme déjà en place. Si c'est la connexion partagée, la mise en place ci-dessous doit la remplacer complètement, pas simplement coexister avec elle en silence.

**2. Le mécanisme doit couvrir les deux façons de pousser.** Aussi bien `git push` en Shell que le bouton du panneau Git graphique de Replit (si Mike l'utilise encore) doivent passer par cette nouvelle authentification — pas seulement l'une des deux.

## Mise en place suggérée (à adapter si tu identifies mieux, explique ton choix si différent)

Un script `GIT_ASKPASS` minimal, qui ne contient aucun secret — il se contente de lire la variable d'environnement au moment de l'exécution :

```sh
#!/bin/sh
echo "$GITHUB_PUSH_TOKEN"
```

Place ce script **hors du dépôt applicatif public** (par exemple dans le répertoire home de l'environnement Replit, pas dans `eteamsys-copilote-poc/`) — ce n'est pas un fichier de l'application, c'est une configuration locale à cet environnement d'exécution, et il n'a pas sa place dans le dépôt même s'il ne contient pas de secret en lui-même.

Rends-le exécutable, puis configure :
```
git config --global credential.https://github.com.username x-access-token
```
et fixe la variable d'environnement `GIT_ASKPASS` sur le chemin de ce script (au niveau du Repl, pas commité).

Quand git a besoin d'un mot de passe pour pousser vers GitHub, il appellera ce script, qui renverra la valeur actuelle de `GITHUB_PUSH_TOKEN` — sans jamais l'écrire dans `.git/config`, ni dans l'historique, ni nulle part de persistant.

Si tu as une meilleure façon d'arriver au même résultat (un `credential.helper` dédié plutôt qu'un `GIT_ASKPASS`, par exemple), utilise-la — l'exigence est le résultat (rien en clair sur disque de façon persistante), pas la méthode exacte.

## Vérification avant de considérer que c'est fait

- `cat .git/config` ne doit contenir aucune trace du jeton.
- `git remote -v` ne doit afficher aucun identifiant dans l'URL.
- Un push de test (petit commit trivial, ou `git push` à vide si rien à pousser) doit réussir.
- Confirme explicitement si ce mécanisme remplace bien la connexion de compte partagée identifiée au point 1, ou si les deux coexistent encore (auquel cas dis-le clairement, ce serait un problème à traiter).

## Ce qui n'est pas demandé

- Ne touche pas au contenu applicatif (`server.js`, `lib/`, `public/`) — ce chantier est uniquement de la configuration git locale à l'environnement Replit.
- Ne commite pas le script `GIT_ASKPASS` dans le dépôt public `eteamsys-copilote-poc`.

## Definition of done

- Un push réussit sans qu'aucun jeton ne soit visible dans `.git/config`, `git remote -v`, ou tout fichier suivi par git.
- Confirmation explicite que ce mécanisme ne dépend plus de la connexion de compte GitHub partagée au niveau Replit.
- Rapport clair du mécanisme exact mis en place (nom du script, variables configurées, où elles vivent) pour que ce soit vérifiable plus tard.
