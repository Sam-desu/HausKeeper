import Invoice from '../models/Invoice.js';
import Tenant from '../models/Tenant.js';
import Room from '../models/Room.js';
import { getSettings } from '../models/Settings.js';
import { nextSeq } from '../models/Counter.js';
import { todayManila } from '../utils/dates.js';
import { notifyTenant, peso } from './notify.js';
import { newInvoiceEmail } from '../utils/emailTemplates.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------- small date helpers (all dates are "YYYY-MM-DD" strings, Manila calendar) ---------- */

const pad = (n) => String(n).padStart(2, '0');
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const round2 = (n) => Math.round(n * 100) / 100;
const addDays = (s, n) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// One billing month. A due day of 31 in a 30-day month falls on the last day.
function cycleFor(y, m, dueDay) {
  const days = daysIn(y, m);
  return {
    key: `${y}-${pad(m)}`,
    period: `${MONTHS[m - 1]} ${y}`, // same style as your manual invoices, e.g. "Nov 2026"
    days,
    start: ymd(y, m, 1),
    end: ymd(y, m, days),
    due: ymd(y, m, Math.min(dueDay, days)),
  };
}

/* ---------- shared by the manual route and the generator ---------- */

export async function announceNewInvoice(invoice) {
  const amountText = peso(invoice.amount);
  await notifyTenant(invoice.tenant, {
    type: 'invoice',
    title: `New invoice ${invoice.id}`,
    template: 'invoice',
    vars: { period: invoice.period, amount: amountText, due: invoice.due },
    html: (t, settings) =>
      newInvoiceEmail({
        propertyName: settings.propertyName,
        name: t.name,
        invoice,
        amountText,
        buttonUrl: process.env.APP_URL ? `${process.env.APP_URL}/tenant/billing` : '',
      }),
    link: '/tenant/billing',
  });
}

/* ---------- the generator ---------- */

// Creates every rent invoice that is due to be sent and does not exist yet.
// Safe to run as often as you like: existing invoices are never duplicated.
// dryRun: true returns what WOULD be created without writing or notifying anyone.
export async function generateMonthlyInvoices({ dryRun = false } = {}) {
  const settings = await getSettings();
  const dueDay = settings.billingDueDay ?? 5;
  const lead = settings.invoiceLeadDays ?? 7;

  const today = todayManila();
  const [ty, tm] = today.split('-').map(Number);
  const [ny, nm] = tm === 12 ? [ty + 1, 1] : [ty, tm + 1];

  // This month and next month, but only once their "send" date (due minus lead days) has arrived
  const cycles = [cycleFor(ty, tm, dueDay), cycleFor(ny, nm, dueDay)].filter(
    (c) => today >= addDays(c.due, -lead)
  );

  const result = { dryRun, created: 0, skipped: 0, failed: 0, invoices: [] };
  if (!cycles.length) return result;

  const tenants = await Tenant.find({ room: { $ne: null }, status: { $ne: 'inactive' } }).sort({ name: 1 });
  if (!tenants.length) return result;

  const rooms = await Room.find({ _id: { $in: tenants.map((t) => t.room) } }).select('price');
  const price = new Map(rooms.map((r) => [r._id, r.price]));

  // One query for everything that already exists (by cycle key OR by the same period label)
  const existing = await Invoice.find({
    tenant: { $in: tenants.map((t) => t._id) },
    kind: 'rent',
    $or: [
      { cycle: { $in: cycles.map((c) => c.key) } },
      { period: { $in: cycles.map((c) => new RegExp(`^${c.period}$`, 'i')) } },
    ],
  }).select('tenant cycle period');

  const have = new Set();
  for (const i of existing) {
    if (i.cycle) have.add(`${i.tenant}|${i.cycle}`);
    const match = cycles.find((c) => c.period.toLowerCase() === String(i.period).toLowerCase());
    if (match) have.add(`${i.tenant}|${match.key}`);
  }

  for (const cycle of cycles) {
    for (const tenant of tenants) {
      if (have.has(`${tenant._id}|${cycle.key}`)) continue;

      const rent = price.get(tenant.room);
      if (!(rent > 0)) {
        result.skipped++;
        continue;
      }

      const moveIn = /^\d{4}-\d{2}-\d{2}$/.test(tenant.moveIn || '') ? tenant.moveIn : null;
      if (moveIn && moveIn > cycle.end) continue; // not living here yet in that month

      let amount = rent;
      let due = cycle.due;
      let description = '';
      if (moveIn && moveIn > cycle.start) {
        const daysStayed = cycle.days - Number(moveIn.slice(8, 10)) + 1; // move-in day counts
        amount = round2((rent * daysStayed) / cycle.days);
        description = `Prorated rent: ${daysStayed} of ${cycle.days} days (from ${moveIn})`;
        if (due < today) due = addDays(today, lead); // don't hand a new tenant an already-overdue invoice
      }
      if (!(amount >= 1)) {
        result.skipped++;
        continue;
      }

      const row = {
        tenant: tenant.name,
        room: tenant.room,
        period: cycle.period,
        amount,
        due,
        prorated: Boolean(description),
      };

      if (dryRun) {
        result.created++;
        result.invoices.push(row);
        continue;
      }

      try {
        const seq = await nextSeq('invoice');
        const invoice = await Invoice.create({
          _id: 'INV-' + (2200 + seq),
          tenant: tenant._id,
          room: tenant.room,
          period: cycle.period,
          due,
          amount,
          kind: 'rent',
          cycle: cycle.key,
          description,
        });
        result.created++;
        result.invoices.push({ ...row, id: invoice.id });
        announceNewInvoice(invoice).catch(() => {});
      } catch (err) {
        if (err.code === 11000) result.skipped++; // another run/server got there first
        else {
          result.failed++;
          console.error(`Auto-invoice failed for ${tenant.name} (${cycle.period}):`, err.message);
        }
      }
    }
  }
  return result;
}

/* ---------- scheduled entry point (called from index.js) ---------- */

let running = false;

export async function runAutoInvoicing() {
  if (running) return null;
  running = true;
  try {
    const settings = await getSettings();
    if (!settings.autoInvoice) return null;
    const result = await generateMonthlyInvoices();
    if (result.created) console.log(`🧾 Auto-billing created ${result.created} invoice(s)`);
    return result;
  } finally {
    running = false;
  }
}
