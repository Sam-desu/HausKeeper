import { Router } from 'express';
import Invoice from '../models/Invoice.js';
import Tenant from '../models/Tenant.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { HttpError } from '../services/housing.js';
import { settleInvoice, settleMany } from '../services/billing.js';
import { refreshLateFee } from '../services/lateFees.js';
import {
  paymongoEnabled,
  createCheckout,
  createBulkCheckout,
  getCheckout,
  paidInfo,
  verifyWebhook,
} from '../services/paymongo.js';

const router = Router();

// Where PayMongo sends the tenant back to after paying (the Vite dev server by default)
const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

// Simulated (instant, free) payment is for development only. In production it needs an explicit opt-in.
const simulatedAllowed = () =>
  process.env.NODE_ENV !== 'production' || process.env.ALLOW_SIMULATED_PAYMENTS === 'true';

// GET /api/payments/config → lets the website say whether online payment is live
router.get('/config', requireAuth, (_req, res) => {
  res.json({ gateway: paymongoEnabled(), methods: paymongoEnabled() ? ['GCash', 'Maya', 'Card'] : [] });
});

// POST /api/payments/checkout/:id → { url } to send the tenant to PayMongo's payment page.
// With no PayMongo key configured it pays instantly (simulated, development only) and returns { simulated: true }.
router.post('/checkout/:id', requireTenant, async (req, res) => {
  let invoice = await Invoice.findOne({ _id: req.params.id, tenant: req.user.id });
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  if (invoice.status === 'paid') throw new HttpError(409, 'Invoice is already paid');

  // charge today's late fee, not the one from the last hourly run
  invoice = await refreshLateFee(invoice);
  if (invoice.status === 'paid') throw new HttpError(409, 'Invoice is already paid');

  if (!paymongoEnabled()) {
    if (!simulatedAllowed()) throw new HttpError(503, 'Online payment is not available right now. Please pay at the front desk.');
    const paid = await settleInvoice({ _id: invoice._id, tenant: req.user.id });
    return res.json({ simulated: true, invoice: paid || invoice });
  }

  const tenant = await Tenant.findById(req.user.id);
  const session = await createCheckout({
    invoice,
    tenant,
    successUrl: `${appUrl()}/tenant/billing?paid=${invoice.id}`,
    cancelUrl: `${appUrl()}/tenant/billing?cancelled=${invoice.id}`,
  });
  // remember what this checkout page charged, so a fee that grows afterwards can't make the payment fall short
  await Invoice.updateOne(
    { _id: invoice._id },
    {
      $push: { checkoutSessions: { $each: [session.id], $slice: -5 } },
      $set: { [`checkoutAmounts.${session.id}`]: invoice.amount },
    }
  );
  res.json({ url: session.url });
});

// POST /api/payments/checkout-all → pay every unpaid invoice (overdue included) in one go.
// One PayMongo session with one line item per invoice; the tenant gets a single combined receipt.
router.post('/checkout-all', requireTenant, async (req, res) => {
  let invoices = await Invoice.find({ tenant: req.user.id, status: 'unpaid' }).sort({ due: 1, _id: 1 });
  invoices = (await Promise.all(invoices.map(refreshLateFee))).filter((i) => i.status === 'unpaid');
  if (!invoices.length) throw new HttpError(409, 'You have no unpaid invoices');

  if (!paymongoEnabled()) {
    if (!simulatedAllowed())
      throw new HttpError(503, 'Online payment is not available right now. Please pay at the front desk.');
    const settled = await settleMany(
      invoices.map((i) => ({ _id: i._id, tenant: req.user.id }))
    );
    return res.json({ simulated: true, count: settled.length, invoices: settled });
  }

  const tenant = await Tenant.findById(req.user.id);
  const session = await createBulkCheckout({
    invoices,
    tenant,
    successUrl: `${appUrl()}/tenant/billing?paid=all`,
    cancelUrl: `${appUrl()}/tenant/billing?cancelled=all`,
  });
  await Invoice.bulkWrite(
    invoices.map((i) => ({
      updateOne: {
        filter: { _id: i._id },
        update: {
          $push: { checkoutSessions: { $each: [session.id], $slice: -5 } },
          $set: { [`checkoutAmounts.${session.id}`]: i.amount },
        },
      },
    }))
  );
  res.json({
    url: session.url,
    count: invoices.length,
    total: invoices.reduce((s, i) => s + i.amount, 0),
  });
});

// POST /api/payments/verify/:id → called when the tenant lands back on the site after paying.
// Asks PayMongo directly whether the invoice was paid, so it works even without the webhook (e.g. on localhost).
router.post('/verify/:id', requireTenant, async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, tenant: req.user.id });
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  if (invoice.status === 'paid') return res.json({ paid: true, invoice });
  if (!paymongoEnabled()) return res.json({ paid: false, invoice });

  // newest first; a tenant may have opened more than one checkout page
  for (const sessionId of [...invoice.checkoutSessions].reverse()) {
    const info = paidInfo(await getCheckout(sessionId));
    if (!info.paid) continue;
    const paid = await settleInvoice({ _id: invoice._id }, info.method, { sessionId });
    return res.json({ paid: true, invoice: paid || (await Invoice.findById(invoice._id)) });
  }
  res.json({ paid: false, invoice });
});

// POST /api/payments/verify-all → call when the tenant returns from PayMongo (?paid=all)
router.post('/verify-all', requireTenant, async (req, res) => {
  const unpaid = await Invoice.find({ tenant: req.user.id, status: 'unpaid' });
  if (paymongoEnabled()) {
    // each session id once, newest first
    const sessionIds = [...new Set(unpaid.flatMap((i) => [...i.checkoutSessions].reverse()))];
    for (const sessionId of sessionIds) {
      const info = paidInfo(await getCheckout(sessionId));
      if (!info.paid) continue;
      const covered = unpaid.filter((i) => i.checkoutSessions.includes(sessionId));
      await settleMany(
        covered.map((i) => ({ _id: i._id, tenant: req.user.id })),
        info.method,
        { sessionId }
      );
    }
  }
  const remaining = await Invoice.countDocuments({ tenant: req.user.id, status: 'unpaid' });
  res.json({ paid: remaining < unpaid.length, settled: unpaid.length - remaining, remaining });
});

// POST /api/payments/webhook → PayMongo calls this by itself when a payment succeeds (no login).
// Needs a public URL and PAYMONGO_WEBHOOK_SECRET; the signature proves the call really came from PayMongo.
router.post('/webhook', async (req, res) => {
  if (!verifyWebhook(req.rawBody?.toString('utf8'), req.headers['paymongo-signature']))
    return res.status(400).json({ message: 'Bad signature' });

  const event = req.body?.data?.attributes;
  if (event?.type === 'checkout_session.payment.paid') {
    const session = event.data;
    const method = paidInfo(session).method || null;
    const attrs = session?.attributes;

    if (attrs?.metadata?.bulk === 'true') {
      // a "pay all" session: settle every invoice that was in it
      const invoices = await Invoice.find({ checkoutSessions: session.id, status: 'unpaid' }).select('_id');
      await settleMany(invoices.map((i) => ({ _id: i._id })), method, { sessionId: session.id });
    } else {
      const invoiceId = attrs?.metadata?.invoice_id || attrs?.reference_number;
      if (invoiceId) await settleInvoice({ _id: invoiceId }, method, { sessionId: session.id });
    }
  }
  res.json({ received: true });
});

export default router;
