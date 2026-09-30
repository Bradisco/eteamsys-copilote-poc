const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const SECTORS = [
  'E-commerce',
  'Promoteur immobilier / constructeur de maisons',
  'Fabricant/installateur (vérandas, fenêtres, aménagement extérieur)',
  'Services B2B (agences, cabinets, consultants)',
  'Retail multi-points de vente / franchise',
  'Pharma / santé',
  'Artisans / TPE locales',
];
const MODULE_KEYS = [
  'contacts', 'entreprises', 'transactions', 'emailsMarketing', 'seo',
  'reseauxSociaux', 'publicites', 'formulaires', 'pagesDestination',
  'pagesSiteWeb', 'tableauxDeBord',
];
const DEFAULT_MODULES = Object.fromEntries(
  MODULE_KEYS.map((key) => [key, ['contacts', 'entreprises'].includes(key) ? 'actif' : 'demo'])
);
const CRM_TYPES = ['aucun', 'hubspot', 'odoo'];
const STATUSES = ['prospect', 'actif', 'résilié'];
const MODULE_STATUSES = ['actif', 'demo', 'non-applicable'];
const CREDENTIAL_KEYS = {
  aucun: [],
  hubspot: ['hubspotToken'],
  odoo: ['odooUrl', 'odooDb', 'odooUsername', 'odooPassword'],
};

class ClientStoreError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function sourceForClient(client) {
  return client.crmExistant === 'aucun' ? 'crm-basique' : client.crmExistant;
}
function isEteamsysName(name) {
  return typeof name === 'string' && name.trim().toLowerCase() === 'eteamsys';
}
function credentialsForClient(client) {
  const stored = client.credentials || {};
  const keys = CREDENTIAL_KEYS[client.crmExistant];
  if (!keys || !stored || typeof stored !== 'object' || Array.isArray(stored) ||
      Object.entries(stored).some(([key, value]) => !keys.includes(key) || typeof value !== 'string')) {
    throw new ClientStoreError('Identifiants du profil invalides.', 500);
  }
  return Object.fromEntries(keys.filter((key) => typeof stored[key] === 'string' && stored[key].length)
    .map((key) => [key, stored[key]]));
}
function publicClient(client) {
  const { id, creeLe, nom, secteur, crmExistant, modules, credits, consultantReferent, statut } = client;
  const credentials = credentialsForClient(client);
  const credentialStatus = Object.fromEntries(CREDENTIAL_KEYS[crmExistant].map((key) => [key, Boolean(credentials[key])]));
  return {
    id, creeLe, nom, secteur, crmExistant, modules, credits, consultantReferent, statut,
    credentialStatus, credentialsConfigured: CREDENTIAL_KEYS[crmExistant].length > 0 &&
      Object.values(credentialStatus).every(Boolean),
  };
}
function mergeCredentials(input, previous, crm) {
  if (input === undefined) return { ...previous };
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !CREDENTIAL_KEYS[crm].includes(key))) {
    throw new ClientStoreError('Identifiants du CRM invalides.');
  }
  const result = { ...previous };
  for (const [key, value] of Object.entries(input)) {
    const max = key === 'odooUrl' ? 2048 : 8192;
    if (typeof value !== 'string' || value.length > max) throw new ClientStoreError('Identifiant du CRM invalide.');
    if (!value.trim()) continue; // un champ vide ne retire jamais un accès
    if (key === 'odooUrl') {
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error();
      } catch (_) { throw new ClientStoreError('URL Odoo HTTPS invalide.'); }
    }
    result[key] = value;
  }
  return result;
}

function checkText(value, label, required = false) {
  if (typeof value !== 'string' || value.length > 160 || (required && !value.trim())) {
    throw new ClientStoreError(`${label} invalide.`);
  }
  return value.trim();
}

