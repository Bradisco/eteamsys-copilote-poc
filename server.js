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
 * Aucun token/mot de passe n'est jamais écrit dans ce fichier : ils sont
 * lus uniquement depuis les variables d'environnement (Replit "Secrets").
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
const fs = require('fs');
let XLSX;
try { XLSX = require('xlsx'); } catch (e) { XLSX = null; }

const app = express();
app.use(express.json({ limit: '8mb' })); // large limit: le corps peut contenir un fichier Excel en base64

const PORT = process.env.PORT || 5000;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || '';
const HS_BASE = 'https://api.hubapi.com';

const ODOO_URL = process.env.ODOO_URL || '';
const ODOO_DB = process.env.ODOO_DB || '';
const ODOO_USERNAME = process.env.ODOO_USERNAME || '';
const ODOO_PASSWORD = process.env.ODOO_PASSWORD || '';
const ODOO_CONFIGURED = !!(ODOO_URL && ODOO_DB && ODOO_USERNAME && ODOO_PASSWORD);

const CRM_BASIQUE_FILE = path.join(__dirname, 'data', 'crm-basique.json');
const CRM_BASIQUE_SEED_FILE = path.join(__dirname, 'data', 'crm-basique.seed.json');

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

async function hsSearch(objectType, body) {
  const res = await fetch(`${HS_BASE}/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HubSpot ${objectType} search ${res.status}: ${await res.text()}`);
  return res.json();
}
async function hsCount(objectType, filterGroups) {
  const data = await hsSearch(objectType, { filterGroups, limit: 1, properties: [] });
  return data.total || 0;
}
async function hsSum(objectType, filterGroups, sumProperty, maxPages = 10) {
  let after, count = 0, sum = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const body = { filterGroups, limit: 100, properties: [sumProperty] };
    if (after) body.after = after;
    const data = await hsSearch(objectType, body);
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

async function getHubspotOverview() {
  if (!HUBSPOT_TOKEN) {
    const d = HS_DEMO_SNAPSHOT;
    return {
      source: 'hubspot',
      sourceLabel: 'HubSpot — compte eTeamsys réel (mode démo)',
      demoMode: true,
      asOf: d.asOf,
      currency: 'EUR',
      note: "Instantané réel des données eTeamsys, relevé le 18/09/2026 (avant configuration du token HubSpot sur ce déploiement). Dès le token ajouté dans les Secrets, ces chiffres deviennent live.",
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
    HS_LIFECYCLE_STAGES.map(async (s) => ({ ...s, count: await hsCount('contacts', [{ filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: s.id }] }]) }))
  );
  const funnel = await Promise.all(
    HS_DEAL_STAGES.map(async (s) => ({ ...s, count: await hsCount('deals', [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: SALES_PIPELINE_ID }, { propertyName: 'dealstage', operator: 'EQ', value: s.id }] }]) }))
  );
  const enProduction = await hsCount('deals', [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: SALES_PIPELINE_ID }, { propertyName: 'dealstage', operator: 'EQ', value: '6fcf07ab-400e-4bc9-987f-9d7476a27aa6' }] }]);

  const cutoffISO = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  const relanceMQL = await hsCount('contacts', [
    { filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'marketingqualifiedlead' }, { propertyName: 'notes_last_contacted', operator: 'LT', value: cutoffISO }] },
    { filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'marketingqualifiedlead' }, { propertyName: 'notes_last_contacted', operator: 'NOT_HAS_PROPERTY' }] },
  ]);
  const relanceSQL = await hsCount('contacts', [
    { filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'salesqualifiedlead' }, { propertyName: 'notes_last_contacted', operator: 'LT', value: cutoffISO }] },
    { filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: 'salesqualifiedlead' }, { propertyName: 'notes_last_contacted', operator: 'NOT_HAS_PROPERTY' }] },
  ]);
  const closedWon = await hsSum('deals', [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: SALES_PIPELINE_ID }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' }, { propertyName: 'closedate', operator: 'BETWEEN', value: from, highValue: to }] }], 'amount_in_home_currency');
  const closedLost = await hsSum('deals', [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: SALES_PIPELINE_ID }, { propertyName: 'dealstage', operator: 'EQ', value: 'closedlost' }, { propertyName: 'closedate', operator: 'BETWEEN', value: from, highValue: to }] }], 'amount_in_home_currency');
  const staleCutoffISO = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
  const staleOpenDeals = await hsCount('deals', HS_DEAL_STAGES.map((s) => ({ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: SALES_PIPELINE_ID }, { propertyName: 'dealstage', operator: 'EQ', value: s.id }, { propertyName: 'hs_lastmodifieddate', operator: 'LT', value: staleCutoffISO }] })));

  return {
    source: 'hubspot',
    sourceLabel: 'HubSpot — compte eTeamsys réel (live)',
    demoMode: false,
    asOf: todayISO(),
    currency: 'EUR',
    note: 'Données live, interrogées directement sur le portail HubSpot eTeamsys.',
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
async function odooCall(service, method, args) {
  const res = await fetch(`${ODOO_URL.replace(/\/$/, '')}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Math.floor(Math.random() * 1e9) }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.data ? data.error.data.message : JSON.stringify(data.error));
  return data.result;
}
async function odooLogin() {
  return odooCall('common', 'login', [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD]);
}
async function odooExecuteKw(model, method, args, kwargs = {}) {
  const uid = await odooLogin();
  return odooCall('object', 'execute_kw', [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kwargs]);
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

async function getOdooOverview() {
  if (!ODOO_CONFIGURED) {
    const d = ODOO_DEMO;
    return {
      source: 'odoo',
      sourceLabel: 'Odoo — exemple illustratif (non connecté)',
      demoMode: true,
      asOf: todayISO(),
      currency: 'EUR',
      note: "Exemple illustratif : aucun compte Odoo n'a été connecté dans cette session (pas de compte de test disponible). Ce ne sont PAS des données réelles — configurez ODOO_URL / ODOO_DB / ODOO_USERNAME / ODOO_PASSWORD pour passer en direct.",
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
    const stageGroups = await odooExecuteKw('crm.lead', 'read_group', [[['type', '=', 'opportunity'], ['active', '=', true]], ['stage_id'], ['stage_id']]);
    const funnel = (stageGroups || []).map((g) => ({
      id: String(g.stage_id ? g.stage_id[0] : 'inconnu'),
      label: g.stage_id ? g.stage_id[1] : 'Étape inconnue',
      short: g.stage_id ? g.stage_id[1] : 'Étape inconnue',
      count: g.stage_id_count || g.__count || 0,
    }));

    const leadCount = await odooExecuteKw('crm.lead', 'search_count', [[['type', '=', 'lead'], ['active', '=', true]]]);
    const oppCount = await odooExecuteKw('crm.lead', 'search_count', [[['type', '=', 'opportunity'], ['active', '=', true]]]);
    const clientCount = await odooExecuteKw('res.partner', 'search_count', [[['customer_rank', '>', 0]]]);

    const coldLeadDate = daysAgoISO(7);
    const coldLeads = await odooExecuteKw('crm.lead', 'search_count', [[['type', '=', 'lead'], ['active', '=', true], ['write_date', '<', coldLeadDate]]]);
    const noNextActivity = await odooExecuteKw('crm.lead', 'search_count', [[['type', '=', 'opportunity'], ['active', '=', true], ['activity_ids', '=', false]]]);
    const staleCutoff = daysAgoISO(90);
    const staleOpenOpps = await odooExecuteKw('crm.lead', 'search_count', [[['type', '=', 'opportunity'], ['active', '=', true], ['write_date', '<', staleCutoff]]]);

    const { from, to } = yearRange(new Date().getFullYear());
    let wonCount = 0, wonAmount = 0;
    try {
      const wonRecords = await odooExecuteKw('crm.lead', 'search_read', [[['type', '=', 'opportunity'], ['stage_id.is_won', '=', true], ['date_closed', '>=', from], ['date_closed', '<=', to]], ['expected_revenue']]);
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
  try {
    if (!fs.existsSync(CRM_BASIQUE_FILE)) {
      const seed = fs.readFileSync(CRM_BASIQUE_SEED_FILE, 'utf8');
      fs.writeFileSync(CRM_BASIQUE_FILE, seed);
    }
    return JSON.parse(fs.readFileSync(CRM_BASIQUE_FILE, 'utf8'));
  } catch (e) {
    return { clientLabel: 'CRM basique eTeamsys', contacts: [], opportunities: [] };
  }
}
function saveCrmBasique(data) {
  fs.writeFileSync(CRM_BASIQUE_FILE, JSON.stringify(data, null, 2));
}

const CB_STATUT_LABELS = { lead: 'Lead', qualifie: 'Qualifié', client: 'Client' };
const CB_ETAPE_LABELS = { nouveau: 'Nouveau', qualifie: 'Qualifié', proposition: 'Proposition envoyée', gagne: 'Gagné', perdu: 'Perdu' };
const CB_FUNNEL_ORDER = ['nouveau', 'qualifie', 'proposition', 'gagne'];

function getCrmBasiqueOverview() {
  const db = loadCrmBasique();
  const contacts = db.contacts || [];
  const opps = db.opportunities || [];

  const lifecycleCounts = {};
  for (const c of contacts) lifecycleCounts[c.statut] = (lifecycleCounts[c.statut] || 0) + 1;
  const lifecycle = Object.keys(CB_STATUT_LABELS).map((id) => ({ id, label: CB_STATUT_LABELS[id], count: lifecycleCounts[id] || 0 }));

  const funnelCounts = {};
  for (const o of opps) funnelCounts[o.etape] = (funnelCounts[o.etape] || 0) + 1;
  const funnel = CB_FUNNEL_ORDER.map((id) => ({ id, label: CB_ETAPE_LABELS[id], short: CB_ETAPE_LABELS[id], count: funnelCounts[id] || 0 }));

  const year = String(new Date().getFullYear());
  const won = opps.filter((o) => o.etape === 'gagne');
  const lost = opps.filter((o) => o.etape === 'perdu');
  const wonAmount = won.reduce((a, o) => a + (parseFloat(o.montant) || 0), 0);
  const lostAmount = lost.reduce((a, o) => a + (parseFloat(o.montant) || 0), 0);

  const notRelanced = contacts.filter((c) => (c.statut === 'lead' || c.statut === 'qualifie') && (!c.derniereRelance || c.derniereRelance < daysAgoISO(7)));
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
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
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
// Endpoint principal
// =============================================================================
app.get('/api/overview', async (req, res) => {
  const source = (req.query.source || 'hubspot').toLowerCase();
  try {
    let payload;
    if (source === 'hubspot') payload = await getHubspotOverview();
    else if (source === 'odoo') payload = await getOdooOverview();
    else if (source === 'crm-basique') payload = getCrmBasiqueOverview();
    else return res.status(400).json({ error: 'Source inconnue : ' + source });

    payload.briefing = buildBriefing(payload);
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Erreur lors de la lecture de la source "${source}".`, detail: String(err.message || err) });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`eTeamsys POC en ecoute sur le port ${PORT}`);
  console.log(` - HubSpot  : ${HUBSPOT_TOKEN ? 'LIVE' : 'demo (donnees reelles gelees)'}`);
  console.log(` - Odoo     : ${ODOO_CONFIGURED ? 'LIVE' : 'demo (exemple illustratif, non teste)'}`);
  console.log(` - CRM basique : toujours actif (stockage local ${CRM_BASIQUE_FILE})`);
});
