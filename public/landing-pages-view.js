(function () {
  function safeUrl(raw) {
    try {
      const url = new URL(raw);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch (_) { return null; }
  }
  function render(data) {
    const rows = data.items.map((item) => {
      const href = safeUrl(item.url);
      const url = href && item.statut === 'publie'
        ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(item.url)}</a>`
        : esc(item.url || 'Non renseignée');
      return `<tr><td>${esc(item.titre)}</td><td>${url}</td><td>${esc(item.statut === 'publie' ? 'Publié' : 'Brouillon')}</td><td>${esc(item.date || 'Non renseignée')}</td></tr>`;
    }).join('');
    document.getElementById('mainContent').innerHTML = `
      <section class="card">
        <h2>Pages de destination</h2>
        <div class="directory-intro"><span class="source-badge">DÉMO · données d’exemple</span><p>${esc(data.note)}</p></div>
        ${rows ? `<div class="directory-table-wrap"><table class="directory-table"><thead><tr><th scope="col">Titre</th><th scope="col">URL</th><th scope="col">Statut</th><th scope="col">Date de création</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty-list">Aucune page de destination enregistrée.</p>'}
      </section>`;
  }
  window.LandingPagesView = { render, safeUrl };
})();