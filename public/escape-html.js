function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => entities[character]);
}
if (typeof module === 'object' && module.exports) module.exports = { escapeHtml };
else window.escapeHtml = escapeHtml;