import Invoice from "../models/Invoice.js";
import Tenant from "../models/Tenant.js";
import { todayManila } from "../utils/dates.js";
import { notifyTenant, notifyStaff, peso } from "./notify.js";
import { getSettings } from "../models/Settings.js";
import { paymentReceiptEmail, overdueEmail } from "../utils/emailTemplates.js";

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
export async function settleInvoice(filter, method = null) {
  const invoice = await Invoice.findOneAndUpdate(
    { ...filter, status: "unpaid" },
    { status: "paid", paidOn: todayManila(), method },
    { new: true },
  );
  if (invoice) announcePayment(invoice).catch(() => {});
  return invoice;
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

// Sends one overdue notice per invoice. The flag is claimed atomically, so repeated runs never double-send.
export async function notifyOverdueInvoices() {
  const late = await Invoice.find({
    status: "unpaid",
    due: { $lt: todayManila() },
    overdueNotified: { $ne: true },
  }).select("_id");

  for (const { _id } of late) {
    const today = todayManila();
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
