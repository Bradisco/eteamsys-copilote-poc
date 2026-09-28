const SECTOR_TEMPLATES = {
  'E-commerce': {
    objectif: 'Croissance des ventes en ligne',
    besoin: "Définir l'audience cible, identifier des niches produit, réduire le coût d'acquisition",
    modulesCles: ['Acquisition', 'Copilote (attribution par campagne/produit)'],
    navKeys: ['publicites'],
  },
  'Promoteur immobilier / constructeur de maisons': {
    objectif: 'Remplir le showroom / la maison témoin',
    besoin: "Visites qualifiées, leads triés par budget et échéance d'achat, suivi sur cycle long",
    modulesCles: ['Acquisition (SEA local)', 'CRM', 'Copilote (scoring, MQL/SQL, relance)'],
    navKeys: ['contacts', 'transactions'],
  },
  'Fabricant/installateur (vérandas, fenêtres, aménagement extérieur)': {
    objectif: 'Volume de devis',
    besoin: 'Qualification rapide (zone, budget, urgence), relance quasi immédiate',
    modulesCles: ['Acquisition', 'SEO local', 'Copilote (score temps réel + brouillon de relance)'],
    navKeys: ['seo'],
  },
  'Services B2B (agences, cabinets, consultants)': {
    objectif: 'Pipeline commercial qualifié',
    besoin: 'Qualification des demandes entrantes, nurturing long, priorisation commerciale',
    modulesCles: ['CRM', 'Copilote (MQL/SQL + séquences de nurturing)'],
    navKeys: ['contacts', 'transactions'],
  },
  'Retail multi-points de vente / franchise': {
    objectif: 'Trafic en magasin',
    besoin: 'Trafic localisé, attribution online-to-offline',
    modulesCles: ['Acquisition (SEA/SEO local)', 'Copilote (attribution)'],
    navKeys: ['seo', 'publicites'],
  },
  'Pharma / santé': {
    objectif: 'Génération de leads conformes',
    besoin: 'Ciblage fin pro santé vs grand public, contraintes réglementaires',
    modulesCles: ['Acquisition (ciblage fin)', 'CRM', 'Copilote (contenu contrôlé)'],
    navKeys: ['publicites', 'contacts'],
  },
  'Artisans / TPE locales': {
    objectif: 'Simplicité, gain de temps',
    besoin: 'CRM basique, relance automatique, peu de temps disponible',
    modulesCles: ['CRM basique', 'Copilote (score simple)'],
    navKeys: ['contacts', 'transactions'],
  },
};

function templateForSector(sector) {
  if (!Object.hasOwn(SECTOR_TEMPLATES, sector)) throw new Error('Secteur inconnu.');
  return SECTOR_TEMPLATES[sector];
}

module.exports = { SECTOR_TEMPLATES, templateForSector };