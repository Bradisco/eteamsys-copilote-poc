/**
 * eTeamsys - POC Copilote Commercial IA
 * ---------------------------------------
 * Backend Express qui illustre l'architecture "socle stable + adaptateurs
 * d'entree" retenue pour le module CRM : trois sources possibles
 * (HubSpot, Odoo, CRM basique propriétaire eTeamsys) sont normalisées
 * vers la MEME forme de données, pour que le frontend (briefing, funnel,
 * relances, revenu) fonctionne à l'identique quelle que soit la source
 * du client.
 *
 * Les identifiants CRM sont conservés localement par profil, jamais dans
 * les réponses publiques. La clé Anthropic reste globale.
 *
 * - HubSpot : lecture réelle testée sur le compte eTeamsys (voir mode
 *   démo basé sur un instantané réel du 18/09/2026).
 * - Odoo : connecteur écrit selon les conventions standards de l'API
 *   externe Odoo (JSON-RPC, crm.lead, res.partner) mais NON TESTÉ sur un
 *   compte Odoo réel dans cette session (aucun compte disponible) — les
 *   noms de champs sont à valider avant mise en production. Mode démo =
 *   données d'exemple clairement fictives.
 * - CRM basique propriétaire : un vrai mini-CRM fonctionnel (stockage
 *   JSON local, formulaire d'ajout, import Excel/CSV) plutôt qu'un
 *   connecteur vers un système existant — c'est la réponse retenue pour
 *   les prospects sur fichier Excel ou CRM fait maison.
 */

const express = require('express');
const path = require('path');
const { randomUUID } = require('node:crypto');
const { createClientStore, sourceForClient, isEteamsysName, credentialsForClient } = require('./lib/client-store');
const { registerAdminRoutes, resolveClientSource, sendError } = require('./lib/client-routes');
const { STAGES, summarizeOpportunities } = require('./lib/crm-transactions');
const { createCrmBasiqueStore } = require('./lib/crm-basique-store');
const { buildBasicReminders } = require('./lib/email-reminders');
const { landingPagesForSource, BASIC_EXAMPLE_PAGES } = require('./lib/landing-pages');
const { templateForSector } = require('./lib/sector-templates');
const { createDirectory } = require('./lib/crm-directory');
const { buildSuggestions, answerQuestion } = require('./lib/demo-copilot');
const anthropicCopilot = require('./lib/anthropic-copilot');
const { readImportRows } = require('./lib/crm-import');
let XLSX;
try { XLSX = require('xlsx'); } catch (e) { XLSX = null; }

const app = express();
app.use(express.json({ limit: '8mb' })); // large limit: le corps peut contenir un fichier Excel en base64

const PORT = process.env.PORT || 5000;
const HS_BASE = 'https://api.hubapi.com';

const CRM_BASIQUE_FILE = path.join(__dirname, 'data', 'crm-basique.json');
const CRM_BASIQUE_SEED_FILE = path.join(__dirname, 'data', 'crm-basique.seed.json');
const crmStore = createCrmBasiqueStore(CRM_BASIQUE_FILE, CRM_BASIQUE_SEED_FILE);
const clientStore = createClientStore(path.join(__dirname, 'data', 'clients.json'));
// L'ancien secret n'est lu ici que pour la migration ponctuelle du profil eTeamsys.
if (clientStore.migrateEteamsysHubspotCredential(process.env.HUBSPOT_TOKEN)) {
  console.log('Identifiants HubSpot migrés vers le profil eTeamsys (valeur masquée).');
}
registerAdminRoutes(app, clientStore);

