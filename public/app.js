const MODULES = [
  ['contacts', 'Contacts'], ['entreprises', 'Entreprises'], ['transactions', 'Transactions'],
  ['emailsMarketing', 'E-mails marketing'], ['seo', 'SEO'], ['reseauxSociaux', 'Réseaux sociaux'],
  ['publicites', 'Publicités'], ['formulaires', 'Formulaires'],
  ['pagesDestination', 'Pages de destination'], ['pagesSiteWeb', 'Pages de site web'],
  ['tableauxDeBord', 'Tableaux de bord'],
];
const MODULE_DESCRIPTIONS = {
  seo: 'Le connecteur SEO n’est pas configuré dans ce prototype.',
  reseauxSociaux: 'Automatisations et campagnes gérées par eTeamsys : à venir.',
  publicites: 'Le connecteur publicitaire sera ajouté dans une prochaine phase.',
  formulaires: 'Le suivi des formulaires sera ajouté dans une prochaine phase.',
  pagesSiteWeb: 'Les données des pages de site web seront ajoutées dans une prochaine phase.',
};
const clientId = new URLSearchParams(location.search).get('clientId');
let activeClient = null;
let activeView = 'contacts';
let requestVersion = 0;
let currentOverview = null;
const main = document.getElementById('mainContent');

