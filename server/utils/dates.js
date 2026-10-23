// Today as YYYY-MM-DD in Manila time (the server may run in UTC)
export const todayManila = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

// True only for real calendar dates written as YYYY-MM-DD
export function isDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}