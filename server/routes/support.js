import { Router } from 'express';
import mongoose from 'mongoose';
import SupportMessage from '../models/SupportMessage.js';
import { nextSeq } from '../models/Counter.js';
import Notification from '../models/Notification.js';
import Tenant from '../models/Tenant.js';
import Staff from '../models/Staff.js';
import { requireAuth, requireStaff, requireTenant } from '../middleware/auth.js';
import { HttpError } from '../services/housing.js';
import { notifyTenant } from '../services/notify.js';

const router = Router();

const MAX_CHARS = 1000;
const LIMIT = 30; // messages per tenant...
const WINDOW_MS = 10 * 60 * 1000; // ...per 10 minutes
const hits = new Map(); // tenantId → timestamps (in memory; resets on restart)

function rateLimit(id) {
  const now = Date.now();
  const recent = (hits.get(id) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) throw new HttpError(429, 'You are sending messages too fast. Please wait a few minutes.');
  recent.push(now);
  hits.set(id, recent);
}

const readText = (body) => {
  const text = String(body?.text ?? '').trim();
  if (!text) throw new HttpError(400, 'Please type a message.');
  if (text.length > MAX_CHARS) throw new HttpError(400, `Messages can be up to ${MAX_CHARS} characters.`);
  return text;
};

const checkId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid tenant');
};

// Support is open to every staff account, so notify all of them (in-app bell only).
async function notifyAllStaff(opts) {
  try {
    const staff = await Staff.find().select('_id');
    if (!staff.length) return;
    await Notification.insertMany(
      staff.map((s) => ({
        recipientType: 'staff',
        recipient: s._id,
        type: 'support',
        title: opts.title,
        body: opts.message || '',
        link: opts.link || '',
      }))
    );
  } catch (err) {
    console.error('[support] staff notification failed:', err.message);
  }
}

const ORDER = { seq: 1, createdAt: 1, _id: 1 };
// the newest 300 messages of a conversation, oldest first
const conversation = async (tenantId) =>
  (await SupportMessage.find({ tenant: tenantId }).sort({ seq: -1, createdAt: -1, _id: -1 }).limit(300)).reverse();

const preview = (t) => (t.length > 80 ? t.slice(0, 77) + '…' : t);

// GET /api/support/unread → { unread }: drives the badge on the chat bubble.
// Tenant: unread staff replies in their own chat. Staff: unread tenant messages across all chats.
router.get(
  '/unread',
  requireAuth,
  (req, res, next) => (req.user.role === 'staff' ? requireStaff() : requireTenant)(req, res, next),
  async (req, res) => {
    const unread =
      req.user.role === 'staff'
        ? await SupportMessage.countDocuments({ from: 'tenant', read: false })
        : await SupportMessage.countDocuments({ tenant: req.user.id, from: 'staff', read: false });
    res.json({ unread });
  }
);

/* ---------- tenant: their own conversation ---------- */

// GET /api/support/mine → { messages } (also marks the staff replies as read)
router.get('/mine', requireTenant, async (req, res) => {
  await SupportMessage.updateMany({ tenant: req.user.id, from: 'staff', read: false }, { read: true });
  const messages = await conversation(req.user.id);
  res.json({ messages });
});

// POST /api/support/mine   body: { text }
router.post('/mine', requireTenant, async (req, res) => {
  const text = readText(req.body);
  rateLimit(String(req.user.id));

  const tenant = await Tenant.findById(req.user.id).select('name room');
  if (!tenant) throw new HttpError(404, 'Account not found');

  // only ping staff when this starts a new unread run, so a burst of messages is one notification
  const alreadyPending = await SupportMessage.exists({ tenant: tenant._id, from: 'tenant', read: false });
  const message = await SupportMessage.create({ tenant: tenant._id, from: 'tenant', text, seq: await nextSeq('support') });
  if (!alreadyPending)
    notifyAllStaff({
      title: `New support message from ${tenant.name}`,
      message: `${tenant.room ? `Room ${tenant.room}: ` : ''}${preview(text)}`,
      link: `/admin/support?tenant=${tenant._id}`,
    });
  res.status(201).json(message);
});

/* ---------- staff: any account can read and reply ---------- */

// GET /api/support/threads → conversations, newest activity first, with unread counts
router.get('/threads', requireStaff(), async (_req, res) => {
  const rows = await SupportMessage.aggregate([
    { $sort: ORDER },
    {
      $group: {
        _id: '$tenant',
        last: { $last: '$$ROOT' },
        unread: { $sum: { $cond: [{ $and: [{ $eq: ['$from', 'tenant'] }, { $eq: ['$read', false] }] }, 1, 0] } },
      },
    },
    { $sort: { 'last.createdAt': -1 } },
    { $limit: 200 },
  ]);
  const tenants = await Tenant.find({ _id: { $in: rows.map((r) => r._id) } }).select('name room status');
  const byId = new Map(tenants.map((t) => [String(t._id), t]));

  res.json(
    rows.map((r) => {
      const t = byId.get(String(r._id));
      return {
        tenant: String(r._id),
        tenantName: t?.name || 'Unknown tenant',
        room: t?.room || null,
        inactive: t?.status === 'inactive',
        unread: r.unread,
        lastText: r.last.text,
        lastFrom: r.last.from,
        lastAt: r.last.createdAt,
      };
    })
  );
});

// GET /api/support/threads/:tenantId → { tenant, messages } (marks the tenant's messages as read)
router.get('/threads/:tenantId', requireStaff(), async (req, res) => {
  checkId(req.params.tenantId);
  const tenant = await Tenant.findById(req.params.tenantId).select('name room status');
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  await SupportMessage.updateMany({ tenant: tenant._id, from: 'tenant', read: false }, { read: true });
  const messages = await conversation(tenant._id);
  res.json({
    tenant: { id: tenant.id, name: tenant.name, room: tenant.room, status: tenant.status },
    messages,
  });
});

// POST /api/support/threads/:tenantId   body: { text }
router.post('/threads/:tenantId', requireStaff(), async (req, res) => {
  checkId(req.params.tenantId);
  const text = readText(req.body);

  const [tenant, staff] = await Promise.all([
    Tenant.findById(req.params.tenantId).select('_id'),
    Staff.findById(req.user.id).select('name'),
  ]);
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  if (!staff) throw new HttpError(401, 'Account no longer exists');

  const alreadyPending = await SupportMessage.exists({ tenant: tenant._id, from: 'staff', read: false });
  const message = await SupportMessage.create({
    tenant: tenant._id,
    from: 'staff',
    staff: staff._id,
    staffName: staff.name,
    text,
    seq: await nextSeq('support'),
  });
  if (!alreadyPending)
    notifyTenant(tenant._id, {
      type: 'support',
      title: 'New reply from support',
      message: `${staff.name}: ${preview(text)}`,
      link: '/tenant/support',
    });
  res.status(201).json(message);
});

export default router;
