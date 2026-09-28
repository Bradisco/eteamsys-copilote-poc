const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('public/admin.html', 'utf8');
const source = fs.readFileSync('public/admin.js', 'utf8');

function functionSource(name) {
  const start = source.indexOf(`function ${name}() {`);
  assert.notEqual(start, -1, `function ${name} exists`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `function ${name} has a closing brace`);
  return source.slice(start, end + 2);
}

test('champs CRM conditionnels et secrets jamais préremplis', () => {
  assert.match(html, /id="hubspotCredentials"[^>]*data-credential-crm="hubspot"[^>]*hidden/);
  assert.match(html, /id="odooCredentials"[^>]*data-credential-crm="odoo"[^>]*hidden/);
  assert.match(html, /id="hubspotToken"[^>]*type="password"[^>]*autocomplete="new-password"/);
  assert.match(html, /id="odooPassword"[^>]*type="password"[^>]*autocomplete="new-password"/);
  const credentialSection = html.slice(html.indexOf('id="credentialsSection"'), html.indexOf('</section>', html.indexOf('id="credentialsSection"')));
  assert.doesNotMatch(credentialSection, /\bvalue\s*=/i);
  assert.match(source, /input\.disabled = !active/);
  assert.match(source, /if \(!active\) input\.value = ''/);
  assert.match(source, /clearCredentialInputs\(\);\s*updateCredentialFields\(\);/);
});

test('édition vide conserve les identifiants; seuls les nouveaux champs sont envoyés', () => {
  const fields = {
    nom: { value: 'Profil' }, secteur: { value: 'E-commerce' },
    crmExistant: { value: 'hubspot' }, statut: { value: 'actif' },
    consultantReferent: { value: '' }, solde: { value: '20' },
    hubspotToken: { value: '' }, odooUrl: { value: 'https://unused.invalid' },
    odooDb: { value: 'unused' }, odooUsername: { value: 'unused' }, odooPassword: { value: 'unused' },
  };
  const context = {
    CREDENTIALS: {
      hubspot: [['hubspotToken', 'Jeton HubSpot']],
      odoo: [['odooUrl', 'URL'], ['odooDb', 'Base'], ['odooUsername', 'Utilisateur'], ['odooPassword', 'Mot de passe']],
    },
    $: (id) => fields[id],
    document: { querySelectorAll: () => [] },
    editingId: 'client-1',
    editingCreditBalance: 20,
    Number,
  };
  const blankPayload = vm.runInNewContext(`${functionSource('formData')}\nformData()`, context);
  assert.equal(Object.hasOwn(blankPayload, 'credentials'), false);

  fields.hubspotToken.value = 'fresh-token';
  const enteredPayload = vm.runInNewContext(`${functionSource('formData')}\nformData()`, context);
  assert.deepEqual({ ...enteredPayload.credentials }, { hubspotToken: 'fresh-token' });
  assert.equal(Object.hasOwn(enteredPayload.credentials, 'odooUrl'), false);
});

test('changement de CRM masque et désactive les anciens champs avec avertissement', () => {
  const hubspotInput = { value: 'unsaved-token', disabled: false };
  const odooInput = { value: '', disabled: true };
  const groups = [
    { dataset: { credentialCrm: 'hubspot' }, hidden: false, querySelectorAll: () => [hubspotInput] },
    { dataset: { credentialCrm: 'odoo' }, hidden: true, querySelectorAll: () => [odooInput] },
  ];
  const fields = new Map();
  const get = (id) => {
    if (!fields.has(id)) fields.set(id, { textContent: '', className: '', hidden: false });
    return fields.get(id);
  };
  const context = {
    CREDENTIALS: {
      hubspot: [['hubspotToken', 'Jeton HubSpot']],
      odoo: [['odooUrl', 'URL Odoo'], ['odooDb', 'Base'], ['odooUsername', 'Utilisateur'], ['odooPassword', 'Mot de passe']],
    },
    $: get,
    document: { querySelectorAll: () => groups },
    editingId: 'client-1',
    editingOriginalCrm: 'hubspot',
    editingCredentialStatus: { hubspotToken: true },
    editingCredentialsConfigured: true,
  };

  get('crmExistant').value = 'hubspot';
  vm.runInNewContext(`${functionSource('updateCredentialFields')}\nupdateCredentialFields()`, context);
  assert.equal(groups[0].hidden, false);
  assert.equal(hubspotInput.disabled, false);
  assert.equal(fields.get('credentialsConfiguredBadge').textContent.includes('Identifiants configurés'), true);

  get('crmExistant').value = 'odoo';
  vm.runInNewContext(`${functionSource('updateCredentialFields')}\nupdateCredentialFields()`, context);
  assert.equal(groups[0].hidden, true);
  assert.equal(hubspotInput.disabled, true);
  assert.equal(hubspotInput.value, '');
  assert.equal(groups[1].hidden, false);
  assert.equal(odooInput.disabled, false);
  assert.equal(fields.get('crmChangeNotice').hidden, false);
  assert.match(fields.get('crmChangeNotice').textContent, /identifiants HubSpot enregistrés seront effacés/);
  assert.match(source, /\$\('crmExistant'\)\.addEventListener\('change', \(\) => \{\s*clearCredentialInputs\(\);/);
});

test('retrait explicite demande confirmation et appelle DELETE credentials', () => {
  assert.match(html, /id="removeCredentials"[^>]*type="button"[^>]*hidden/);
  assert.match(source, /Retirer définitivement les identifiants CRM enregistrés/);
  assert.match(source, /api\(`\/api\/admin\/clients\/\$\{encodeURIComponent\(editingId\)\}\/credentials`, \{ method: 'DELETE' \}\)/);
  assert.match(source, /removeCredentials'\)\.addEventListener\('click'/);
});