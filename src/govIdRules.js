// Accepted Philippine government IDs. Keep in sync with server/utils/govIdCheck.js (the server has the final say).
export const GOV_ID_TYPES = {
  "PhilSys National ID": { re: /^\d{16}$/, hint: "16 digits, e.g. 1234-5678-9012-3456" },
  Passport: { re: /^[A-Z]{1,2}\d{7}[A-Z]?$/, hint: "e.g. P1234567A" },
  "Driver's License": { re: /^[A-Z]\d{10}$/, hint: "e.g. N01-23-456789" },
  UMID: { re: /^\d{12}$/, hint: "12 digits (CRN), e.g. 0123-4567890-1" },
  "SSS ID": { re: /^\d{10}$/, hint: "10 digits, e.g. 12-3456789-0" },
  "PhilHealth ID": { re: /^\d{12}$/, hint: "12 digits, e.g. 12-345678901-2" },
  "Pag-IBIG ID": { re: /^\d{12}$/, hint: "12 digits, e.g. 1234-5678-9012" },
  "TIN ID": { re: /^(\d{9}|\d{12})$/, hint: "9 or 12 digits, e.g. 123-456-789" },
  "PRC ID": { re: /^\d{7}$/, hint: "7 digits" },
  "Postal ID": { re: /^[A-Z0-9]{12}$/, hint: "12 letters/numbers" },
};

const clean = (v) => String(v || "").toUpperCase().replace(/[\s-]/g, "");

// Returns an error message, or "" when the number looks right for that ID type
export function govIdError(type, number) {
  const rule = GOV_ID_TYPES[type];
  if (!rule) return "Choose which government ID you are using.";
  const n = clean(number);
  if (!n) return "Enter your ID number.";
  if (!/^[A-Z0-9]+$/.test(n) || !rule.re.test(n))
    return `That doesn't look like a valid ${type} number (${rule.hint}).`;
  const digits = n.replace(/\D/g, "");
  if (digits && /^(.)\1+$/.test(digits))
    return "Enter the number printed on your ID, not a placeholder.";
  return "";
}

// "Passport — P1234567A" (as saved) → { type, number }
export function splitGovId(saved) {
  const [type, ...rest] = String(saved || "").split(" — ");
  return GOV_ID_TYPES[type] ? { type, number: rest.join(" — ") } : { type: "", number: "" };
}
