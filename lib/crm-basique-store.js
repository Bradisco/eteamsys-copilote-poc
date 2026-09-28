const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { migrateOpportunities } = require('./crm-transactions');

function createCrmBasiqueStore(filePath, seedPath) {
  function save(data) {
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
      fs.renameSync(temporary, filePath);
    } catch (error) {
      try { fs.unlinkSync(temporary); } catch (_) { /* aucun fichier temporaire */ }
      throw error;
    }
  }
  function backup() {
    const original = fs.readFileSync(filePath);
    for (let attempt = 0; attempt < 10; attempt++) {
      const copy = `${filePath}.backup-${randomUUID()}.json`;
      try {
        fs.writeFileSync(copy, original, { flag: 'wx' });
        return copy;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
    throw new Error('Impossible de créer une copie de sauvegarde unique du CRM.');
  }
  function load() {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.copyFileSync(seedPath, filePath, fs.constants.COPYFILE_EXCL);
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      throw new Error(`JSON du CRM basique invalide : ${error.message}`);
    }
    const migrated = migrateOpportunities(data);
    if (migrated.changed) {
      backup();
      save(migrated.data);
    }
    return migrated.data;
  }
  return { load, save, backup };
}

module.exports = { createCrmBasiqueStore };