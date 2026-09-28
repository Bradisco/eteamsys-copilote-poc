const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SECTORS, MODULE_KEYS } = require('../lib/client-store');
const { SECTOR_TEMPLATES, templateForSector } = require('../lib/sector-templates');
const { startServer } = require('./helpers/server-fixture');

test('sept secteurs exactement, contenus distincts et clés de nav existantes', () => {
  assert.deepEqual(Object.keys(SECTOR_TEMPLATES).sort(), [...SECTORS].sort());
  for (const sector of SECTORS) {
    const template = templateForSector(sector);
    assert.ok(template.objectif);
    assert.ok(template.besoin);
    assert.ok(template.modulesCles.length);
    assert.ok(template.navKeys.every((key) => MODULE_KEYS.includes(key)));
  }
  assert.notDeepEqual(templateForSector(SECTORS[0]), templateForSector(SECTORS[6]));
});

test('overview lié au secteur du profil, lecture historique inchangée', async (t) => {
  const { base, active, demo } = await startServer(t);
  const first = await (await fetch(`${base}/api/overview?clientId=${active.id}`)).json();
  const second = await (await fetch(`${base}/api/overview?clientId=${demo.id}`)).json();
  const legacy = await (await fetch(`${base}/api/overview?source=crm-basique`)).json();
  assert.notEqual(first.sectorTemplate.objectif, second.sectorTemplate.objectif);
  assert.ok(first.briefing && second.briefing);
  assert.equal(legacy.sectorTemplate, undefined);
});