function yearRange(year) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n) {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

// =============================================================================
// 1) SOURCE HUBSPOT — connecteur API réel, testé sur le compte eTeamsys
// =============================================================================
const SALES_PIPELINE_ID = 'default'; // "Pipeline des ventes"

const HS_DEAL_STAGES = [
  { id: 'appointmentscheduled', label: "Initiation d'un projet marketing", short: 'Initiation projet' },
  { id: 'qualifiedtobuy', label: 'Analyse - Qualified to buy', short: 'Qualified to buy' },
  { id: 'presentationscheduled', label: 'Offre envoyee', short: 'Offre envoyee' },
  { id: 'decisionmakerboughtin', label: 'Negociation & commitment', short: 'Negociation' },
  { id: 'closedwon', label: 'Deal gagne', short: 'Deal gagne' },
];
const HS_OTHER_STAGES = [
  { id: 'closedlost', label: 'Deal perdu' },
  { id: '6fcf07ab-400e-4bc9-987f-9d7476a27aa6', label: 'En production (livraison)' },
  { id: '2f89907e-af96-4614-9740-604818a58974', label: 'Annule' },
];
const HS_LIFECYCLE_STAGES = [
  { id: 'subscriber', label: 'Abonne' },
  { id: 'lead', label: 'Lead' },
  { id: 'marketingqualifiedlead', label: 'MQL (qualifie marketing)' },
  { id: 'salesqualifiedlead', label: 'SQL (qualifie commercial)' },
  { id: 'opportunity', label: 'Opportunite' },
  { id: 'customer', label: 'Client' },
  { id: '64090998', label: 'Client perdu' },
  { id: '205072987', label: 'Ne pas contacter' },
];

async function hsSearch(token, objectType, body) {
  const res = await fetch(`${HS_BASE}/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HubSpot ${objectType} search ${res.status}`);
  return res.json();
}
async function hsList(token, objectType, properties, cursor, limit) {
  const url = new URL(`${HS_BASE}/crm/v3/objects/${objectType}`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('properties', properties.join(','));
  if (cursor) url.searchParams.set('after', cursor);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`HubSpot ${objectType} : HTTP ${response.status}`);
  return response.json();
}
async function hsCount(token, objectType, filterGroups) {
  const data = await hsSearch(token, objectType, { filterGroups, limit: 1, properties: [] });
  return data.total || 0;
}
async function hsSum(token, objectType, filterGroups, sumProperty, maxPages = 10) {
  let after, count = 0, sum = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const body = { filterGroups, limit: 100, properties: [sumProperty] };
    if (after) body.after = after;
    const data = await hsSearch(token, objectType, body);
    count += data.results.length;
    for (const rec of data.results) {
      const val = parseFloat(rec.properties[sumProperty]);
      if (!Number.isNaN(val)) sum += val;
    }
    if (!data.paging || !data.paging.next) break;
    after = data.paging.next.after;
  }
  return { count, sum };
}

const HS_DEMO_SNAPSHOT = {
  asOf: '2026-09-18',
  lifecycle: [
    { id: 'lead', label: 'Lead', count: 10870 },
    { id: 'opportunity', label: 'Opportunite', count: 5230 },
    { id: 'subscriber', label: 'Abonne', count: 3245 },
    { id: '205072987', label: 'Ne pas contacter', count: 1814 },
    { id: '64090998', label: 'Client perdu', count: 1746 },
    { id: 'customer', label: 'Client', count: 1514 },
    { id: 'salesqualifiedlead', label: 'SQL (qualifie commercial)', count: 811 },
    { id: 'marketingqualifiedlead', label: 'MQL (qualifie marketing)', count: 363 },
  ],
  funnel: [
    { id: 'appointmentscheduled', label: "Initiation d'un projet marketing", short: 'Initiation projet', count: 597 },
    { id: 'qualifiedtobuy', label: 'Analyse - Qualified to buy', short: 'Qualified to buy', count: 120 },
    { id: 'presentationscheduled', label: 'Offre envoyee', short: 'Offre envoyee', count: 170 },
    { id: 'decisionmakerboughtin', label: 'Negociation & commitment', short: 'Negociation', count: 104 },
    { id: 'closedwon', label: 'Deal gagne', short: 'Deal gagne', count: 58 },
  ],
  revenueWon: { count: 45, amount: 307937.75 },
  revenueLost: { count: 93, amount: 969733 },
  relanceMQL: 61,
  relanceSQL: 34,
  staleOpenDeals: 742,
  enProductionCount: 213,
  enProductionAmount: 1376675,
};

