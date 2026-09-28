# Prompt pour l'agent Replit — Rebrancher le vrai copilote Anthropic (Phase 2)

Vérifié directement depuis le dépôt public `Bradisco/eteamsys-copilote-poc`, commit `f68df1f` : le push a bien abouti, et le diagnostic de l'agent est confirmé — `lib/demo-copilot.js` (`answerQuestion`/`buildSuggestions`) est une réponse par mots-clés, pas un appel à un modèle génératif. Ce prompt donne le point d'intégration exact, référencé sur le code réellement présent à ce commit — pas de recherche supplémentaire nécessaire.

## Ce qui existe déjà (ne pas réécrire)

- `server.js`, route `POST /api/copilot/ask` (~ligne 562) : reçoit `{ clientId, question }`, vérifie les crédits via `clientStore.get(clientId)` / `client.credits.solde`, calcule `overview` via `getOverviewForSource(sourceForClient(client))`, appelle aujourd'hui `answerQuestion(overview, question)`, décrémente via `clientStore.charge(clientId, 'question')`, répond `{ answer, credits, demoMode: true }` (le `demoMode: true` est actuellement figé en dur, à corriger — voir plus bas).
- `lib/client-store.js` : `sourceForClient(client)` résout déjà `crmExistant` (`aucun`/`hubspot`/`odoo`) vers `crm-basique`/`hubspot`/`odoo`. Ne touche pas à ce fichier.
- `lib/demo-copilot.js` : garde ce fichier tel quel — il doit rester le **fallback** utilisé quand `ANTHROPIC_API_KEY` n'est pas configurée, exactement le même rôle qu'aujourd'hui, juste plus le seul chemin possible.
- `lib/crm-directory.js` : expose `directory.contacts(source, cursor, limit)` / `directory.companies(...)` — pagination générique, pas de filtre par segment/lifecycle stage. Utilise ça pour donner un aperçu de contacts au copilote (voir plus bas), sans essayer de reconstruire un filtrage par segment qui n'existe plus dans cette version.

## À ajouter : `lib/anthropic-copilot.js`

Crée ce nouveau fichier, sur le même modèle de responsabilité unique que `lib/demo-copilot.js`. Contenu basé sur le code d'origine déjà transmis (`COPILOTE_CODE_ORIGINAL.md`), adapté à la structure actuelle :

```js
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1/messages';

function isConfigured() {
  return !!ANTHROPIC_API_KEY;
}

async function askAnthropic(overview, contactsApercu, question) {
  const system = `Tu es le copilote commercial interne d'eTeamsys, intégré à une plateforme de démonstration CRM.
Tu aides un manager ou un commercial à lire rapidement les données de son profil client actif.

Règles strictes :
- Réponds UNIQUEMENT à partir des données JSON fournies ci-dessous. N'invente jamais un nom, un chiffre, une entreprise ou un fait absent de ces données.
- Si l'information demandée n'est pas dans les données fournies, dis-le clairement (« Je n'ai pas cette information dans les données actuelles ») plutôt que d'improviser.
- Tu n'effectues aucune action (pas d'envoi d'email, pas de modification de fiche, pas d'appel à un système externe) : tu informes seulement.
- Réponds en français, de façon concise, ton professionnel et direct, sans formules creuses.
- Si les données contiennent un indicateur de mode démo, rappelle brièvement que ce sont des données d'exemple, pas du temps réel.

Données disponibles (JSON) :
${JSON.stringify({ overview, contactsApercu })}`;

  const res = await fetch(ANTHROPIC_BASE, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: String(question || '').slice(0, 1000) }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || '').join('\n').trim();
  return text || '(Réponse vide reçue du modèle.)';
}

module.exports = { isConfigured, askAnthropic };
```

## Modification de la route `POST /api/copilot/ask` dans `server.js`

Remplace uniquement l'appel à `answerQuestion` par une bascule conditionnelle :

```js
const anthropicCopilot = require('./lib/anthropic-copilot');
// ...
const contactsApercu = (await directory.contacts(sourceForClient(client), '', 20)).items;
let answer, demoMode;
if (anthropicCopilot.isConfigured()) {
  answer = await anthropicCopilot.askAnthropic(overview, contactsApercu, question);
  demoMode = false;
} else {
  answer = answerQuestion(overview, question);
  demoMode = true;
}
const updated = clientStore.charge(clientId, 'question');
res.json({ answer, credits: updated.credits, demoMode });
```

**Point important : `demoMode` doit refléter la réalité** (`false` seulement quand Anthropic a vraiment répondu), pas rester figé à `true` comme aujourd'hui — c'est le seul vrai bug à corriger dans la route existante.

## Ce qui n'est pas dans ce prompt

- Ne touche pas à `buildSuggestions` (le panneau "Suggéré") — il fonctionne déjà à partir des vraies données de l'overview, ce qui correspond à ce qui était demandé en Phase 2.
- Ne recrée pas de filtrage de contacts par segment/lifecycle stage (MQL/SQL) dans `crm-directory.js` — cette capacité existait dans une version antérieure du POC mais n'a pas été reprise dans cette refonte ; **c'est un point à confirmer séparément avec Mike avant de le reconstruire**, pas à faire de sa propre initiative dans ce prompt.
- N'ajoute pas de nouvelle variable d'environnement au-delà de `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`, déjà documentées dans `.env.example`.

## Definition of done

- Avec `ANTHROPIC_API_KEY` absente : comportement inchangé (réponses par mots-clés, `demoMode: true`).
- Avec `ANTHROPIC_API_KEY` configurée en Secret : le copilote répond via l'API Anthropic, en se basant sur les vraies données du profil actif, `demoMode: false` dans la réponse.
- Le crédit est toujours décompté une fois par question, quel que soit le chemin emprunté (inchangé par rapport à aujourd'hui).
- Commit et push vers `Bradisco/eteamsys-copilote-poc` à la fin, avec un message de commit décrivant le changement.
