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
let clients = [];
let editingId = null;
let editingCreditBalance = 20;
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
  $('clientForm').reset();
  $('secteur').value = SECTORS.at(-1);
  $('solde').value = '20';
  $('formTitle').textContent = 'Créer un profil';
  $('saveButton').textContent = 'Créer le profil';
  $('cancelEdit').hidden = true;
  $('historySection').hidden = true;
  showError('formError', '');
  document.querySelectorAll('[data-module]').forEach((select) => {
    select.value = ['contacts', 'entreprises'].includes(select.dataset.module) ? 'actif' : 'demo';
  });
}
function editClient(client) {
  editingId = client.id;
  editingCreditBalance = client.credits.solde;
  for (const field of ['nom', 'secteur', 'crmExistant', 'statut', 'consultantReferent']) {
    $(field).value = client[field] || '';
  }
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
    for (const text of [client.nom, client.secteur, client.crmExistant === 'aucun' ? 'CRM basique' : client.crmExistant, client.statut, String(client.credits.solde)]) {
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
  const requestedBalance = Number($('solde').value);
  if (!editingId) payload.credits = { solde: requestedBalance };
  else if (requestedBalance !== editingCreditBalance) {
    payload.credits = { solde: requestedBalance, expectedSolde: editingCreditBalance };
  }
  return payload;
}
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