async function getHubspotOverview(credentials = {}, client = null) {
  const token = credentials.hubspotToken;
  if (!token) {
    const d = HS_DEMO_SNAPSHOT;
    return {
      source: 'hubspot',
      sourceLabel: 'HubSpot — instantané de référence (mode démo)',
      demoMode: true,
      asOf: d.asOf,
      currency: 'EUR',
      note: isEteamsysName(client?.nom)
        ? 'Instantané du compte eTeamsys relevé le 18/09/2026. Configurez les identifiants de ce profil pour passer en direct.'
        : 'Instantané de référence du compte eTeamsys relevé le 18/09/2026 : ce ne sont pas les données du profil sélectionné.',
      lifecycle: d.lifecycle,
      funnel: d.funnel,
      revenueWon: { ...d.revenueWon, periodLabel: '2026' },
      revenueLost: d.revenueLost,
      relanceItems: [
        { label: 'Contacts MQL à relancer', count: d.relanceMQL, tone: d.relanceMQL > 0 ? 'warning' : 'good' },
        { label: 'Contacts SQL à relancer', count: d.relanceSQL, tone: d.relanceSQL > 0 ? 'serious' : 'good' },
      ],
      dataHygiene: { label: 'Opportunités ouvertes inactives depuis plus de 180 jours', count: d.staleOpenDeals },
      extraNote: `${d.enProductionCount} deals additionnels sont actuellement en "En production" pour ${Math.round(d.enProductionAmount).toLocaleString('fr-FR')} € — à confirmer si ce statut correspond à des ventes déjà actées.`,
    };
  }

  const { from, to } = yearRange(new Date().getFullYear());
  const lifecycle = await Promise.all(
    HS_LIFECYCLE_STAGES.map(async (s) => ({ ...s, count: await hsCount(token, 'contacts', [{ filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: s.id }] }]) }))
  );
  const funnel = await Promise.all(
    HS_DEAL_STAGES.map(async (s) => ({ ...s, count: await hsCount(token, 'deals', [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: SALES_PIPELINE_ID }, { propertyName: 'dealstage', operator: 'EQ', value: s.id }] }]) }))
  );
  const enProduction = await hsCount(token, 'deals', [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: SALES_PIPELINE_ID }, { propertyName: 'dealstage', operator: 'EQ', value: '6fcf07ab-400e-4bc9-987f-9d7476a27aa6' }] }]);

  const cutoffISO = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  const relanceMQL = await hsCount(token, 'contacts', [
    { filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'marketingqualifiedlead' }, { propertyName: 'notes_last_contacted', operator: 'LT', value: cutoffISO }] },
    { filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'marketingqualifiedlead' }, { propertyName: 'notes_last_contacted', operator: 'NOT_HAS_PROPERTY' }] },
  ]);
  const relanceSQL = await hsCount(token, 'contacts', [
    { filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'salesqualifiedlead' }, { propertyName: 'notes_last_contacted', operator: 'LT', value: cutoffISO }] },
    { filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'salesqualifiedlead' }, { propertyName: 'notes_last_contacted', operator: 'NOT_HAS_PROPERTY' }] },
  ]);
  const closedWon = await hsSum(token, 'deals', [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: SALES_PIPELINE_ID }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }, { propertyName: 'closedate', operator: 'BETWEEN', value: from, highValue: to }] }], 'amount_in_home_currency');
  const closedLost = await hsSum(token, 'deals', [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: SALES_PIPELINE_ID }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' }, { propertyName: 'closedate', operator: 'BETWEEN', value: from, highValue: to }] }], 'amount_in_home_currency');
  const staleCutoffISO = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
  const staleOpenDeals = await hsCount(token, 'deals', HS_DEAL_STAGES.map((s) => ({ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: SALES_PIPELINE_ID }, { propertyName: 'dealstage', operator: 'EQ', value: s.id }, { propertyName: 'hs_lastmodifieddate', operator: 'LT', value: staleCutoffISO }] })));

  return {
    source: 'hubspot',
    sourceLabel: 'HubSpot — compte du profil sélectionné (live)',
    demoMode: false,
    asOf: todayISO(),
    currency: 'EUR',
    note: 'Données live du compte HubSpot lié à ce profil.',
    lifecycle,
    funnel,
    revenueWon: { count: closedWon.count, amount: closedWon.sum, periodLabel: String(new Date().getFullYear()) },
    revenueLost: { count: closedLost.count, amount: closedLost.sum },
    relanceItems: [
      { label: 'Contacts MQL à relancer', count: relanceMQL, tone: relanceMQL > 0 ? 'warning' : 'good' },
      { label: 'Contacts SQL à relancer', count: relanceSQL, tone: relanceSQL > 0 ? 'serious' : 'good' },
    ],
    dataHygiene: { label: 'Opportunités ouvertes inactives depuis plus de 180 jours', count: staleOpenDeals },
    extraNote: `${enProduction} deals additionnels sont actuellement en "En production" — à confirmer si ce statut correspond à des ventes déjà actées.`,
  };
}

// =============================================================================
// 2) SOURCE ODOO — connecteur JSON-RPC, NON TESTÉ sur un compte réel
// =============================================================================
async function odooCall(credentials, service, method, args) {
  const res = await fetch(`${credentials.odooUrl.replace(/\/$/, '')}/jsonrpc`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Math.floor(Math.random() * 1e9) }),
  });
  const data = await res.json();
  if (data.error) throw new Error('Odoo : appel JSON-RPC refusé.');
  return data.result;
}
async function odooLogin(credentials) {
  return odooCall(credentials, 'common', 'login', [credentials.odooDb, credentials.odooUsername, credentials.odooPassword]);
}
async function odooExecuteKw(credentials, model, method, args, kwargs = {}) {
  const uid = await odooLogin(credentials);
  return odooCall(credentials, 'object', 'execute_kw', [credentials.odooDb, uid, credentials.odooPassword, model, method, args, kwargs]);
}

