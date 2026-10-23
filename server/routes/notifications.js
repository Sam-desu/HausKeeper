import { Router } from 'express';
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Everything here is scoped to the signed-in person (tenant or staff): nobody can read someone else's.
const mine = (req) => ({ recipientType: req.user.role, recipient: req.user.id });

// GET /api/notifications → { unread, items: latest 30 }
router.get('/', requireAuth, async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find(mine(req)).sort({ createdAt: -1 }).limit(30),
    Notification.countDocuments({ ...mine(req), read: false }),
  ]);
  res.json({ unread, items });
});

// POST /api/notifications/read-all (defined before '/:id/read')
router.post('/read-all', requireAuth, async (req, res) => {
  await Notification.updateMany({ ...mine(req), read: false }, { read: true });
  res.json({ ok: true });
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireAuth, async (req, res) => {
  if (mongoose.isValidObjectId(req.params.id))
    await Notification.updateOne({ _id: req.params.id, ...mine(req) }, { read: true });
  res.json({ ok: true });
});

export default router;
