function readImportRows(buffer, filename, xlsx) {
  let input = buffer;
  let type = 'buffer';
  if (typeof filename === 'string' && /\.csv$/i.test(filename)) {
    try {
      input = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch (_) {
      input = new TextDecoder('windows-1252').decode(buffer);
    }
    input = input.replace(/^\uFEFF/, '');
    type = 'string';
  }
  const workbook = xlsx.read(input, { type });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, { defval: '' });
}

module.exports = { readImportRows };