const ODOO_DEMO = {
  lifecycle: [
    { id: 'lead', label: 'Lead (non qualifié)', count: 84 },
    { id: 'opportunity', label: 'Opportunité en cours', count: 37 },
    { id: 'client', label: 'Client (res.partner)', count: 152 },
  ],
  funnel: [
    { id: 'new', label: 'Nouveau', short: 'Nouveau', count: 22 },
    { id: 'qualified', label: 'Qualifié', short: 'Qualifié', count: 15 },
    { id: 'proposition', label: 'Proposition envoyée', short: 'Proposition', count: 9 },
    { id: 'won', label: 'Gagné', short: 'Gagné', count: 6 },
  ],
  revenueWon: { count: 6, amount: 48200 },
  coldLeads: 11,
  noNextActivity: 8,
  staleOpenOpps: 5,
};

async function getOdooOverview(credentials = {}) {
  if (!['odooUrl', 'odooDb', 'odooUsername', 'odooPassword'].every((key) => credentials[key])) {
    const d = ODOO_DEMO;
    return {
      source: 'odoo',
      sourceLabel: 'Odoo — exemple illustratif (non connecté)',
      demoMode: true,
      asOf: todayISO(),
      currency: 'EUR',
      note: "Exemple illustratif : aucun compte Odoo n'est configuré pour ce profil. Ce ne sont pas des données réelles. Configurez les accès Odoo dans le backoffice pour passer en direct.",
      lifecycle: d.lifecycle,
      funnel: d.funnel,
      revenueWon: { ...d.revenueWon, periodLabel: String(new Date().getFullYear()) },
      revenueLost: null,
      relanceItems: [
        { label: 'Leads entrants non qualifiés depuis plus de 7 jours', count: d.coldLeads, tone: d.coldLeads > 0 ? 'warning' : 'good' },
        { label: "Opportunités sans prochaine action planifiée", count: d.noNextActivity, tone: d.noNextActivity > 0 ? 'serious' : 'good' },
      ],
      dataHygiene: { label: 'Opportunités ouvertes sans mise à jour depuis plus de 90 jours', count: d.staleOpenOpps },
      extraNote: "Connecteur écrit selon les conventions standards de l'API Odoo (crm.lead, stage_id, expected_revenue) mais non validé sur un compte réel dans cette session — à vérifier/ajuster avec une instance Odoo réelle avant mise en production.",
    };
  }

  try {
    const stageGroups = await odooExecuteKw(credentials, 'crm.lead', 'read_group', [[['type', '=', 'opportunity'], ['active', '=', true]], ['stage_id'], ['stage_id']]);
    const funnel = (stageGroups || []).map((g) => ({
      id: String(g.stage_id ? g.stage_id[0] : 'inconnu'),
      label: g.stage_id ? g.stage_id[1] : 'Étape inconnue',
      short: g.stage_id ? g.stage_id[1] : 'Étape inconnue',
      count: g.stage_id_count || g.__count || 0,
    }));

    const leadCount = await odooExecuteKw(credentials, 'crm.lead', 'search_count', [[['type', '=', 'lead'], ['active', '=', true]]]);
    const oppCount = await odooExecuteKw(credentials, 'crm.lead', 'search_count', [[['type', '=', 'opportunity'], ['active', '=', true]]]);
    const clientCount = await odooExecuteKw(credentials, 'res.partner', 'search_count', [[['customer_rank', '>', 0]]]);

    const coldLeadDate = daysAgoISO(7);
    const coldLeads = await odooExecuteKw(credentials, 'crm.lead', 'search_count', [[['type', '=', 'lead'], ['active', '=', true], ['write_date', '<', coldLeadDate]]]);
    const noNextActivity = await odooExecuteKw(credentials, 'crm.lead', 'search_count', [[['type', '=', 'opportunity'], ['active', '=', true], ['activity_ids', '=', false]]]);
    const staleCutoff = daysAgoISO(90);
    const staleOpenOpps = await odooExecuteKw(credentials, 'crm.lead', 'search_count', [[['type', '=', 'opportunity'], ['active', '=', true], ['write_date', '<', staleCutoff]]]);

    const { from, to } = yearRange(new Date().getFullYear());
    let wonCount = 0, wonAmount = 0;
    try {
      const wonRecords = await odooExecuteKw(credentials, 'crm.lead', 'search_read', [[['type', '=', 'opportunity'], ['stage_id.is_won', '=', true], ['date_closed', '>=', from], ['date_closed', '<=', to]], ['expected_revenue']]);
      wonCount = wonRecords.length;
      wonAmount = wonRecords.reduce((a, r) => a + (parseFloat(r.expected_revenue) || 0), 0);
    } catch (e) {
      // stage_id.is_won peut ne pas exister selon la version d'Odoo - repli sur 0
    }

    return {
      source: 'odoo',
      sourceLabel: 'Odoo — connecté (live)',
      demoMode: false,
      asOf: todayISO(),
      currency: 'EUR',
      note: 'Données live, interrogées via l\'API JSON-RPC Odoo.',
      lifecycle: [
        { id: 'lead', label: 'Lead (non qualifié)', count: leadCount },
        { id: 'opportunity', label: 'Opportunité en cours', count: oppCount },
        { id: 'client', label: 'Client (res.partner)', count: clientCount },
      ],
      funnel,
      revenueWon: { count: wonCount, amount: wonAmount, periodLabel: String(new Date().getFullYear()) },
      revenueLost: null,
      relanceItems: [
        { label: 'Leads entrants non qualifiés depuis plus de 7 jours', count: coldLeads, tone: coldLeads > 0 ? 'warning' : 'good' },
        { label: "Opportunités sans prochaine action planifiée", count: noNextActivity, tone: noNextActivity > 0 ? 'serious' : 'good' },
      ],
      dataHygiene: { label: 'Opportunités ouvertes sans mise à jour depuis plus de 90 jours', count: staleOpenOpps },
      extraNote: null,
    };
  } catch (err) {
    throw new Error(`Odoo: ${err.message || err}`);
  }
}

