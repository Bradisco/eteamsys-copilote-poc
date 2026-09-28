(function () {
  const stages = [
    ['initiation', 'Initiation'], ['offre-envoyee', 'Offre envoyée'],
    ['negociation', 'Négociation'], ['gagne', 'Won'], ['perdu', 'Lost'],
  ];
  const main = document.getElementById('mainContent');

  async function write(url, method, body) {
    const response = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Enregistrement impossible (HTTP ${response.status})`);
    return result;
  }

  function render(data, client, onChange) {
    const basic = data.source === 'crm-basique';
    const rows = data.funnel.map((stage, index) => `
      <tr><td>${esc(stage.label)}</td><td>${fmtNum(stage.count)}</td>
      <td>${basic ? (stage.hasAmount ? fmtEUR(stage.amount) : 'Non renseigné') : 'Indisponible'}</td></tr>`).join('');
    const total = data.funnel.reduce((sum, stage) => sum + stage.count, 0);
    const segments = data.funnel.map((stage, index) => `
      <div class="fseg" style="flex:${Math.max(stage.count, 1)} 0 0;background:${CAT[index % CAT.length]}"
        title="${esc(stage.label)} : ${fmtNum(stage.count)}">
        <span>${esc(stage.short || stage.label)}<small>${fmtNum(stage.count)}</small></span>
      </div>`).join('');
    const items = data.items.map((item) => `
      <tr><td>${esc(item.titre)}</td><td>${esc(item.contactNom || 'Contact inconnu')}</td>
      <td>${item.montant == null ? 'Non renseigné' : fmtEUR(item.montant)}</td>
      <td><select class="stage-select" data-id="${esc(item.id)}" aria-label="Stade de ${esc(item.titre)}">
        ${stages.map(([id, label]) => `<option value="${id}" ${item.etape === id ? 'selected' : ''}>${label}</option>`).join('')}
      </select></td><td>${esc(item.dateMaj || 'Non renseignée')}</td></tr>`).join('');
    main.innerHTML = `
      <section class="card">
        <h2>Pipeline commercial</h2>
        <div class="directory-intro"><span class="source-badge ${data.demoMode ? '' : 'live'}">${data.demoMode ? 'DÉMO' : 'LIVE'}</span><p>${esc(data.note)}</p></div>
        ${total ? `<div class="funnel transaction-funnel" aria-hidden="true">${segments}</div>` : '<p class="empty-list">Aucune transaction dans le pipeline.</p>'}
        <div class="directory-table-wrap"><table class="directory-table"><thead><tr><th scope="col">Stade</th><th scope="col">Transactions</th><th scope="col">Montant total</th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>
      ${data.canEdit ? `
        <section class="card">
          <h2>Transactions du CRM basique</h2>
          ${items ? `<div class="directory-table-wrap"><table class="directory-table"><thead><tr><th scope="col">Titre</th><th scope="col">Contact</th><th scope="col">Montant</th><th scope="col">Stade modifiable</th><th scope="col">Mise à jour</th></tr></thead><tbody>${items}</tbody></table></div>` : '<p class="empty-list">Aucune transaction enregistrée.</p>'}
          <p id="transactionError" role="alert" class="copilot-error" hidden></p>
        </section>
        <section class="card">
          <h2>Créer une transaction</h2>
          <form id="createTransaction" class="transaction-form">
            <div class="form-row"><label for="transactionContact">Contact</label>
              <select id="transactionContact" name="contactId" required>${data.contacts.map((contact) =>
                `<option value="${esc(contact.id)}">${esc(contact.nom)}</option>`).join('')}</select></div>
            <div class="form-row"><label for="transactionTitle">Titre</label><input id="transactionTitle" name="titre" maxlength="200" required></div>
            <div class="form-row"><label for="transactionAmount">Montant (€), facultatif</label><input id="transactionAmount" name="montant" type="number" min="0" step="any"></div>
            <div class="form-row"><label for="transactionStage">Stade</label><select id="transactionStage" name="etape">
              ${stages.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></div>
            <button class="btn" type="submit" ${data.contacts.length ? '' : 'disabled'}>Créer la transaction</button>
            ${data.contacts.length ? '' : '<p>Ajoutez d’abord un contact dans le module Contacts.</p>'}
            <p id="transactionFormError" role="alert" class="copilot-error" hidden></p>
          </form>
        </section>` : ''}
    `;
    if (!data.canEdit) return;
    function errorAt(id, error) {
      const element = document.getElementById(id);
      if (element) { element.textContent = error.message; element.hidden = false; }
    }
    document.getElementById('createTransaction').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const fields = new FormData(form);
        const amount = fields.get('montant');
        await write('/api/crm-basique/transactions', 'POST', {
          clientId: client.id, contactId: fields.get('contactId'), titre: fields.get('titre'),
          etape: fields.get('etape'), ...(amount === '' ? {} : { montant: Number(amount) }),
        });
        onChange();
      } catch (error) { errorAt('transactionFormError', error); button.disabled = false; }
    });
    main.querySelectorAll('.stage-select').forEach((select) => select.addEventListener('change', async () => {
      const original = data.items.find((item) => item.id === select.dataset.id).etape;
      select.disabled = true;
      try {
        await write(`/api/crm-basique/transactions/${encodeURIComponent(select.dataset.id)}`, 'PATCH', {
          clientId: client.id, etape: select.value,
        });
        onChange();
      } catch (error) {
        select.value = original;
        select.disabled = false;
        errorAt('transactionError', error);
      }
    }));
  }

  window.TransactionView = { render };
})();