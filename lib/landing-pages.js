const BASIC_EXAMPLE_PAGES = [
  { titre: 'Demande de devis (exemple)', url: 'https://example.com/devis', statut: 'publie', date: '2026-09-28' },
  { titre: 'Guide travaux (exemple)', url: 'https://example.com/guide-travaux', statut: 'brouillon', date: '2026-09-27' },
];
const EXAMPLES = {
  hubspot: [
    { titre: 'Présentation eTeamsys (exemple)', url: 'https://example.com/eteamsys', statut: 'publie', date: '2026-09-28' },
  ],
  odoo: [
    { titre: 'Demande de visite (exemple)', url: 'https://example.com/visite', statut: 'publie', date: '2026-09-28' },
  ],
};

function landingPagesForSource(source, basicData) {
  if (source === 'crm-basique') {
    if (!basicData || !Array.isArray(basicData.landingPages)) throw new Error('Pages de destination invalides.');
    return { items: basicData.landingPages, demoMode: true, note: 'Pages d’exemple partagées entre les profils du CRM basique. Aucun site réel n’est connecté.' };
  }
  if (!Object.hasOwn(EXAMPLES, source)) throw new Error('Source inconnue.');
  return { items: EXAMPLES[source], demoMode: true, note: `Pages fictives de démonstration, non extraites de ${source === 'hubspot' ? 'HubSpot' : 'Odoo'}.` };
}

module.exports = { BASIC_EXAMPLE_PAGES, landingPagesForSource };