// =============================================================================
// 3) SOURCE CRM BASIQUE PROPRIÉTAIRE — vrai mini-CRM (stockage local + import)
// =============================================================================
function loadCrmBasique() {
  return crmStore.load();
}
function saveCrmBasique(data) {
  crmStore.save(data);
}

const CB_STATUT_LABELS = { lead: 'Lead', qualifie: 'Qualifié', client: 'Client' };

function getCrmBasiqueOverview() {
  const db = loadCrmBasique();
  const contacts = db.contacts || [];
  const opps = db.opportunities || [];

  const lifecycleCounts = {};
  for (const c of contacts) lifecycleCounts[c.statut] = (lifecycleCounts[c.statut] || 0) + 1;
  const lifecycle = Object.keys(CB_STATUT_LABELS).map((id) => ({ id, label: CB_STATUT_LABELS[id], count: lifecycleCounts[id] || 0 }));

  const funnel = summarizeOpportunities(opps);

  const year = String(new Date().getFullYear());
  const won = opps.filter((o) => o.etape === 'gagne');
  const lost = opps.filter((o) => o.etape === 'perdu');
  const wonAmount = won.reduce((a, o) => a + (parseFloat(o.montant) || 0), 0);
  const lostAmount = lost.reduce((a, o) => a + (parseFloat(o.montant) || 0), 0);

  const notRelanced = buildBasicReminders(contacts, daysAgoISO(7));
  const staleCutoff = daysAgoISO(60);
  const staleOpen = opps.filter((o) => o.etape !== 'gagne' && o.etape !== 'perdu' && o.dateMaj < staleCutoff);

  return {
    source: 'crm-basique',
    sourceLabel: `CRM basique eTeamsys — ${db.clientLabel || 'exemple'}`,
    demoMode: true,
    asOf: todayISO(),
    currency: 'EUR',
    note: "CRM basique eTeamsys : mini-CRM autonome (pas un connecteur) proposé aux prospects qui partaient d'un fichier Excel ou d'un outil fait maison. Les données ci-dessous sont modifiables via le panneau d'administration plus bas (ajout manuel ou import Excel/CSV).",
    lifecycle,
    funnel,
    revenueWon: { count: won.length, amount: wonAmount, periodLabel: year },
    revenueLost: { count: lost.length, amount: lostAmount },
    relanceItems: [
      { label: 'Contacts (lead/qualifié) sans relance depuis plus de 7 jours', count: notRelanced.length, tone: notRelanced.length > 0 ? 'warning' : 'good' },
    ],
    dataHygiene: { label: 'Opportunités ouvertes sans mise à jour depuis plus de 60 jours', count: staleOpen.length },
    extraNote: null,
  };
}