function validateInput(input, previous) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ClientStoreError('Profil invalide.');
  }
  const allowed = ['nom', 'secteur', 'crmExistant', 'modules', 'credits', 'consultantReferent', 'statut', 'credentials'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new ClientStoreError('Champ de profil inconnu.');
  }
  const client = previous ? { ...previous, modules: { ...previous.modules }, credits: { ...previous.credits, historique: [...previous.credits.historique] } } : {
    nom: '', secteur: SECTORS[6], crmExistant: 'aucun', modules: { ...DEFAULT_MODULES },
    credits: { solde: 20, historique: [] }, consultantReferent: '', statut: 'prospect', credentials: {},
  };
  if (input.nom !== undefined) client.nom = checkText(input.nom, 'Nom', true);
  if (!client.nom) throw new ClientStoreError('Le nom est obligatoire.');
  if (input.consultantReferent !== undefined) client.consultantReferent = checkText(input.consultantReferent, 'Consultant');
  for (const [key, values, label] of [
    ['secteur', SECTORS, 'Secteur'], ['crmExistant', CRM_TYPES, 'CRM'], ['statut', STATUSES, 'Statut'],
  ]) {
    if (input[key] !== undefined) {
      if (!values.includes(input[key])) throw new ClientStoreError(`${label} invalide.`);
      client[key] = input[key];
    }
  }
  let originalCredentials = previous && previous.crmExistant === client.crmExistant
    ? credentialsForClient(previous) : {};
  if (client.crmExistant === 'odoo' && originalCredentials.odooUrl &&
      typeof input.credentials?.odooUrl === 'string' && input.credentials.odooUrl.trim() &&
      input.credentials.odooUrl !== originalCredentials.odooUrl) {
    if (!CREDENTIAL_KEYS.odoo.every((key) => typeof input.credentials[key] === 'string' &&
        input.credentials[key].trim())) {
      throw new ClientStoreError('Changer l’URL Odoo exige de ressaisir tous les identifiants du compte.');
    }
    originalCredentials = {};
  }
  client.credentials = mergeCredentials(input.credentials, originalCredentials, client.crmExistant);
  if (input.modules !== undefined) {
    if (!input.modules || typeof input.modules !== 'object' || Array.isArray(input.modules)) {
      throw new ClientStoreError('Modules invalides.');
    }
    for (const [key, value] of Object.entries(input.modules)) {
      if (!MODULE_KEYS.includes(key) || !MODULE_STATUSES.includes(value)) {
        throw new ClientStoreError('Module ou état de module invalide.');
      }
      client.modules[key] = value;
    }
  }
  if (input.credits !== undefined) {
    const credits = input.credits;
    if (!credits || typeof credits !== 'object' || Array.isArray(credits) ||
        Object.keys(credits).some((key) => !['solde', 'historique', 'expectedSolde'].includes(key)) ||
        (credits.historique !== undefined && (previous || !Array.isArray(credits.historique) || credits.historique.length))) {
      throw new ClientStoreError('Crédits invalides : historique non modifiable.');
    }
    if (credits.expectedSolde !== undefined) {
      if (!previous || !Number.isSafeInteger(credits.expectedSolde) || credits.expectedSolde < 0) {
        throw new ClientStoreError('Solde de référence invalide.');
      }
      if (credits.expectedSolde !== client.credits.solde) {
        throw new ClientStoreError('Le solde a changé depuis l’ouverture du formulaire. Rechargez le profil avant de le modifier.', 409);
      }
    }
    if (credits.solde !== undefined) {
      if (!Number.isSafeInteger(credits.solde) || credits.solde < 0) {
        throw new ClientStoreError('Le solde doit être un entier positif ou nul.');
      }
      if (credits.solde !== client.credits.solde) {
        client.credits.historique.push({
          type: 'ajustement-admin', montant: credits.solde - client.credits.solde,
          date: new Date().toISOString(),
        });
        client.credits.solde = credits.solde;
      }
    }
  }
  return client;
}

