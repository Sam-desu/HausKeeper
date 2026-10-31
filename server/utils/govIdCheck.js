import { HttpError } from '../services/housing.js';

// Accepted Philippine government IDs and the shape of each number (spaces and dashes are ignored).
// This checks the FORMAT only: staff still compare the number with the uploaded photo.
export const GOV_ID_TYPES = {
  'PhilSys National ID': /^\d{16}$/,
  'Passport': /^[A-Z]{1,2}\d{7}[A-Z]?$/,
  "Driver's License": /^[A-Z]\d{10}$/,
  'UMID': /^\d{12}$/,
  'SSS ID': /^\d{10}$/,
  'PhilHealth ID': /^\d{12}$/,
  'Pag-IBIG ID': /^\d{12}$/,
  'TIN ID': /^(\d{9}|\d{12})$/,
  'PRC ID': /^\d{7}$/,
  'Postal ID': /^[A-Z0-9]{12}$/,
};

// Returns "Type — NUMBER" (the form the rest of the app already stores) or throws a 400
export function readGovId(type, number) {
  const t = String(type ?? '').trim();
  const rule = Object.hasOwn(GOV_ID_TYPES, t) ? GOV_ID_TYPES[t] : null;
  if (!rule) throw new HttpError(400, 'Choose which government ID you are using');
  const n = String(number ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]+$/.test(n) || !rule.test(n))
    throw new HttpError(400, `That doesn't look like a valid ${t} number. Check it against your ID`);
  if (/^(.)\1+$/.test(n.replace(/\D/g, '')) && /\d/.test(n)) // 0000-0000-0000 style placeholders
    throw new HttpError(400, `That ${t} number isn't real. Enter the number printed on your ID`);
  return `${t} — ${n}`;
}