// --- CRUD contacts / opportunités -------------------------------------------
app.get('/api/crm-basique/contacts', (req, res) => {
  res.json(loadCrmBasique().contacts || []);
});
app.post('/api/crm-basique/contacts', (req, res) => {
  const db = loadCrmBasique();
  const { nom, societe, email, telephone, statut } = req.body || {};
  if (!nom) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  const contact = {
    id: 'c' + Date.now() + Math.floor(Math.random() * 1000),
    nom, societe: societe || '', email: email || '', telephone: telephone || '',
    statut: ['lead', 'qualifie', 'client'].includes(statut) ? statut : 'lead',
    derniereRelance: null,
  };
  db.contacts = db.contacts || [];
  db.contacts.push(contact);
  saveCrmBasique(db);
  res.json(contact);
});

// --- Import Excel/CSV (mapping heuristique de colonnes) --------------------
function normalizeHeader(h) {
  return String(h || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
const HEADER_SYNONYMS = {
  nom: ['nom', 'name', 'contact', 'prenom nom', 'full name'],
  societe: ['societe', 'société', 'company', 'entreprise', 'organisation'],
  email: ['email', 'e-mail', 'mail', 'courriel'],
  telephone: ['telephone', 'téléphone', 'tel', 'phone', 'gsm'],
};
function guessField(header) {
  const h = normalizeHeader(header);
  for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    if (synonyms.some((s) => h.includes(s))) return field;
  }
  return null;
}

app.post('/api/crm-basique/import', (req, res) => {
  if (!XLSX) return res.status(500).json({ error: "Le module d'import (xlsx) n'est pas installé sur ce serveur." });
  const { base64, filename } = req.body || {};
  if (!base64) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  try {
    const buffer = Buffer.from(base64, 'base64');
    const rows = readImportRows(buffer, filename, XLSX);
    if (!rows.length) return res.status(400).json({ error: 'Le fichier ne contient aucune ligne exploitable.' });

    const headers = Object.keys(rows[0]);
    const mapping = {};
    headers.forEach((h) => {
      const field = guessField(h);
      if (field && !mapping[field]) mapping[field] = h;
    });

    const db = loadCrmBasique();
    db.contacts = db.contacts || [];
    let imported = 0;
    const skipped = [];
    rows.forEach((row, i) => {
      const nom = mapping.nom ? row[mapping.nom] : '';
      const email = mapping.email ? row[mapping.email] : '';
      if (!nom && !email) { skipped.push(i + 1); return; }
      db.contacts.push({
        id: 'c' + Date.now() + Math.floor(Math.random() * 100000),
        nom: String(nom || email || 'Sans nom'),
        societe: mapping.societe ? String(row[mapping.societe] || '') : '',
        email: String(email || ''),
        telephone: mapping.telephone ? String(row[mapping.telephone] || '') : '',
        statut: 'lead',
        derniereRelance: null,
      });
      imported += 1;
    });
    saveCrmBasique(db);
    res.json({ imported, skipped: skipped.length, mapping, filename, totalRows: rows.length });
  } catch (err) {
    res.status(500).json({ error: "Impossible de lire ce fichier : " + (err.message || err) });
  }
});

// =============================================================================
// Briefing générique (indépendant de la source)
// =============================================================================
function buildBriefing(p) {
  const fmt = (n) => Math.round(n || 0).toLocaleString('fr-FR');
  const parts = [];
  if (p.relanceItems && p.relanceItems.length) {
    const bits = p.relanceItems.map((r) => `**${fmt(r.count)}** — ${r.label.toLowerCase()}`);
    parts.push(`À traiter en priorité : ${bits.join(' ; ')}.`);
  }
  parts.push(
    `Sur la période ${p.revenueWon.periodLabel || ''}, **${fmt(p.revenueWon.amount)} €** de revenu attribué sur **${fmt(p.revenueWon.count)}** deals gagnés` +
    (p.revenueLost ? `, contre ${fmt(p.revenueLost.amount)} € perdus sur ${fmt(p.revenueLost.count)} deals.` : '.')
  );
  if (p.dataHygiene) {
    parts.push(`Point d'hygiène des données : **${fmt(p.dataHygiene.count)}** ${p.dataHygiene.label.toLowerCase()} — exactement le type de signal que la couche de nettoyage (Palier 0) doit faire remonter.`);
  }
  if (p.extraNote) parts.push(p.extraNote);
  return parts.join(' ');
}

// =============================================================================
// API de démonstration par profil
// =============================================================================
const directory = createDirectory({ hsList, odooExecuteKw, loadCrmBasique });

async function getOverviewForSource(source, client = null) {
  const readers = {
    hubspot: getHubspotOverview,
    odoo: getOdooOverview,
    'crm-basique': getCrmBasiqueOverview,
  };
  const payload = await readers[source](client ? credentialsForClient(client) : {}, client);
  payload.briefing = buildBriefing(payload);
  payload.suggestions = buildSuggestions(payload);
  return payload;
}

app.get('/api/overview', async (req, res) => {
  try {
    const { client, source } = resolveClientSource(req.query, clientStore);
    const overview = await getOverviewForSource(source, client);
    if (client) overview.sectorTemplate = templateForSector(client.secteur);
    res.json(overview);
  } catch (err) {
    console.error(err);
    sendError(res, err);
  }
});

function moduleProfile(clientId, key) {
  if (typeof clientId !== 'string' || !clientId) {
    throw Object.assign(new Error('Profil client obligatoire.'), { status: 400 });
  }
  const client = clientStore.get(clientId);
  if (client.modules[key] === 'non-applicable') {
    throw Object.assign(new Error('Module indisponible pour ce profil.'), { status: 403 });
  }
  return client;
}
function editableBasicProfile(clientId) {
  const client = moduleProfile(clientId, 'transactions');
  if (sourceForClient(client) !== 'crm-basique' || client.modules.transactions !== 'actif') {
    throw Object.assign(new Error('Transactions non modifiables pour ce profil.'), { status: 403 });
  }
  return client;
}
function validateStage(value) {
  if (!STAGES.some((stage) => stage.id === value)) {
    throw Object.assign(new Error('Stade de transaction invalide.'), { status: 400 });
  }
}
function checkTransactionFields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !allowed.includes(key))) {
    throw Object.assign(new Error('Champs de transaction invalides.'), { status: 400 });
  }
}

