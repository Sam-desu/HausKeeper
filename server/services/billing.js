import Invoice from "../models/Invoice.js";
import Tenant from "../models/Tenant.js";
import { todayManila } from "../utils/dates.js";
import { notifyTenant, notifyStaff, peso } from "./notify.js";
import { getSettings } from "../models/Settings.js";
import {
  paymentReceiptEmail,
  bulkPaymentReceiptEmail,
  overdueEmail,
} from "../utils/emailTemplates.js";

export const METHOD_LABELS = {
  gcash: "GCash",
  paymaya: "Maya",
  card: "Card",
  cash: "Cash",
  bank: "Bank transfer",
  other: "Other",
};
export const STAFF_METHODS = ["cash", "bank", "gcash", "other"];

// Accepts one tenant doc or an array. Returns JSON with a computed `balance`
// (sum of all unpaid invoices, including overdue ones).
export async function attachBalances(docs) {
  const list = Array.isArray(docs) ? docs : [docs];
  const rows = await Invoice.aggregate([
    { $match: { status: "unpaid", tenant: { $in: list.map((d) => d._id) } } },
    { $group: { _id: "$tenant", total: { $sum: "$amount" } } },
  ]);
  const totals = new Map(rows.map((r) => [String(r._id), r.total]));
  const out = list.map((d) => ({
    ...d.toJSON(),
    balance: totals.get(String(d._id)) || 0,
  }));
  return Array.isArray(docs) ? out : out[0];
}

// Totals for the billing KPI cards and the dashboard
export async function invoiceSummary() {
  const today = todayManila();
  const isOverdue = {
    $and: [{ $eq: ["$status", "unpaid"] }, { $lt: ["$due", today] }],
  };
  const [row] = await Invoice.aggregate([
    {
      $group: {
        _id: null,
        collected: {
          $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] },
        },
        overdueTotal: { $sum: { $cond: [isOverdue, "$amount", 0] } },
        overdueCount: { $sum: { $cond: [isOverdue, 1, 0] } },
        unpaidCount: {
          $sum: { $cond: [{ $eq: ["$status", "unpaid"] }, 1, 0] },
        }, // includes overdue
      },
    },
  ]);
  return {
    collected: row?.collected || 0,
    overdueTotal: row?.overdueTotal || 0,
    overdueCount: row?.overdueCount || 0,
    unpaidCount: row?.unpaidCount || 0,
  };
}

// The one place an invoice becomes paid. `filter` decides which invoice (e.g. {_id, tenant}).
// Only an unpaid invoice can match, so paying twice (return page + webhook, double click) is harmless:
// the second attempt gets null and sends no second notification.
// Pass { announce: false } to skip the notification (used by settleMany).
export async function settleInvoice(
  filter,
  method = null,
  { announce = true } = {},
) {
  const invoice = await Invoice.findOneAndUpdate(
    { ...filter, status: "unpaid" },
    { status: "paid", paidOn: todayManila(), method },
    { new: true },
  );
  if (invoice && announce) announcePayment(invoice).catch(() => {});
  return invoice;
}

// Pays several invoices, then sends ONE notification (and one email) for the whole batch.
// `filters` is an array of filters, e.g. [{ _id: "INV-2203", tenant }, ...]
// A batch that ends up with a single paid invoice sends the normal single receipt.
export async function settleMany(filters, method = null) {
  const settled = (
    await Promise.all(
      filters.map((f) => settleInvoice(f, method, { announce: false })),
    )
  ).filter(Boolean);

  if (settled.length === 1) announcePayment(settled[0]).catch(() => {});
  else if (settled.length > 1) announceBulkPayment(settled).catch(() => {});
  return settled;
}

