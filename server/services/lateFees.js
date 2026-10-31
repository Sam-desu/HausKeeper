import Invoice from '../models/Invoice.js';
import { getSettings } from '../models/Settings.js';
import { todayManila } from '../utils/dates.js';
import { notifyTenant, peso } from './notify.js';
import { lateFeeEmail } from '../utils/emailTemplates.js';

/*
  Late fee model
  - Invoice.amount is ALWAYS the total payable (rent + late fee), so checkout, balances and KPIs keep working.
  - Invoice.lateFee is the part of `amount` that is a late fee. Rent = amount - lateFee.
  - The fee only ever grows (via $max) and is recalculated from the due date, so re-runs never double charge.
  - Rent invoices only. A waived invoice (lateFeeWaived) never gets a fee again.
*/

const round2 = (n) => Math.round(n * 100) / 100;
const dayNum = (s) => Date.parse(`${s}T00:00:00Z`) / 86400000;

export const lateFeePolicy = (s) => ({
  enabled: !!s.lateFeeEnabled,
  flat: s.lateFeeFlat ?? 200,
  pct: s.lateFeeWeeklyPct ?? 1,
  grace: s.lateFeeGraceDays ?? 0,
  cap: s.lateFeeCap ?? 0, // 0 = no cap
});

// Flat fee once the grace period is over, then pct% of the rent for every full week after that.
// e.g. rent 5000, 15 days late, no grace: 200 + 2 weeks x 50 = 300
export function computeLateFee(base, daysLate, p) {
  if (daysLate <= p.grace) return 0;
  const weeks = Math.floor((daysLate - p.grace) / 7);
  let fee = p.flat + ((base * p.pct) / 100) * weeks;
  if (p.cap > 0) fee = Math.min(fee, p.cap);
  return round2(fee);
}

// Text shown in Settings and in the overdue email
export function lateFeeLabel(s) {
  const p = lateFeePolicy(s);
  const parts = [];
  if (p.flat > 0) parts.push(`₱${p.flat} flat`);
  if (p.pct > 0) parts.push(`${p.pct}%/week`);
  if (!p.enabled || !parts.length) return 'No late fee';
  let text = `${parts.join(' + ')} after due date`;
  if (p.grace > 0) text += ` (${p.grace}-day grace)`;
  if (p.cap > 0) text += `, max ₱${p.cap}`;
  return text;
}

// Atomic raise of one invoice's fee. Works in the database (update pipeline, MongoDB 4.2+), so it can never
// race with a payment: it only touches invoices that are still unpaid and not waived.
async function bumpLateFee(id, fee) {
  const r = await Invoice.collection.updateOne(
    // `lateFee < fee` means only the run that really raises the fee matches (two runs at once can't both win)
    {
      _id: id,
      status: 'unpaid',
      lateFeeWaived: { $ne: true },
      $or: [{ lateFee: null }, { lateFee: { $lt: fee } }],
    },
    [
      { $set: { _cur: { $ifNull: ['$lateFee', 0] } } },
      { $set: { _base: { $subtract: ['$amount', '$_cur'] }, _fee: { $max: ['$_cur', fee] } } },
      {
        $set: {
          lateFee: '$_fee',
          amount: { $round: [{ $add: ['$_base', '$_fee'] }, 2] },
          updatedAt: '$$NOW',
        },
      },
      { $unset: ['_cur', '_base', '_fee'] },
    ]
  );
  return r.modifiedCount === 1;
}

// Tells the tenant (in-app bell, plus email/SMS if switched on) that a late fee was added or increased.
// Sent once per increase: the first charge, then each full week. Uses the "overdue" notification type.
async function announceLateFee(id, from, to, daysLate) {
  const invoice = await Invoice.findById(id);
  if (!invoice || invoice.status !== 'unpaid') return;
  const added = `₱${peso(round2(to - from))}`;
  const total = `₱${peso(invoice.amount)}`;
  await notifyTenant(invoice.tenant, {
    type: 'overdue',
    title: from > 0 ? `Late fee increased on ${invoice.id}` : `Late fee added to ${invoice.id}`,
    message:
      from > 0
        ? `The late fee on invoice ${invoice.id} (${invoice.period}) went up by ${added} to ₱${peso(to)}. New total: ${total}.`
        : `A late fee of ${added} was added to invoice ${invoice.id} (${invoice.period}), which is ${daysLate} day${daysLate === 1 ? '' : 's'} overdue. New total: ${total}.`,
    html: (t, settings) =>
      lateFeeEmail({
        propertyName: settings.propertyName,
        name: t.name,
        invoice,
        feeText: added,
        amountText: peso(invoice.amount),
        daysLate,
        buttonUrl: process.env.APP_URL ? `${process.env.APP_URL}/tenant/billing` : '',
      }),
    link: '/tenant/billing',
  });
}

// Hourly job. dryRun lists what would be charged; ignoreEnabled lets staff preview before switching it on.
export async function applyLateFees({ dryRun = false, ignoreEnabled = false } = {}) {
  const p = lateFeePolicy(await getSettings());
  const result = { dryRun, added: 0, invoices: [] };
  if (!p.enabled && !ignoreEnabled) return result;

  const today = todayManila();
  const late = await Invoice.find({
    status: 'unpaid',
    kind: 'rent',
    lateFeeWaived: { $ne: true },
    due: { $lt: today },
  }).populate('tenant', 'name');

  for (const i of late) {
    const cur = i.lateFee || 0;
    const daysLate = dayNum(today) - dayNum(i.due);
    const fee = computeLateFee(round2(i.amount - cur), daysLate, p);
    if (fee <= cur) continue;
    if (!dryRun) {
      if (!(await bumpLateFee(i._id, fee))) continue; // someone else already raised it
      announceLateFee(i._id, cur, fee, daysLate).catch(() => {});
    }
    result.added = round2(result.added + (fee - cur));
    result.invoices.push({
      id: i._id,
      tenant: i.tenant?.name || '',
      period: i.period,
      due: i.due,
      daysLate,
      from: cur,
      to: fee,
    });
  }
  return result;
}

export const runLateFees = async () => {
  const r = await applyLateFees();
  if (r.invoices.length) console.log(`⏰ Late fees updated on ${r.invoices.length} invoice(s)`);
  return r;
};

// Called right before a tenant is sent to PayMongo so the checkout page shows TODAY's fee, not the last hourly one.
// Returns the up-to-date invoice document.
export async function refreshLateFee(invoice) {
  if (invoice.kind !== 'rent' || invoice.status !== 'unpaid' || invoice.lateFeeWaived) return invoice;
  const p = lateFeePolicy(await getSettings());
  if (!p.enabled) return invoice;
  const cur = invoice.lateFee || 0;
  const daysLate = dayNum(todayManila()) - dayNum(invoice.due);
  const fee = computeLateFee(round2(invoice.amount - cur), daysLate, p);
  if (fee <= cur) return invoice;
  await bumpLateFee(invoice._id, fee);
  return (await Invoice.findById(invoice._id)) || invoice;
}

// Staff waives the late fee on one invoice (removes it and stops it coming back).
export async function waiveLateFee(id) {
  const r = await Invoice.collection.updateOne(
    { _id: id, status: 'unpaid', kind: 'rent', lateFeeWaived: { $ne: true } },
    [
      {
        $set: {
          amount: { $round: [{ $subtract: ['$amount', { $ifNull: ['$lateFee', 0] }] }, 2] },
          lateFee: 0,
          lateFeeWaived: true,
          updatedAt: '$$NOW',
        },
      },
    ]
  );
  return r.modifiedCount === 1;
}