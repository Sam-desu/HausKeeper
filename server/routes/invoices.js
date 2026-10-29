import { Router } from "express";
import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import Tenant from "../models/Tenant.js";
import { nextSeq } from "../models/Counter.js";
import { requireStaff, requireTenant } from "../middleware/auth.js";
import { HttpError } from "../services/housing.js";
import {
  invoiceSummary,
  settleInvoice,
  STAFF_METHODS,
} from "../services/billing.js";
import { notifyTenant, peso } from "../services/notify.js";
import { paymongoEnabled } from "../services/paymongo.js";
import { todayManila } from "../utils/dates.js";
import { newInvoiceEmail } from "../utils/emailTemplates.js";

const router = Router();

/* ---------- tenant (self-service), defined before staff routes ---------- */

// GET /api/invoices/mine
router.get("/mine", requireTenant, async (req, res) => {
  res.json(
    await Invoice.find({ tenant: req.user.id }).sort({ due: -1, _id: -1 }),
  );
});

// POST /api/invoices/mine/:id/pay
// Old simulated payment. It only works while PayMongo is NOT configured: once real payments are on,
// tenants must go through POST /api/payments/checkout/:id, otherwise anyone could mark themselves paid.
router.post("/mine/:id/pay", requireTenant, async (req, res) => {
  if (paymongoEnabled())
    throw new HttpError(403, "Please use the Pay now button to pay online");
  const paid = await settleInvoice({ _id: req.params.id, tenant: req.user.id });
  if (paid) return res.json(paid);
  const exists = await Invoice.exists({
    _id: req.params.id,
    tenant: req.user.id,
  });
  throw new HttpError(
    exists ? 409 : 404,
    exists ? "Invoice is already paid" : "Invoice not found",
  );
});

/* ---------- staff (needs "billing" permission) ---------- */

// GET /api/invoices?status=paid|unpaid|overdue&tenant=<id>
router.get("/", requireStaff("billing"), async (req, res) => {
  const today = todayManila();
  const filter = {};
  const { status, tenant } = req.query;
  if (status === "paid") filter.status = "paid";
  else if (status === "unpaid")
    Object.assign(filter, { status: "unpaid", due: { $gte: today } });
  else if (status === "overdue")
    Object.assign(filter, { status: "unpaid", due: { $lt: today } });
  if (tenant) filter.tenant = tenant;
  res.json(
    await Invoice.find(filter)
      .populate("tenant", "name")
      .sort({ due: -1, _id: -1 }),
  );
});

// GET /api/invoices/summary: numbers for the billing KPI cards
router.get("/summary", requireStaff("billing"), async (_req, res) => {
  res.json(await invoiceSummary());
});

// GET /api/invoices/billable: tenants who can be invoiced (have a room)
router.get("/billable", requireStaff("billing"), async (_req, res) => {
  const tenants = await Tenant.find({
    room: { $ne: null },
    status: { $ne: "inactive" },
  })
    .select("name room")
    .sort({ name: 1 });
  res.json(tenants.map((t) => ({ id: t.id, name: t.name, room: t.room })));
});

// POST /api/invoices   body: { tenant, period, due, amount }
router.post("/", requireStaff("billing"), async (req, res) => {
  const { tenant: tenantId, period, due } = req.body;
  const amount = Number(req.body.amount);

  if (!mongoose.isValidObjectId(tenantId))
    throw new HttpError(400, "Choose a tenant");
  if (!period?.trim()) throw new HttpError(400, "Billing period is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due || ""))
    throw new HttpError(400, "A due date is required");
  if (!(amount > 0))
    throw new HttpError(400, "Amount must be greater than zero");

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new HttpError(404, "Tenant not found");
  if (!tenant.room)
    throw new HttpError(400, "That tenant has no room assigned");

  const seq = await nextSeq("invoice");
  const invoice = await Invoice.create({
    _id: "INV-" + (2200 + seq),
    tenant: tenant._id,
    room: tenant.room,
    period: period.trim(),
    due,
    amount,
  });
  notifyTenant(tenant._id, {
    type: "invoice",
    title: `New invoice ${invoice.id}`,
    template: "invoice",
    vars: { period: invoice.period, amount: peso(amount), due },
    html: (t, settings) =>
      newInvoiceEmail({
        propertyName: settings.propertyName,
        name: t.name,
        invoice,
        amountText: peso(amount),
        buttonUrl: process.env.APP_URL
          ? `${process.env.APP_URL}/tenant/billing`
          : "",
      }),
    link: "/tenant/billing",
  });
  res.status(201).json(invoice);
});

// POST /api/invoices/:id/pay   body: { method?: 'cash' | 'bank' | 'gcash' | 'other' }
// Staff records a payment taken outside the website (cash at the desk, bank transfer, ...)
router.post("/:id/pay", requireStaff("billing"), async (req, res) => {
  const method = req.body.method ?? "cash";
  if (!STAFF_METHODS.includes(method))
    throw new HttpError(400, "Choose how the payment was made");
  const paid = await settleInvoice({ _id: req.params.id }, method);
  if (paid) return res.json(paid);
  const exists = await Invoice.exists({ _id: req.params.id });
  throw new HttpError(
    exists ? 409 : 404,
    exists ? "Invoice is already paid" : "Invoice not found",
  );
});

export default router;