async function announcePayment(invoice) {
  const how = invoice.method
    ? ` via ${METHOD_LABELS[invoice.method] || invoice.method}`
    : "";
  const tenant = await Tenant.findById(invoice.tenant).select("name");

  await notifyTenant(invoice.tenant, {
    type: "payment",
    title: "Payment received",
    message: `Thank you! We received your ₱${peso(invoice.amount)} payment${how} for invoice ${invoice.id} (${invoice.period}).`,
    html: (t, settings) =>
      paymentReceiptEmail({
        propertyName: settings.propertyName,
        name: t.name,
        invoice,
        methodLabel: METHOD_LABELS[invoice.method] || invoice.method,
        amountText: peso(invoice.amount),
        buttonUrl: process.env.APP_URL
          ? `${process.env.APP_URL}/tenant/billing`
          : "",
      }),
    link: "/tenant/billing",
  });
  await notifyStaff("billing", {
    type: "payment",
    title: "Payment received",
    message: `${tenant?.name || "A tenant"} paid ₱${peso(invoice.amount)}${how} for ${invoice.id} (Room ${invoice.room}).`,
    link: "/admin/billing",
  });
}

// One combined notification + email for a batch of invoices paid together.
async function announceBulkPayment(invoices) {
  const first = invoices[0];
  const how = first.method
    ? ` via ${METHOD_LABELS[first.method] || first.method}`
    : "";
  const total = invoices.reduce((s, i) => s + i.amount, 0);
  const tenant = await Tenant.findById(first.tenant).select("name");
  const list = invoices
    .map((i) => `• ${i.id} (${i.period}): ₱${peso(i.amount)}`)
    .join("\n");
  const rooms = [...new Set(invoices.map((i) => i.room))].join(", ");

  await notifyTenant(first.tenant, {
    type: "payment",
    title: `Payment received for ${invoices.length} invoices`,
    message: `Thank you! We received your ₱${peso(total)} payment${how} covering ${invoices.length} invoices:\n${list}`,
    html: (t, settings) =>
      bulkPaymentReceiptEmail({
        propertyName: settings.propertyName,
        name: t.name,
        items: invoices.map((i) => ({
          id: i.id,
          period: i.period,
          amountText: peso(i.amount),
        })),
        room: rooms,
        methodLabel: METHOD_LABELS[first.method] || first.method,
        paidOn: first.paidOn,
        amountText: peso(total),
        buttonUrl: process.env.APP_URL
          ? `${process.env.APP_URL}/tenant/billing`
          : "",
      }),
    link: "/tenant/billing",
  });
  await notifyStaff("billing", {
    type: "payment",
    title: "Payment received",
    message: `${tenant?.name || "A tenant"} paid ₱${peso(total)}${how} for ${invoices.length} invoices (${invoices.map((i) => i.id).join(", ")}).`,
    link: "/admin/billing",
  });
}

// Sends one overdue notice per invoice. The flag is claimed atomically, so repeated runs never double-send.
export async function notifyOverdueInvoices() {
  const today = todayManila();
  const late = await Invoice.find({
    status: "unpaid",
    due: { $lt: today },
    overdueNotified: { $ne: true },
  }).select("_id");

  for (const { _id } of late) {
    // Claim the invoice atomically; if another run got it first, this returns null.
    const inv = await Invoice.findOneAndUpdate(
      {
        _id,
        status: "unpaid",
        due: { $lt: today },
        overdueNotified: { $ne: true },
      },
      { overdueNotified: true },
      { new: true },
    );
    if (!inv) continue;

    const daysLate = Math.max(
      0,
      Math.round((new Date(today) - new Date(inv.due)) / 86400000),
    );

    await notifyTenant(inv.tenant, {
      type: "overdue",
      title: `Invoice ${inv.id} is overdue`,
      template: "overdue",
      vars: { period: inv.period, amount: peso(inv.amount), due: inv.due },
      html: (t, settings) =>
        overdueEmail({
          propertyName: settings.propertyName,
          name: t.name,
          invoice: inv,
          amountText: peso(inv.amount),
          daysLate,
          buttonUrl: process.env.APP_URL
            ? `${process.env.APP_URL}/tenant/billing`
            : "",
        }),
      link: "/tenant/billing",
    });
  }
}