app.get('/api/transactions', async (req, res) => {
  try {
    const client = moduleProfile(req.query.clientId, 'transactions');
    const source = sourceForClient(client);
    if (source === 'crm-basique') {
      const db = loadCrmBasique();
      const names = new Map(db.contacts.map((contact) => [contact.id, contact.nom]));
      return res.json({
        source, demoMode: true, asOf: todayISO(), currency: 'EUR',
        note: 'Opportunités partagées du CRM basique. Les données de ce POC sont des exemples.',
        funnel: summarizeOpportunities(db.opportunities),
        items: db.opportunities.map((row) => ({ ...row, contactNom: names.get(row.contactId) || null })),
        contacts: db.contacts.map(({ id, nom }) => ({ id, nom })),
        canEdit: client.modules.transactions === 'actif',
      });
    }
    const overview = await getOverviewForSource(source, client);
    return res.json({
      source, demoMode: overview.demoMode, asOf: overview.asOf, currency: overview.currency,
      note: `${overview.note} Transactions externes en lecture seule : montants par stade et liste individuelle indisponibles.`,
      funnel: overview.funnel.map((stage) => ({ ...stage, hasAmount: false })),
      items: [], canEdit: false,
    });
  } catch (error) { console.error(error); sendError(res, error); }
});

app.post('/api/crm-basique/transactions', (req, res) => {
  try {
    editableBasicProfile(req.body?.clientId);
    checkTransactionFields(req.body, ['clientId', 'contactId', 'titre', 'montant', 'etape']);
    const { contactId, titre, montant, etape = 'initiation' } = req.body;
    if (typeof titre !== 'string' || !titre.trim() || titre.length > 200) {
      throw Object.assign(new Error('Titre de transaction obligatoire (200 caractères maximum).'), { status: 400 });
    }
    validateStage(etape);
    if (montant !== undefined && (typeof montant !== 'number' || !Number.isFinite(montant) || montant < 0)) {
      throw Object.assign(new Error('Montant numérique positif ou nul requis.'), { status: 400 });
    }
    const db = loadCrmBasique();
    if (!db.contacts.some((contact) => contact.id === contactId)) {
      throw Object.assign(new Error('Contact inconnu.'), { status: 404 });
    }
    const now = new Date().toISOString();
    const row = { id: randomUUID(), contactId, titre: titre.trim(), montant: montant ?? null, etape, creeLe: now, dateMaj: now };
    db.opportunities.push(row);
    saveCrmBasique(db);
    res.status(201).json(row);
  } catch (error) { console.error(error); sendError(res, error); }
});

app.patch('/api/crm-basique/transactions/:id', (req, res) => {
  try {
    editableBasicProfile(req.body?.clientId);
    checkTransactionFields(req.body, ['clientId', 'etape']);
    validateStage(req.body.etape);
    const db = loadCrmBasique();
    const row = db.opportunities.find((entry) => entry.id === req.params.id);
    if (!row) throw Object.assign(new Error('Transaction introuvable.'), { status: 404 });
    if (!db.contacts.some((contact) => contact.id === row.contactId)) {
      throw Object.assign(new Error('Contact de la transaction introuvable.'), { status: 404 });
    }
    row.etape = req.body.etape;
    row.dateMaj = new Date().toISOString();
    saveCrmBasique(db);
    res.json(row);
  } catch (error) { console.error(error); sendError(res, error); }
});

