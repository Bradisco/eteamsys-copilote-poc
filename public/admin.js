const SECTORS = [
  'E-commerce',
  'Promoteur immobilier / constructeur de maisons',
  'Fabricant/installateur (vérandas, fenêtres, aménagement extérieur)',
  'Services B2B (agences, cabinets, consultants)',
  'Retail multi-points de vente / franchise',
  'Pharma / santé',
  'Artisans / TPE locales',
];
const MODULES = [
  ['contacts', 'Contacts'], ['entreprises', 'Entreprises'], ['transactions', 'Transactions'],
  ['emailsMarketing', 'E-mails marketing'], ['seo', 'SEO'], ['reseauxSociaux', 'Réseaux sociaux'],
  ['publicites', 'Publicités'], ['formulaires', 'Formulaires'],
  ['pagesDestination', 'Pages de destination'], ['pagesSiteWeb', 'Pages de site web'],
  ['tableauxDeBord', 'Tableaux de bord'],
];
const CREDENTIALS = {
  hubspot: [['hubspotToken', 'Jeton HubSpot']],
  odoo: [
    ['odooUrl', 'URL Odoo'], ['odooDb', 'Base de données'],
    ['odooUsername', "Nom d'utilisateur"], ['odooPassword', 'Mot de passe Odoo'],
  ],
};
let clients = [];
let editingId = null;
let editingCreditBalance = 20;
let editingOriginalCrm = null;
let editingCredentialStatus = {};
let editingCredentialsConfigured = false;
const $ = (id) => document.getElementById(id);

