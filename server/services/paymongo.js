import crypto from 'node:crypto';
import { HttpError } from './housing.js';

// PayMongo Checkout Sessions: https://developers.paymongo.com
// The tenant is sent to PayMongo's hosted page and can pay by GCash, Maya or card.
// Leave PAYMONGO_SECRET_KEY empty in .env and the app falls back to the old simulated payment.

const BASE = 'https://api.paymongo.com/v1';
export const METHODS = ['gcash', 'paymaya', 'card'];

export const paymongoEnabled = () => !!process.env.PAYMONGO_SECRET_KEY;

const authHeader = () =>
  'Basic ' + Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64');

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new HttpError(502, 'Could not reach PayMongo. Please try again.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.errors?.[0]?.detail || 'PayMongo rejected the request';
    throw new HttpError(502, detail);
  }
  return json.data;
}

// Returns { id, url }. Amount is converted to centavos.
export async function createCheckout({ invoice, tenant, successUrl, cancelUrl }) {
  const label = invoice.kind === 'maintenance' ? 'Repair charge' : 'Rent';
  const name = `${label} · ${invoice.period}`.slice(0, 120);
  const data = await call('POST', '/checkout_sessions', {
    data: {
      attributes: {
        billing: { name: tenant.name, email: tenant.email },
        line_items: [
          {
            currency: 'PHP',
            amount: Math.round(invoice.amount * 100),
            name,
            quantity: 1,
            description: `Invoice ${invoice.id} · Room ${invoice.room}`,
          },
        ],
        payment_method_types: METHODS,
        description: `Invoice ${invoice.id}`,
        reference_number: invoice.id,
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { invoice_id: invoice.id },
      },
    },
  });
  return { id: data.id, url: data.attributes.checkout_url };
}

export const getCheckout = (id) => call('GET', `/checkout_sessions/${encodeURIComponent(id)}`);

// Reads a checkout session and says whether it was paid and with what.
export function paidInfo(session) {
  const a = session?.attributes || {};
  const payment = (a.payments || []).find((p) => p?.attributes?.status === 'paid');
  const intentOk = a.payment_intent?.attributes?.status === 'succeeded';
  if (!payment && !intentOk) return { paid: false };
  const method = a.payment_method_used || payment?.attributes?.source?.type || null;
  return { paid: true, method, paymentId: payment?.id || null };
}

// Checks the Paymongo-Signature header: "t=...,te=...,li=..."  (HMAC-SHA256 of `${t}.${rawBody}`)
export function verifyWebhook(rawBody, header) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret || !header || !rawBody) return false;
  const parts = Object.fromEntries(
    String(header)
      .split(',')
      .map((kv) => kv.trim().split('='))
      .filter((p) => p.length === 2)
  );
  if (!parts.t) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const eq = (a) =>
    !!a && a.length === expected.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(expected));
  return eq(parts.te) || eq(parts.li);
}

const lineItem = (invoice) => {
  const label = invoice.kind === 'maintenance' ? 'Repair charge' : 'Rent';
  return {
    currency: 'PHP',
    amount: Math.round(invoice.amount * 100),
    name: `${label} · ${invoice.period}`.slice(0, 120),
    quantity: 1,
    description: `Invoice ${invoice.id} · Room ${invoice.room}`,
  };
};

// One checkout session covering several invoices. Returns { id, url }.
export async function createBulkCheckout({ invoices, tenant, successUrl, cancelUrl }) {
  const data = await call('POST', '/checkout_sessions', {
    data: {
      attributes: {
        billing: { name: tenant.name, email: tenant.email },
        line_items: invoices.map(lineItem),
        payment_method_types: METHODS,
        description: `${invoices.length} invoices`,
        reference_number: `BULK-${Date.now()}`,
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { bulk: 'true', tenant_id: String(tenant._id) },
      },
    },
  });
  return { id: data.id, url: data.attributes.checkout_url };
}