const STAGES = [
  { id: 'initiation', label: 'Initiation' },
  { id: 'offre-envoyee', label: 'Offre envoyée' },
  { id: 'negociation', label: 'Négociation' },
  { id: 'gagne', label: 'Won' },
  { id: 'perdu', label: 'Lost' },
];
const LEGACY = { nouveau: 'initiation', qualifie: 'initiation', proposition: 'offre-envoyee' };

function migrateOpportunities(db) {
  if (!db || typeof db !== 'object' || !Array.isArray(db.contacts) || !Array.isArray(db.opportunities)) {
    throw new Error('Données du CRM basique invalides : contacts ou opportunités absents.');
  }
  let changed = false;
  const opportunities = db.opportunities.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Opportunité invalide.');
    const etape = Object.hasOwn(LEGACY, row.etape) ? LEGACY[row.etape] : row.etape;
    if (!STAGES.some((stage) => stage.id === etape)) throw new Error(`Étape inconnue : ${String(row.etape)}.`);
    if (etape !== row.etape) changed = true;
    return etape === row.etape ? row : { ...row, etape };
  });
  return { data: changed ? { ...db, opportunities } : db, changed };
}

function summarizeOpportunities(opportunities) {
  return STAGES.map(({ id, label }) => {
    const rows = opportunities.filter((row) => row.etape === id);
    const amounts = rows.filter((row) => row.montant !== null && row.montant !== undefined &&
      row.montant !== '' && Number.isFinite(Number(row.montant)) && Number(row.montant) >= 0);
    return {
      id, label, short: label, count: rows.length,
      amount: amounts.reduce((sum, row) => sum + Number(row.montant), 0),
      hasAmount: amounts.length > 0,
    };
  });
}

module.exports = { STAGES, migrateOpportunities, summarizeOpportunities };