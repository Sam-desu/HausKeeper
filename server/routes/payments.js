import { Router } from 'express';
import Invoice from '../models/Invoice.js';
import Tenant from '../models/Tenant.js';
import { requireAuth, requireTenant } from '../middleware/auth.js';
import { HttpError } from '../services/housing.js';
import { settleInvoice } from '../services/billing.js';
import { paymongoEnabled, createCheckout, getCheckout, paidInfo, verifyWebhook } from '../services/paymongo.js';

const router = Router();

// Where PayMongo sends the tenant back to after paying (the Vite dev server by default)
const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

// GET /api/payments/config → lets the website say whether online payment is live
router.get('/config', requireAuth, (_req, res) => {
  res.json({ gateway: paymongoEnabled(), methods: paymongoEnabled() ? ['GCash', 'Maya', 'Card'] : [] });
});

// POST /api/payments/checkout/:id → { url } to send the tenant to PayMongo's payment page.
// With no PayMongo key configured it pays instantly (simulated) and returns { simulated: true }.
router.post('/checkout/:id', requireTenant, async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, tenant: req.user.id });
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  if (invoice.status === 'paid') throw new HttpError(409, 'Invoice is already paid');

  if (!paymongoEnabled()) {
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
  await Invoice.updateOne(
    { _id: invoice._id },
    { $push: { checkoutSessions: { $each: [session.id], $slice: -5 } } }
  );
  res.json({ url: session.url });
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
    const paid = await settleInvoice({ _id: invoice._id }, info.method);
    return res.json({ paid: true, invoice: paid || (await Invoice.findById(invoice._id)) });
  }
  res.json({ paid: false, invoice });
});

// POST /api/payments/webhook → PayMongo calls this by itself when a payment succeeds (no login).
// Needs a public URL and PAYMONGO_WEBHOOK_SECRET; the signature proves the call really came from PayMongo.
router.post('/webhook', async (req, res) => {
  if (!verifyWebhook(req.rawBody?.toString('utf8'), req.headers['paymongo-signature']))
    return res.status(400).json({ message: 'Bad signature' });

  const event = req.body?.data?.attributes;
  if (event?.type === 'checkout_session.payment.paid') {
    const session = event.data;
    const invoiceId = session?.attributes?.metadata?.invoice_id || session?.attributes?.reference_number;
    if (invoiceId) await settleInvoice({ _id: invoiceId }, paidInfo(session).method || null);
  }
  res.json({ received: true });
});

export default router;