function showError(id, message) {
  $(id).textContent = message || '';
  $(id).hidden = !message;
}
async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Erreur HTTP ${response.status}`);
  return data;
}
function option(value, label) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  return item;
}
function setupFields() {
  for (const sector of SECTORS) $('secteur').append(option(sector, sector));
  for (const [key, label] of MODULES) {
    const field = document.createElement('label');
    field.textContent = label;
    const select = document.createElement('select');
    select.name = key;
    select.dataset.module = key;
    select.append(option('actif', 'Actif'), option('demo', 'Démo'), option('non-applicable', 'Non applicable'));
    field.append(select);
    $('moduleFields').append(field);
  }
  resetForm();
}
function resetForm() {
  editingId = null;
  editingCreditBalance = 20;
  editingOriginalCrm = null;
  editingCredentialStatus = {};
  editingCredentialsConfigured = false;
  $('clientForm').reset();
  $('secteur').value = SECTORS.at(-1);
  $('solde').value = '20';
  $('formTitle').textContent = 'Créer un profil';
  $('saveButton').textContent = 'Créer le profil';
  $('cancelEdit').hidden = true;
  $('historySection').hidden = true;
  clearCredentialInputs();
  updateCredentialFields();
  showError('formError', '');
  document.querySelectorAll('[data-module]').forEach((select) => {
    select.value = ['contacts', 'entreprises'].includes(select.dataset.module) ? 'actif' : 'demo';
  });
}
function editClient(client) {
  editingId = client.id;
  editingCreditBalance = client.credits.solde;
  editingOriginalCrm = client.crmExistant;
  editingCredentialStatus = client.credentialStatus || {};
  editingCredentialsConfigured = client.credentialsConfigured === true;
  for (const field of ['nom', 'secteur', 'crmExistant', 'statut', 'consultantReferent']) {
    $(field).value = client[field] || '';
  }
  clearCredentialInputs();
  updateCredentialFields();
  $('solde').value = String(client.credits.solde);
  document.querySelectorAll('[data-module]').forEach((select) => {
    select.value = client.modules[select.dataset.module];
  });
  $('formTitle').textContent = `Modifier ${client.nom}`;
  $('saveButton').textContent = 'Enregistrer les modifications';
  $('cancelEdit').hidden = false;
  $('historySection').hidden = false;
  $('createdAt').textContent = `Identifiant : ${client.id} · Profil créé le ${new Date(client.creeLe).toLocaleDateString('fr-FR')}`;
  const list = $('historyList');
  list.replaceChildren();
  if (!client.credits.historique.length) {
    const item = document.createElement('li');
    item.textContent = 'Aucune opération enregistrée.';
    list.append(item);
  }
  for (const entry of client.credits.historique.toReversed ? client.credits.historique.toReversed() : [...client.credits.historique].reverse()) {
    const item = document.createElement('li');
    item.textContent = `${new Date(entry.date).toLocaleString('fr-FR')} · ${entry.type} · ${entry.montant > 0 ? '+' : ''}${entry.montant}`;
    list.append(item);
  }
  showError('formError', '');
  $('clientForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function action(text, handler, extraClass = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `action ${extraClass}`;
  button.textContent = text;
  button.addEventListener('click', handler);
  return button;
}
function renderClients() {
  const body = $('clientsTable').tBodies[0];
  body.replaceChildren();
  $('count').textContent = `${clients.length} profil${clients.length > 1 ? 's' : ''}`;
  $('emptyState').hidden = clients.length > 0;
  for (const client of clients) {
    const row = document.createElement('tr');
    for (const text of [client.nom, client.secteur, client.crmExistant === 'aucun' ? 'CRM basique' : client.crmExistant]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    }
    const credentialCell = document.createElement('td');
    const credentialBadge = document.createElement('span');
    if (client.crmExistant === 'aucun') {
      credentialBadge.className = 'credential-badge neutral';
      credentialBadge.textContent = 'CRM basique';
    } else {
      const configured = client.credentialsConfigured === true;
      credentialBadge.className = `credential-badge ${configured ? 'configured' : 'not-configured'}`;
      credentialBadge.textContent = configured ? 'Accès configuré' : 'Démo · accès incomplet';
    }
    credentialCell.append(credentialBadge);
    row.append(credentialCell);
    for (const text of [client.statut, String(client.credits.solde)]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    }
    const cell = document.createElement('td');
    cell.className = 'actions';
    cell.append(
      action('Voir en tant que ce client', () => { location.href = `/?clientId=${encodeURIComponent(client.id)}`; }),
      action('Modifier', () => editClient(client)),
      action('Supprimer', async () => {
        if (!confirm(`Supprimer le profil « ${client.nom} » et son historique de crédits ? Les contacts CRM partagés seront conservés.`)) return;
        try {
          await api(`/api/admin/clients/${encodeURIComponent(client.id)}`, { method: 'DELETE' });
          if (editingId === client.id) resetForm();
          await loadClients();
        } catch (error) { showError('pageError', error.message); }
      }, 'danger')
    );
    row.append(cell);
    body.append(row);
  }
}
async function loadClients() {
  clients = await api('/api/admin/clients');
  renderClients();
  showError('pageError', '');
}
function formData() {
  const modules = {};
  document.querySelectorAll('[data-module]').forEach((select) => { modules[select.dataset.module] = select.value; });
  const payload = {
    nom: $('nom').value, secteur: $('secteur').value, crmExistant: $('crmExistant').value,
    statut: $('statut').value, consultantReferent: $('consultantReferent').value,
    modules,
  };
  const credentials = {};
  for (const [key] of (CREDENTIALS[$('crmExistant').value] || [])) {
    const value = $(key).value.trim();
    if (value) credentials[key] = value;
  }
  if (Object.keys(credentials).length) payload.credentials = credentials;
  const requestedBalance = Number($('solde').value);
  if (!editingId) payload.credits = { solde: requestedBalance };
  else if (requestedBalance !== editingCreditBalance) {
    payload.credits = { solde: requestedBalance, expectedSolde: editingCreditBalance };
  }
  return payload;
}

function clearCredentialInputs() {
  for (const [key] of Object.values(CREDENTIALS).flat()) {
    $(key).value = '';
  }
}

function updateCredentialFields() {
  const crm = $('crmExistant').value;
  document.querySelectorAll('[data-credential-crm]').forEach((group) => {
    const active = group.dataset.credentialCrm === crm;
    group.hidden = !active;
    group.querySelectorAll('input').forEach((input) => {
      input.disabled = !active;
      if (!active) input.value = '';
    });
  });

  for (const [key, label] of Object.values(CREDENTIALS).flat()) {
    const status = editingCredentialStatus[key] === true;
    const statusElement = $(`${key}Status`);
    statusElement.textContent = status ? `${label} enregistré` : 'Non configuré';
    statusElement.className = `credential-field-status ${status ? 'configured' : 'not-configured'}`;
  }

  const configured = editingCredentialsConfigured && editingOriginalCrm === crm;
  const badge = $('credentialsConfiguredBadge');
  if (crm === 'aucun') {
    badge.textContent = 'Aucun identifiant externe requis — CRM basique partagé.';
    badge.className = 'credential-badge neutral';
  } else {
    const hasStatus = CREDENTIALS[crm].some(([key]) => editingCredentialStatus[key] === true);
    const complete = configured;
    badge.textContent = complete
      ? 'Identifiants configurés · données en mode LIVE si le service répond.'
      : hasStatus ? 'Configuration partielle · les données restent en mode démo.' : 'Identifiants non configurés · données en mode démo.';
    badge.className = `credential-badge ${complete ? 'configured' : 'not-configured'}`;
  }

  const changed = editingId && editingOriginalCrm !== crm;
  $('crmChangeNotice').hidden = !changed;
  if (changed) {
    const oldCrmLabel = editingOriginalCrm === 'hubspot' ? 'HubSpot' : editingOriginalCrm === 'odoo' ? 'Odoo' : null;
    $('crmChangeNotice').textContent = `${oldCrmLabel ? `En enregistrant, les identifiants ${oldCrmLabel} enregistrés seront effacés. ` : ''}Seuls les contacts du CRM basique sont partagés entre profils. Les identifiants du CRM sélectionné ne sont pas préremplis : saisissez seulement les nouveaux identifiants à configurer.`;
  } else {
    $('crmChangeNotice').textContent = '';
  }
  const canRemove = editingId && Object.values(editingCredentialStatus).some((value) => value === true);
  $('removeCredentials').hidden = !canRemove;
  $('credentialsSection').hidden = false;
}

$('crmExistant').addEventListener('change', () => {
  clearCredentialInputs();
  updateCredentialFields();
});

$('removeCredentials').addEventListener('click', async () => {
  if (!editingId || !Object.values(editingCredentialStatus).some((value) => value === true)) return;
  if (!confirm('Retirer définitivement les identifiants CRM enregistrés pour ce profil ? Cette action ne modifie pas les autres données du profil.')) return;
  const button = $('removeCredentials');
  button.disabled = true;
  try {
    await api(`/api/admin/clients/${encodeURIComponent(editingId)}/credentials`, { method: 'DELETE' });
    await loadClients();
    const updatedClient = clients.find((client) => client.id === editingId);
    editingCredentialStatus = updatedClient?.credentialStatus || {};
    editingCredentialsConfigured = updatedClient?.credentialsConfigured === true;
    updateCredentialFields();
    clearCredentialInputs();
  } catch (error) {
    showError('formError', error.message);
  } finally {
    button.disabled = false;
  }
});
$('clientForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!$('clientForm').reportValidity()) return;
  const id = editingId;
  $('saveButton').disabled = true;
  try {
    await api(id ? `/api/admin/clients/${encodeURIComponent(id)}` : '/api/admin/clients', {
      method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData()),
    });
    resetForm();
    await loadClients();
  } catch (error) { showError('formError', error.message); }
  finally { $('saveButton').disabled = false; }
});
$('newClient').addEventListener('click', () => { resetForm(); $('nom').focus(); });
$('cancelEdit').addEventListener('click', resetForm);
setupFields();
loadClients().catch((error) => showError('pageError', error.message));