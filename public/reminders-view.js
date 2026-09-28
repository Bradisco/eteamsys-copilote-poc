(function () {
  function mailLink(email) {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return esc(email || 'Non renseigné');
    return `<a href="mailto:${encodeURIComponent(email)}">${esc(email)}</a>`;
  }
  function render(data) {
    const body = data.source === 'crm-basique'
      ? (data.items.length
        ? `<div class="directory-table-wrap"><table class="directory-table"><thead><tr><th scope="col">Nom</th><th scope="col">E-mail</th><th scope="col">Dernier contact connu</th><th scope="col">Raison</th></tr></thead><tbody>
          ${data.items.map((item) => `<tr><td>${esc(item.nom)}</td><td>${mailLink(item.email)}</td>
            <td>${esc(item.dernierContact || 'Aucune date')}</td><td>${esc(item.raison)}</td></tr>`).join('')}
          </tbody></table></div>`
        : '<p class="empty-list">Aucun contact à relancer selon la règle des sept jours.</p>')
      : (data.counters.length
        ? `<div class="reminder-counts">${data.counters.map((item) => `<div class="reminder-count"><strong>${fmtNum(item.count)}</strong><span>${esc(item.label)}</span></div>`).join('')}</div>`
        : '<p class="empty-list">Aucun compteur de relance disponible.</p>');
    document.getElementById('mainContent').innerHTML = `
      <section class="card">
        <h2>Contacts à relancer</h2>
        <div class="directory-intro"><span class="source-badge ${data.demoMode ? '' : 'live'}">${data.demoMode ? 'DÉMO' : 'LIVE'}</span>
          <p>${esc(data.note)} Relevé du ${esc(data.asOf)}.</p></div>
        ${body}
      </section>`;
  }
  window.RemindersView = { render };
})();