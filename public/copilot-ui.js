let copilotProfile = null;
let copilotBusy = false;
let creditVersion = 0;

function creditText(credits) {
  document.getElementById('creditCount').textContent = `${credits.solde} crédit${credits.solde > 1 ? 's' : ''} restant${credits.solde > 1 ? 's' : ''}`;
  document.getElementById('rechargeButton').hidden = credits.solde > 0;
  document.getElementById('creditAlert').hidden = credits.solde > 0;
}

async function copilotRequest(url, body) {
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Copilote indisponible.');
    error.credits = result.credits;
    throw error;
  }
  return result;
}

async function askCopilotUI(question) {
  if (!copilotProfile || copilotBusy || !question.trim()) return;
  copilotBusy = true;
  const send = document.getElementById('sendQuestion');
  send.disabled = true;
  const response = document.getElementById('copilotResponse');
  const error = document.getElementById('copilotError');
  response.hidden = true;
  error.hidden = true;
  try {
    const result = await copilotRequest('/api/copilot/ask', { clientId: copilotProfile, question: question.trim() });
    creditVersion += 1;
    if (copilotProfile !== result.clientId && result.clientId) return;
    response.textContent = result.answer;
    response.hidden = false;
    document.getElementById('questionInput').value = '';
    creditText(result.credits);
  } catch (cause) {
    error.textContent = cause.message;
    error.hidden = false;
    if (cause.credits) creditText(cause.credits);
  } finally {
    copilotBusy = false;
    if (document.getElementById('sendQuestion') === send) send.disabled = false;
  }
}

function renderCopilot(client, overview) {
  const panel = document.getElementById('copilotPanel');
  if (copilotProfile === client.id && panel.querySelector('#questionInput')) {
    fillSuggestions(overview);
    return;
  }
  copilotProfile = client.id;
  const version = ++creditVersion;
  panel.innerHTML = `
    <span class="copilot-kicker">Copilote de démonstration</span>
    <h2>Comment puis-je aider ?</h2>
    <p class="copilot-subtitle">Posez une question sur les données CRM disponibles. Les réponses sont simulées à partir des indicateurs affichés.</p>
    ${client.crmExistant === 'aucun' ? '' : '<p class="copilot-positioning">Assistant eTeamsys, distinct de l’IA native de votre CRM.</p>'}
    <div class="credit-strip" id="creditCount" aria-live="polite">Chargement des crédits…</div>
    <p id="creditAlert" class="copilot-error" hidden>Crédits épuisés. La recharge est une simulation, sans paiement.</p>
    <button type="button" class="recharge-button" id="rechargeButton" hidden>Recharger (simulation)</button>
    <h3>Suggéré</h3>
    <div id="suggestionList" class="suggestion-list"></div>
    <h3>Actions rapides</h3>
    <div class="quick-actions">
      <button type="button" id="summaryButton">Résumé</button>
      <button type="button" id="howButton">Comment faire</button>
      <button type="button" disabled title="Bientôt disponible">Créer</button>
      <button type="button" disabled title="Bientôt disponible">Réunions</button>
    </div>
    <label for="questionInput">Votre question</label>
    <textarea id="questionInput" maxlength="1000" placeholder="Ex. Qui dois-je relancer ?"></textarea>
    <button type="button" id="sendQuestion" class="copilot-send">Envoyer · 1 crédit</button>
    <p id="copilotError" role="alert" class="copilot-error" hidden></p>
    <div id="copilotResponse" class="copilot-response" aria-live="polite" hidden></div>`;
  // Tarif eTeamsys à confirmer : ne pas afficher de montant.
  fillSuggestions(overview);
  document.getElementById('summaryButton').addEventListener('click', () => askCopilotUI('Fais-moi un résumé de mon activité'));
  document.getElementById('howButton').addEventListener('click', () => {
    const input = document.getElementById('questionInput');
    input.focus();
    input.placeholder = 'Décrivez ce que vous souhaitez comprendre à partir des données CRM…';
  });
  document.getElementById('sendQuestion').addEventListener('click', () => askCopilotUI(document.getElementById('questionInput').value));
  document.getElementById('questionInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      askCopilotUI(event.currentTarget.value);
    }
  });
  document.getElementById('rechargeButton').addEventListener('click', async () => {
    try {
      const result = await copilotRequest('/api/copilot/recharge', { clientId: client.id });
      creditText(result.credits);
      document.getElementById('copilotError').hidden = true;
    } catch (error) {
      const message = document.getElementById('copilotError');
      message.textContent = error.message;
      message.hidden = false;
    }
  });
  fetch(`/api/copilot/credits?clientId=${encodeURIComponent(client.id)}`)
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (copilotProfile === client.id && version === creditVersion) creditText(result.credits);
    })
    .catch((error) => {
      if (copilotProfile === client.id) document.getElementById('creditCount').textContent = error.message;
    });
}

function fillSuggestions(overview) {
  const suggestions = document.getElementById('suggestionList');
  suggestions.replaceChildren();
  if (!overview.suggestions?.length) {
    suggestions.textContent = 'Aucune suggestion pertinente pour les données disponibles.';
  }
  for (const suggestion of overview.suggestions || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion';
    button.textContent = suggestion.label;
    button.addEventListener('click', () => askCopilotUI(suggestion.question));
    suggestions.append(button);
  }
}