app.get('/api/email-reminders', async (req, res) => {
  try {
    const client = moduleProfile(req.query.clientId, 'emailsMarketing');
    const source = sourceForClient(client);
    if (source === 'crm-basique') {
      const items = buildBasicReminders(loadCrmBasique().contacts, daysAgoISO(7));
      return res.json({
        source, demoMode: true, asOf: todayISO(), items, counters: [],
        note: 'Dernier contact connu : dernière relance enregistrée. Aucun historique complet des échanges ni envoi d’e-mail.',
      });
    }
    const overview = await getOverviewForSource(source, client);
    return res.json({
      source, demoMode: overview.demoMode, asOf: overview.asOf, items: [],
      counters: overview.relanceItems,
      note: `Compteurs de ${source === 'hubspot' ? 'HubSpot' : 'Odoo'} (${overview.asOf}). Liste nominative, e-mails et dates individuelles indisponibles.`,
    });
  } catch (error) { console.error(error); sendError(res, error); }
});

app.get('/api/landing-pages', (req, res) => {
  try {
    const client = moduleProfile(req.query.clientId, 'pagesDestination');
    const source = sourceForClient(client);
    let db;
    if (source === 'crm-basique') {
      db = loadCrmBasique();
      if (!Object.hasOwn(db, 'landingPages')) {
        crmStore.backup();
        db = { ...db, landingPages: BASIC_EXAMPLE_PAGES };
        saveCrmBasique(db);
      }
    }
    res.json({ source, ...landingPagesForSource(source, db) });
  } catch (error) { console.error(error); sendError(res, error); }
});

for (const [route, method] of [['/api/contacts', 'contacts'], ['/api/companies', 'companies']]) {
  app.get(route, async (req, res) => {
    try {
      const { source, client } = resolveClientSource(req.query, clientStore);
      const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
      const cursor = req.query.cursor || '';
      res.json({ source, ...await directory[method](source, cursor, limit, client ? credentialsForClient(client) : {}) });
    } catch (err) {
      console.error(err);
      sendError(res, err);
    }
  });
}

app.get('/api/copilot/credits', (req, res) => {
  if (!req.query.clientId) return res.status(400).json({ error: 'Profil client obligatoire.' });
  try {
    const client = clientStore.get(req.query.clientId);
    res.json({ credits: client.credits, demoMode: true });
  } catch (err) { sendError(res, err); }
});

app.post('/api/copilot/ask', async (req, res) => {
  const { clientId, question } = req.body || {};
  if (!clientId || typeof question !== 'string' || !question.trim() || question.length > 1000) {
    return res.status(400).json({ error: 'Profil et question (1 à 1000 caractères) obligatoires.' });
  }
  try {
    const client = clientStore.get(clientId);
    if (client.credits.solde === 0) {
      return res.status(409).json({ error: 'Crédits épuisés.', credits: client.credits, demoMode: true });
    }
    const source = sourceForClient(client);
    const overview = await getOverviewForSource(source, client);
    let answer;
    let demoMode = true;
    if (anthropicCopilot.isConfigured()) {
      const contactsApercu = (await directory.contacts(source, '', 20, credentialsForClient(client))).items;
      answer = await anthropicCopilot.askAnthropic(overview, contactsApercu, question);
      demoMode = false;
    } else {
      answer = answerQuestion(overview, question);
    }
    const updated = clientStore.charge(clientId, 'question');
    res.json({ answer, credits: updated.credits, demoMode });
  } catch (err) {
    console.error(err);
    sendError(res, err);
  }
});

app.post('/api/copilot/recharge', (req, res) => {
  const clientId = req.body?.clientId;
  if (!clientId) return res.status(400).json({ error: 'Profil client obligatoire.' });
  try {
    const updated = clientStore.recharge(clientId);
    res.json({ credits: updated.credits, demoMode: true, message: '20 crédits fictifs ajoutés.' });
  } catch (err) { sendError(res, err); }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get(['/', '/index.html'], (req, res, next) => {
  if (req.query.clientId) return next();
  return res.set('Cache-Control', 'no-store').sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`eTeamsys POC en ecoute sur le port ${PORT}`);
  console.log(' - HubSpot / Odoo : identifiants propres à chaque profil, démo sans connexion');
  console.log(` - CRM basique : toujours actif (stockage local ${CRM_BASIQUE_FILE})`);
});
