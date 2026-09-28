const HS_CONTACTS = [
  { id: 'hs-ex-1', nom: 'Camille Martin (exemple)', societe: 'Atelier Atlas (exemple)', email: 'camille@example.com', telephone: '', statut: 'Lead' },
  { id: 'hs-ex-2', nom: 'Nora Bernard (exemple)', societe: 'Studio Nord (exemple)', email: 'nora@example.com', telephone: '', statut: 'Client' },
  { id: 'hs-ex-3', nom: 'Léo Dubois (exemple)', societe: 'Maison Bleu (exemple)', email: 'leo@example.com', telephone: '', statut: 'MQL' },
];
const HS_COMPANIES = [
  { id: 'hs-company-1', nom: 'Atelier Atlas (exemple)', domaine: 'example.com', nombreContacts: null },
  { id: 'hs-company-2', nom: 'Studio Nord (exemple)', domaine: '', nombreContacts: null },
];
const ODOO_CONTACTS = [
  { id: 'odoo-ex-1', nom: 'Sofia Leroy (exemple)', societe: 'Bureau Delta (exemple)', email: 'sofia@example.com', telephone: '', statut: '' },
  { id: 'odoo-ex-2', nom: 'Hugo Petit (exemple)', societe: 'Atelier Ouest (exemple)', email: 'hugo@example.com', telephone: '', statut: '' },
];
const ODOO_COMPANIES = [
  { id: 'odoo-company-1', nom: 'Bureau Delta (exemple)', domaine: '', nombreContacts: null },
  { id: 'odoo-company-2', nom: 'Atelier Ouest (exemple)', domaine: '', nombreContacts: null },
];

function offsetFor(cursor) {
  const offset = cursor === '' || cursor == null ? 0 : Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw Object.assign(new Error('Curseur invalide.'), { status: 400 });
  }
  return offset;
}
function page(items, cursor, limit) {
  const offset = offsetFor(cursor);
  return {
    items: items.slice(offset, offset + limit),
    nextCursor: offset + limit < items.length ? String(offset + limit) : null,
  };
}
function companiesFromContacts(contacts) {
  const groups = new Map();
  for (const contact of contacts) {
    const name = String(contact.societe || '').trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase('fr-FR');
    if (!groups.has(key)) groups.set(key, { id: `derived-${groups.size + 1}`, nom: name, domaine: '', nombreContacts: 0 });
    groups.get(key).nombreContacts += 1;
  }
  return [...groups.values()];
}

function createDirectory({ hsList, odooExecuteKw, loadCrmBasique }) {
  async function read(kind, source, cursor = '', limit = 50, credentials = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw Object.assign(new Error('Limite invalide.'), { status: 400 });
    }
    const isCompany = kind === 'companies';
    if (source === 'crm-basique') {
      const contacts = loadCrmBasique().contacts || [];
      const items = isCompany ? companiesFromContacts(contacts) : [...contacts].reverse().map((c) => ({
        id: c.id, nom: c.nom || '', societe: c.societe || '',
        email: c.email || '', telephone: c.telephone || '', statut: c.statut || '',
      }));
      return { ...page(items, cursor, limit), demoMode: true,
        note: isCompany ? 'Vue dérivée des contacts du CRM basique partagé, sans table d’entreprises.' : 'Contacts du CRM basique partagé entre les profils sans CRM (démonstration).',
        derived: isCompany };
    }
    if (source === 'hubspot') {
      if (!credentials.hubspotToken) return {
        ...page(isCompany ? HS_COMPANIES : HS_CONTACTS, cursor, limit),
        demoMode: true, derived: false, note: 'DÉMO : exemples fictifs, aucune liste HubSpot connectée.',
      };
      const properties = isCompany ? ['name', 'domain'] : ['firstname', 'lastname', 'email', 'phone', 'lifecyclestage', 'company'];
      const data = await hsList(credentials.hubspotToken, kind, properties, cursor, limit);
      const items = (data.results || []).map((item) => {
        const p = item.properties || {};
        return isCompany
          ? { id: item.id, nom: p.name || '', domaine: p.domain || '', nombreContacts: null }
          : { id: item.id, nom: [p.firstname, p.lastname].filter(Boolean).join(' ') || p.email || 'Sans nom',
            societe: p.company || '', email: p.email || '', telephone: p.phone || '', statut: p.lifecyclestage || '' };
      });
      return { items, nextCursor: data.paging?.next?.after || null,
        demoMode: false, derived: false, note: 'Données HubSpot en lecture seule.' };
    }
    if (source === 'odoo') {
      if (!['odooUrl', 'odooDb', 'odooUsername', 'odooPassword'].every((key) => credentials[key])) return {
        ...page(isCompany ? ODOO_COMPANIES : ODOO_CONTACTS, cursor, limit),
        demoMode: true, derived: false, note: 'DÉMO : exemples fictifs, connecteur Odoo non validé sur une instance réelle.',
      };
      const offset = offsetFor(cursor);
      const records = await odooExecuteKw(credentials, 'res.partner', 'search_read',
        [[['is_company', '=', isCompany]]],
        { fields: ['name', 'email', 'phone', 'parent_id', 'website'], offset, limit: limit + 1 });
      const items = records.slice(0, limit).map((p) => isCompany
        ? { id: String(p.id), nom: p.name || '', domaine: p.website || '', nombreContacts: null }
        : { id: String(p.id), nom: p.name || '', societe: Array.isArray(p.parent_id) ? p.parent_id[1] : '',
          email: p.email || '', telephone: p.phone || '', statut: '' });
      return { items, nextCursor: records.length > limit ? String(offset + limit) : null,
        demoMode: false, derived: false, note: 'Données Odoo en lecture seule (connecteur non validé sur une instance réelle).' };
    }
    throw Object.assign(new Error('Source inconnue.'), { status: 400 });
  }
  return {
    contacts: (source, cursor, limit, credentials) => read('contacts', source, cursor, limit, credentials),
    companies: (source, cursor, limit, credentials) => read('companies', source, cursor, limit, credentials),
  };
}

module.exports = { createDirectory, companiesFromContacts };