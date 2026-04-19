const fs = require('fs');
const jsonc = require('jsonc-parser');

function readSettings(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, data: {}, raw: null };
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.trim() === '') {
    return { exists: true, data: {}, raw };
  }
  const errors = [];
  const data = jsonc.parse(raw, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const err = new Error(
      `Invalid JSON in ${filePath}: ${errors
        .map((e) => `${jsonc.printParseErrorCode(e.error)} at offset ${e.offset}`)
        .join(', ')}`
    );
    err.code = 'CSA_INVALID_JSON';
    err.filePath = filePath;
    throw err;
  }
  return { exists: true, data: data || {}, raw };
}

module.exports = { readSettings };