async function getJson(url) {
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Lecture impossible (HTTP ${response.status})`);
  return result;
}

function showMessage(title, detail, link = false) {
  main.innerHTML = `<div class="view-error"><h2>${esc(title)}</h2><p>${esc(detail)}</p>${link ? '<a href="/admin">Ouvrir le backoffice</a>' : ''}</div>`;
}
function renderNav() {
  const nav = document.getElementById('sideNav');
  nav.replaceChildren();
  for (const [key, label] of MODULES) {
    const status = activeClient?.modules[key] || 'non-applicable';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nav-item${activeView === key ? ' active' : ''}`;
    button.disabled = status === 'non-applicable';
    button.setAttribute('aria-current', activeView === key ? 'page' : 'false');
    const text = document.createElement('span');
    text.textContent = label;
    button.append(text);
    if (status === 'demo') {
      const tag = document.createElement('span');
      tag.className = 'nav-tag demo';
      tag.textContent = 'DÉMO';
      button.append(tag);
    }
    button.addEventListener('click', () => {
      activeView = key;
      renderNav();
      load();
    });
    nav.append(button);
  }
}
function setHeader(overview) {
  const crmLabel = activeClient.crmExistant === 'aucun' ? 'CRM basique eTeamsys' : activeClient.crmExistant === 'hubspot' ? 'HubSpot' : 'Odoo';
  document.getElementById('clientName').textContent = activeClient.nom;
  document.getElementById('clientMeta').textContent = `${activeClient.secteur} · ${crmLabel}`;
  document.getElementById('sidebarClient').textContent = activeClient.nom;
  document.getElementById('sidebarCrm').textContent = crmLabel;
  const badge = document.getElementById('modeBadge');
  badge.textContent = `${overview.demoMode ? 'DÉMO' : 'LIVE'} · ${crmLabel}`;
  badge.classList.toggle('live', !overview.demoMode);
  document.getElementById('viewTitle').textContent = MODULES.find(([key]) => key === activeView)?.[1] || '';
  const moduleBadge = document.getElementById('moduleBadge');
  const status = activeClient.modules[activeView];
  moduleBadge.textContent = status === 'actif' && !MODULE_DESCRIPTIONS[activeView] ? 'Actif' : 'DÉMO · aperçu';
  moduleBadge.className = `module-badge${status === 'actif' && !MODULE_DESCRIPTIONS[activeView] ? ' active' : ''}`;
}
function renderDirectory(data, entries, kind) {
  const basic = activeClient.crmExistant === 'aucun';
  const notice = basic && kind === 'contacts' ? window.contactNotice : '';
  if (notice) window.contactNotice = '';
  const columns = kind === 'contacts' ? ['Nom', 'Société', 'E-mail', 'Téléphone', 'Statut'] : ['Entreprise', 'Domaine', 'Contacts'];
  const rows = entries.map((item) => kind === 'contacts'
    ? `<tr><td>${esc(item.nom)}</td><td>${esc(item.societe || '—')}</td><td>${item.email ? `<a href="mailto:${encodeURIComponent(item.email)}">${esc(item.email)}</a>` : '—'}</td><td>${esc(item.telephone || '—')}</td><td>${esc(item.statut || '—')}</td></tr>`
    : `<tr><td>${esc(item.nom)}</td><td>${esc(item.domaine || '—')}</td><td>${item.nombreContacts == null ? '—' : fmtNum(item.nombreContacts)}</td></tr>`
  ).join('');
  main.innerHTML = `
    <section class="card">
      <h2>${kind === 'contacts' ? 'Liste des contacts' : 'Liste des entreprises'}</h2>
      ${notice ? `<p role="status" class="directory-notice">${esc(notice)}</p>` : ''}
      <div class="directory-intro"><span class="source-badge ${data.demoMode ? '' : 'live'}">${data.demoMode ? 'DÉMO' : 'LIVE'}</span><p>${esc(data.note)}</p></div>
      ${entries.length ? `<div class="directory-table-wrap"><table class="directory-table"><thead><tr>${columns.map((col) => `<th scope="col">${esc(col)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty-list">Aucun enregistrement pour cette source.</p>'}
      ${data.nextCursor ? '<button class="btn secondary directory-more" id="loadMore" type="button">Charger plus</button>' : ''}
      <p id="directoryError" role="alert" class="copilot-error" hidden></p>
    </section>
    ${basic && kind === 'contacts' ? renderCrmBasiqueAdmin() : ''}`;
  if (basic && kind === 'contacts') wireCrmBasiqueAdmin();
}
async function loadDirectory(kind, version) {
  let items = [];
  let cursor = '';
  let lastData;
  const fetchPage = async () => {
    const query = new URLSearchParams({ clientId, limit: '50' });
    if (cursor) query.set('cursor', cursor);
    const data = await getJson(`/api/${kind === 'contacts' ? 'contacts' : 'companies'}?${query}`);
    if (version !== requestVersion) return;
    items = items.concat(data.items);
    cursor = data.nextCursor;
    lastData = data;
    setHeader(data);
    renderDirectory(data, items, kind);
    const more = document.getElementById('loadMore');
    if (more) more.addEventListener('click', async () => {
      more.disabled = true;
      more.textContent = 'Chargement…';
      try { await fetchPage(); } catch (error) {
        more.disabled = false;
        more.textContent = 'Charger plus';
        const message = document.getElementById('directoryError');
        message.textContent = error.message;
        message.hidden = false;
      }
    });
  };
  await fetchPage();
  return lastData;
}
function renderPreview() {
  const label = MODULES.find(([key]) => key === activeView)?.[1] || 'Module';
  const status = activeClient.modules[activeView];
  main.innerHTML = `<div class="card module-preview"><span class="module-badge">DÉMO · aperçu</span><h2>${esc(label)}</h2><p>${esc(MODULE_DESCRIPTIONS[activeView] || 'Ce module sera disponible dans une prochaine phase.')}</p><p>${status === 'demo' ? 'Module en mode démo : cet aperçu ne contient pas de données réelles.' : 'Module activé pour ce profil, mais fonctionnalité non construite en phase 1.'}</p></div>`;
}
async function load(forceOverview = false) {
  if (!activeClient) return;
  const version = ++requestVersion;
  main.innerHTML = '<div class="loading">Chargement des données…</div>';
  if (activeView !== 'tableauxDeBord') {
    const overviewRequest = (currentOverview && !forceOverview
      ? Promise.resolve(currentOverview)
      : getJson(`/api/overview?clientId=${encodeURIComponent(clientId)}`))
      .then((overview) => {
        if (version !== requestVersion) return;
        currentOverview = overview;
        renderCopilot(activeClient, overview);
      })
      .catch((error) => {
        if (version !== requestVersion || currentOverview) return;
        document.getElementById('copilotPanel').textContent = `Copilote indisponible : ${error.message}`;
      });
    if (activeView === 'contacts' || activeView === 'entreprises') {
      try { await loadDirectory(activeView, version); }
      catch (error) { if (version === requestVersion) showMessage('Impossible de charger cette liste', error.message); }
    } else if (['transactions', 'emailsMarketing', 'pagesDestination'].includes(activeView)) {
      const key = activeView;
      const route = {
        transactions: '/api/transactions',
        emailsMarketing: '/api/email-reminders',
        pagesDestination: '/api/landing-pages',
      }[key];
      try {
        const data = await getJson(`${route}?clientId=${encodeURIComponent(clientId)}`);
        if (version !== requestVersion) return;
        setHeader(data);
        if (key === 'transactions') {
          TransactionView.render(data, activeClient, () => { currentOverview = null; load(true); });
        } else if (key === 'emailsMarketing') {
          RemindersView.render(data);
        } else {
          LandingPagesView.render(data);
        }
      } catch (error) {
        if (version === requestVersion) showMessage('Impossible de charger ce module', error.message);
      }
    } else {
      setHeader({ demoMode: true });
      renderPreview();
    }
    await overviewRequest;
    return;
  }
  try {
    const overview = currentOverview && !forceOverview ? currentOverview
      : await getJson(`/api/overview?clientId=${encodeURIComponent(clientId)}`);
    if (version !== requestVersion) return;
    currentOverview = overview;
    setHeader(overview);
    renderCopilot(activeClient, overview);
    render(overview);
  } catch (error) {
    if (version === requestVersion) showMessage('Impossible de charger cette source', error.message);
  }
}
async function start() {
  if (!clientId) {
    location.replace('/admin');
    return;
  }
  try {
    const clients = await getJson('/api/admin/clients');
    activeClient = clients.find((client) => client.id === clientId);
    if (!activeClient) {
      showMessage('Profil client introuvable', 'Cet identifiant ne correspond à aucun profil. Choisissez un profil dans le backoffice.', true);
      return;
    }
    if (activeClient.modules[activeView] === 'non-applicable') {
      activeView = MODULES.find(([key]) => activeClient.modules[key] !== 'non-applicable')?.[0] || '';
    }
    if (!activeView) {
      showMessage('Aucun module disponible', 'Activez au moins un module dans le backoffice.', true);
      return;
    }
    renderNav();
    await load();
  } catch (error) {
    showMessage('Impossible de charger les profils', error.message);
  }
}
start();