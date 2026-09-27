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

class ClientStoreError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function sourceForClient(client) {
  return client.crmExistant === 'aucun' ? 'crm-basique' : client.crmExistant;
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
  const allowed = ['nom', 'secteur', 'crmExistant', 'modules', 'credits', 'consultantReferent', 'statut'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new ClientStoreError('Champ de profil inconnu.');
  }
  const client = previous ? { ...previous, modules: { ...previous.modules }, credits: { ...previous.credits, historique: [...previous.credits.historique] } } : {
    nom: '', secteur: SECTORS[6], crmExistant: 'aucun', modules: { ...DEFAULT_MODULES },
    credits: { solde: 20, historique: [] }, consultantReferent: '', statut: 'prospect',
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
      fs.writeFileSync(temporary, JSON.stringify(clients, null, 2));
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
  return {
    list, get, create, update, remove,
    charge(id, reason) {
      if (reason !== 'question') throw new ClientStoreError('Type de débit inconnu.');
      return changeCredits(id, 'question', -1);
    },
    recharge(id) { return changeCredits(id, 'recharge-simulee', 20); },
  };
}

module.exports = { createClientStore, ClientStoreError, SECTORS, MODULE_KEYS, DEFAULT_MODULES, sourceForClient };