// Philippine mobile numbers: 09XX XXX XXXX, also accepted as +63 9XX XXX XXXX.
// Keep in sync with server/utils/phone.js (the server re-checks everything).

export const PHONE_HINT = "Mobile number, e.g. 0917 123 4567";

// Strip everything a phone field shouldn't hold while the user types.
// Keeps digits, an optional leading "+", and caps the length.
export function sanitizePhoneInput(raw) {
  const s = String(raw ?? "");
  const plus = s.trimStart().startsWith("+");
  const digits = s.replace(/\D/g, "");
  const max = plus || digits.startsWith("63") ? 12 : 11;
  const d = digits.slice(0, max);
  if (plus) return "+" + formatDigits(d);
  return formatDigits(d);
}

// light spacing as you type: 0917 123 4567
function formatDigits(d) {
  if (d.startsWith("63")) return d; // international form: leave as typed
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(" ");
}

// → "0917 555 0142", or null when it isn't a valid mobile number
export function normalizePhone(raw) {
  const s = String(raw ?? "").trim();
  if (/[^\d\s\-().+]/.test(s)) return null;
  if (s.includes("+") && !/^\+\s*63[\d\s\-().]*$/.test(s)) return null; // "+" only as +63
  let d = s.replace(/\D/g, "");
  if (d.startsWith("63") && d.length === 12) d = "0" + d.slice(2);
  if (!/^09\d{9}$/.test(d)) return null;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

export const isValidPhone = (raw) => normalizePhone(raw) !== null;

// Throws a friendly Error for the form's toast. Empty is fine unless `required`.
export function checkPhone(raw, label = "Phone number", required = false) {
  const s = String(raw ?? "").trim();
  if (!s) {
    if (required) throw new Error(`${label} is required`);
    return "";
  }
  const n = normalizePhone(s);
  if (!n) throw new Error(`${label} must be a valid mobile number, e.g. 0917 123 4567`);
  return n;
}

// Emergency contact is stored as one string: "Name · 0917 000 0000"
export function splitEmergency(str) {
  const s = String(str ?? "").trim();
  if (!s) return { name: "", phone: "" };
  const i = s.lastIndexOf("·");
  if (i === -1) return isValidPhone(s) ? { name: "", phone: s } : { name: s, phone: "" };
  return { name: s.slice(0, i).trim(), phone: s.slice(i + 1).trim() };
}

export function joinEmergency(name, phone) {
  const n = String(name ?? "").trim();
  const p = String(phone ?? "").trim();
  if (!n && !p) return "";
  if (!n) throw new Error("Emergency contact needs a name");
  return `${n} · ${checkPhone(p, "Emergency contact number", true)}`;
}