function createClientStore(filePath) {
  function list() {
    if (!fs.existsSync(filePath)) return [];
    try {
      const clients = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(clients)) throw new Error('Le fichier ne contient pas un tableau.');
      return clients;
    } catch (error) {
      throw new ClientStoreError(`Lecture des profils impossible : ${error.message}`, 500);
    }
  }
  function write(clients) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(clients, null, 2), { mode: 0o600 });
      fs.renameSync(temporary, filePath);
    } catch (error) {
      try { fs.unlinkSync(temporary); } catch (_) { /* rien à nettoyer */ }
      throw new ClientStoreError(`Sauvegarde des profils impossible : ${error.message}`, 500);
    }
  }
  function indexOf(clients, id) {
    const index = clients.findIndex((client) => client.id === id);
    if (index < 0) throw new ClientStoreError('Profil client inconnu.', 404);
    return index;
  }
  function get(id) {
    const clients = list();
    return clients[indexOf(clients, id)];
  }
  function create(input) {
    const client = { ...validateInput(input), id: randomUUID(), creeLe: new Date().toISOString() };
    const clients = list();
    clients.push(client);
    write(clients);
    return client;
  }
  function update(id, input) {
    const clients = list();
    const index = indexOf(clients, id);
    clients[index] = validateInput(input, clients[index]);
    write(clients);
    return clients[index];
  }
  function remove(id) {
    const clients = list();
    const [removed] = clients.splice(indexOf(clients, id), 1);
    write(clients);
    return removed;
  }
  function changeCredits(id, type, montant) {
    const clients = list();
    const index = indexOf(clients, id);
    const client = clients[index];
    if (client.credits.solde + montant < 0) throw new ClientStoreError('Crédits épuisés.', 409);
    client.credits.solde += montant;
    client.credits.historique.push({ type, montant, date: new Date().toISOString() });
    write(clients);
    return client;
  }
  function clearCredentials(id) {
    const clients = list();
    const index = indexOf(clients, id);
    clients[index] = { ...clients[index], credentials: {} };
    write(clients);
    return clients[index];
  }
  function migrateEteamsysHubspotCredential(token) {
    if (!token) return false;
    const clients = list();
    const matches = clients.filter((client) => isEteamsysName(client.nom));
    if (matches.length > 1) throw new ClientStoreError('Migration HubSpot ambiguë : plusieurs profils eTeamsys.', 500);
    const target = matches[0];
    if (!target || target.crmExistant !== 'hubspot' || target.credentialsMigrationDone) return false;
    const alreadyConfigured = Boolean(credentialsForClient(target).hubspotToken);
    const original = fs.readFileSync(filePath);
    let backedUp = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        fs.writeFileSync(`${filePath}.backup-${randomUUID()}.json`, original, { flag: 'wx', mode: 0o600 });
        backedUp = true;
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw new ClientStoreError('Sauvegarde des profils impossible.', 500);
      }
    }
    if (!backedUp) throw new ClientStoreError('Sauvegarde unique des profils impossible.', 500);
    const index = indexOf(clients, target.id);
    clients[index] = alreadyConfigured
      ? { ...target, credentialsMigrationDone: true }
      : { ...target, credentials: { hubspotToken: token }, credentialsMigrationDone: true };
    write(clients);
    return !alreadyConfigured;
  }
  return {
    list, get, create, update, remove, clearCredentials, migrateEteamsysHubspotCredential,
    charge(id, reason) {
      if (reason !== 'question') throw new ClientStoreError('Type de débit inconnu.');
      return changeCredits(id, 'question', -1);
    },
    recharge(id) { return changeCredits(id, 'recharge-simulee', 20); },
  };
}

module.exports = {
  createClientStore, ClientStoreError, SECTORS, MODULE_KEYS, DEFAULT_MODULES,
  sourceForClient, isEteamsysName, credentialsForClient, publicClient,
};