function buildSuggestions(overview) {
  const suggestions = [];
  if ((overview.relanceItems || []).some((item) => item.count > 0)) {
    suggestions.push({ label: 'Contacts à relancer', question: 'Qui dois-je relancer ?' });
  }
  if ((overview.funnel || []).some((item) => item.count > 0)) {
    suggestions.push({ label: 'Pipeline commercial', question: 'Résume les opportunités du funnel' });
  }
  if (overview.dataHygiene?.count > 0) {
    suggestions.push({ label: 'Qualité des données', question: 'Que dois-je nettoyer dans mes données ?' });
  }
  if (overview.briefing) suggestions.push({ label: 'Résumé du jour', question: 'Fais-moi un résumé de mon activité' });
  return suggestions.slice(0, 4);
}

function answerQuestion(overview, question) {
  const q = String(question).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/relanc/.test(q) && overview.relanceItems?.length) {
    const rows = overview.relanceItems.filter((item) => item.count > 0);
    return rows.length ? rows.map((item) => `${item.count} ${item.label.toLowerCase()}`).join(' ; ') + '.'
      : 'Aucune relance signalée dans les indicateurs disponibles.';
  }
  if (/nettoy|hygien|qualite des donnees/.test(q) && overview.dataHygiene) {
    return `${overview.dataHygiene.count} ${overview.dataHygiene.label.toLowerCase()}.`;
  }
  if (/opportunit|funnel|pipeline|deal|transaction/.test(q) && overview.funnel?.length) {
    return overview.funnel.map((item) => `${item.label} : ${item.count}`).join(' ; ') + '.';
  }
  if (/resum|activit|bilan|briefing/.test(q) && overview.briefing) {
    return overview.briefing.replace(/\*\*/g, '');
  }
  return 'Cette démonstration ne peut répondre qu’aux questions fondées sur les indicateurs CRM disponibles : résumé, relances, pipeline et qualité des données.';
}

module.exports = { buildSuggestions, answerQuestion };