// Philippine mobile numbers: 09XX XXX XXXX, also accepted as +63 9XX XXX XXXX or 639XXXXXXXXX.
// Everything is stored in the local "09XX XXX XXXX" format.

// → "0917 555 0142", or null when it isn't a valid mobile number
export function normalizePhone(raw) {
  const s = String(raw ?? '').trim();
  if (/[^\d\s\-().+]/.test(s)) return null; // letters or other symbols
  if (s.includes('+') && !/^\+\s*63[\d\s\-().]*$/.test(s)) return null; // "+" only as +63
  let d = s.replace(/\D/g, '');
  if (d.startsWith('63') && d.length === 12) d = '0' + d.slice(2);
  if (!/^09\d{9}$/.test(d)) return null;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

// Optional phone field: '' is fine, anything else must be valid. Returns the cleaned value.
export function cleanPhone(raw, label = 'Phone number') {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const n = normalizePhone(s);
  if (!n) throw Object.assign(new Error(`${label} must be a valid mobile number, e.g. 0917 123 4567`), { status: 400 });
  return n;
}

// Emergency contact is stored as "Name · 0917 000 0000" (or "Name (Relationship) · 0917 …")
export function cleanEmergency(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const i = s.lastIndexOf('·');
  const name = i === -1 ? s : s.slice(0, i).trim();
  const phone = i === -1 ? '' : s.slice(i + 1).trim();
  if (!name) throw Object.assign(new Error('Emergency contact needs a name'), { status: 400 });
  const n = normalizePhone(phone);
  if (!n) throw Object.assign(new Error('Emergency contact needs a valid mobile number, e.g. 0917 123 4567'), { status: 400 });
  return `${name} · ${n}`;
}
