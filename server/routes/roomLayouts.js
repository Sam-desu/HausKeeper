import { Router } from 'express';
import { requireTenant } from '../middleware/auth.js';
import RoomLayout from '../models/RoomLayout.js';
import Tenant from '../models/Tenant.js';

const router = Router();

// Active tenants only. requireTenant already checks the token, role and account status.
router.use(requireTenant);

// Keep these in sync with CATALOG and FLOORS in RoomDesigner.jsx
const ITEM_TYPES = new Set([
  'router', 'tv', 'aircon', 'fan', 'fridge', 'lamp',
  'bed-single', 'bed-double', 'desk', 'chair', 'wardrobe', 'shelf', 'sofa', 'table',
  'rug', 'plant',
]);
const FLOORS = new Set(['oak', 'walnut', 'tile', 'concrete', 'carpet']);
const MAX_ITEMS = 60;

const int = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

// Never trust the client: whitelist types, clamp numbers, cap the list
const clean = (body = {}) => ({
  cols: int(body.cols, 6, 20, 10),
  rows: int(body.rows, 6, 20, 8),
  floor: FLOORS.has(body.floor) ? body.floor : 'oak',
  items: (Array.isArray(body.items) ? body.items : [])
    .filter((i) => i && ITEM_TYPES.has(i.type))
    .slice(0, MAX_ITEMS)
    .map((i) => ({
      id: String(i.id || '').slice(0, 40) || `i${Math.random().toString(36).slice(2, 10)}`,
      type: i.type,
      x: int(i.x, 0, 19, 0),
      y: int(i.y, 0, 19, 0),
      rot: i.rot === 90 ? 90 : 0,
    })),
});

const publicShape = (d) => ({ cols: d.cols, rows: d.rows, floor: d.floor, items: d.items });

// GET /room-layouts/mine → saved layout, or null if the tenant hasn't saved one yet
router.get('/mine', async (req, res) => {
  try {
    const doc = await RoomLayout.findOne({ tenant: req.user.id }).lean();
    res.json(doc ? publicShape(doc) : null);
  } catch (err) {
    res.status(500).json({ message: 'Could not load your room layout' });
  }
});

// PUT /room-layouts/mine → create or replace the tenant's layout
router.put('/mine', async (req, res) => {
  try {
    // the JWT only carries id/role, so read the room from the tenant record
    const tenant = await Tenant.findById(req.user.id).select('room');
    const doc = await RoomLayout.findOneAndUpdate(
      { tenant: req.user.id },
      { $set: { ...clean(req.body), room: tenant?.room } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json(publicShape(doc));
  } catch (err) {
    res.status(500).json({ message: 'Could not save your room layout' });
  }
});

export default router;
