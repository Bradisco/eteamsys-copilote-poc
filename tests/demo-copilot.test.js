const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSuggestions, answerQuestion } = require('../lib/demo-copilot');

const overview = {
  briefing: 'Bilan calculé sur les données disponibles.',
  relanceItems: [{ label: 'Leads à relancer', count: 3 }],
  funnel: [{ label: 'Offre envoyée', count: 2 }],
  revenueWon: { count: 1, amount: 1200, periodLabel: '2026' },
  dataHygiene: { label: 'Fiches à nettoyer', count: 4 }
};

test('suggestions issues seulement des indicateurs disponibles', () => {
  assert.match(buildSuggestions(overview)[0].question, /relancer/i);
  assert.ok(buildSuggestions(overview).length <= 4);
  assert.equal(buildSuggestions({ briefing: '', relanceItems: [], funnel: [] }).length, 0);
});
test('réponses déterministes et limites explicites', () => {
  assert.match(answerQuestion(overview, 'Fais-moi un résumé'), /Bilan calculé/);
  assert.match(answerQuestion(overview, 'Qui relancer ?'), /3/);
  assert.match(answerQuestion(overview, 'Quel est mon prénom ?'), /démonstration|disponibles/i);
});