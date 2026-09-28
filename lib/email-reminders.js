function buildBasicReminders(contacts, cutoffISO) {
  return contacts
    .filter((contact) => ['lead', 'qualifie'].includes(contact.statut) &&
      (!contact.derniereRelance || contact.derniereRelance < cutoffISO))
    .map((contact) => ({
      nom: contact.nom || '',
      email: contact.email || '',
      dernierContact: contact.derniereRelance || null,
      raison: contact.derniereRelance ? 'Dernière relance ancienne' : 'Aucune relance enregistrée',
    }));
}

module.exports = { buildBasicReminders };