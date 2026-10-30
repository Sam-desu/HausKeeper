import { Router } from 'express';
import mongoose from 'mongoose';
import { requireStaff, requireTenant } from '../middleware/auth.js';
import { HttpError } from '../services/housing.js';
import RoomLayout from '../models/RoomLayout.js';
import Tenant from '../models/Tenant.js';
import Room from '../models/Room.js';

const router = Router();
// /mine is for active tenants only (requireTenant checks token, role and account status);
// the staff routes at the bottom are for staff with the "rooms" permission.

// Keep these in sync with CATALOG (width x height in grid cells) and FLOORS in RoomDesigner.jsx
const ITEM_SIZES = {
  router: [1, 1], tv: [2, 1], aircon: [2, 1], fan: [1, 1], fridge: [1, 1], lamp: [1, 1],
  'bed-single': [2, 4], 'bed-double': [3, 4], desk: [3, 1], chair: [1, 1], wardrobe: [2, 1],
  shelf: [2, 1], sofa: [4, 2], table: [2, 2], rug: [4, 3], plant: [1, 1],
};
const FLOORS = new Set(['oak', 'walnut', 'tile', 'concrete', 'carpet']);
const MAX_ITEMS = 60;

// The designer grid is fixed by the type of room the tenant rented (1 cell = 0.5 m).
// The tenant cannot choose it, and anything sent by the browser is ignored.
const ROOM_SIZES = {
  Single: { cols: 8, rows: 6 }, // 4 x 3 m
  Double: { cols: 10, rows: 8 }, // 5 x 4 m
  Suite: { cols: 14, rows: 10 }, // 7 x 5 m
};
const sizeFor = (type) => ROOM_SIZES[type] || ROOM_SIZES.Double;

const int = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

// Never trust the client: whitelist types, clamp numbers, cap the list, keep every item inside the room
const clean = (body = {}, { cols, rows }) => ({
  cols,
  rows,
  floor: FLOORS.has(body.floor) ? body.floor : 'oak',
  items: (Array.isArray(body.items) ? body.items : [])
    .filter((i) => i && ITEM_SIZES[i.type])
    .slice(0, MAX_ITEMS)
    .map((i) => {
      const rot = i.rot === 90 ? 90 : 0;
      const [w, h] = rot === 90 ? [...ITEM_SIZES[i.type]].reverse() : ITEM_SIZES[i.type];
      return {
        id: String(i.id || '').slice(0, 40) || `i${Math.random().toString(36).slice(2, 10)}`,
        type: i.type,
        x: int(i.x, 0, Math.max(0, cols - w), 0),
        y: int(i.y, 0, Math.max(0, rows - h), 0),
        rot,
      };
    }),
});

// the room size always comes from the room type, even for layouts saved before sizes were fixed
const publicShape = (d, size) => ({ cols: size.cols, rows: size.rows, floor: d.floor, items: d.items });

const NO_ROOM = 'You need to rent a room before you can design it. Reserve one first, and the designer unlocks once it is assigned to you.';

// The room the tenant currently has ({ id, type, cols, rows }), or null.
// The JWT only carries id/role, so read it from the tenant record.
async function currentRoom(req) {
  const tenant = await Tenant.findById(req.user.id).select('room');
  if (!tenant?.room) return null;
  const room = await Room.findById(tenant.room).select('type');
  return { id: tenant.room, type: room?.type || null, ...sizeFor(room?.type) };
}

// GET /room-layouts/mine → { room: { id, type, cols, rows }, layout }
// layout is null if the tenant hasn't saved one for their current room yet
router.get('/mine', requireTenant, async (req, res) => {
  try {
    const room = await currentRoom(req);
    if (!room) return res.status(403).json({ message: NO_ROOM });
    const doc = await RoomLayout.findOne({ tenant: req.user.id }).lean();
    // a layout belongs to the room it was made for; after moving to another room, start fresh
    res.json({ room, layout: doc && doc.room === room.id ? publicShape(doc, room) : null });
  } catch (err) {
    res.status(500).json({ message: 'Could not load your room layout' });
  }
});

// PUT /room-layouts/mine → create or replace the tenant's layout
router.put('/mine', requireTenant, async (req, res) => {
  try {
    const room = await currentRoom(req);
    if (!room) return res.status(403).json({ message: NO_ROOM });
    const doc = await RoomLayout.findOneAndUpdate(
      { tenant: req.user.id },
      { $set: { ...clean(req.body, room), room: room.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json(publicShape(doc, room));
  } catch (err) {
    res.status(500).json({ message: 'Could not save your room layout' });
  }
});

/* ---------- staff: see the rooms tenants have designed ---------- */

// GET /room-layouts → every saved layout for a room the tenant still has, newest first
router.get('/', requireStaff('rooms'), async (_req, res) => {
  const docs = await RoomLayout.find().sort({ updatedAt: -1 }).limit(300).lean();
  const tenants = await Tenant.find({ _id: { $in: docs.map((d) => d.tenant) } }).select('name room status');
  const byId = new Map(tenants.map((t) => [String(t._id), t]));
  res.json(
    docs
      .map((d) => ({ d, t: byId.get(String(d.tenant)) }))
      .filter(({ d, t }) => t && t.room && t.room === d.room) // skip layouts of rooms the tenant has left
      .map(({ d, t }) => ({
        tenant: String(t._id),
        tenantName: t.name,
        room: d.room,
        items: d.items.length,
        updatedAt: d.updatedAt,
      }))
  );
});

// GET /room-layouts/tenant/:tenantId → { tenant, layout, updatedAt }
router.get('/tenant/:tenantId', requireStaff('rooms'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.tenantId)) throw new HttpError(400, 'Invalid tenant');
  const [tenant, doc] = await Promise.all([
    Tenant.findById(req.params.tenantId).select('name room'),
    RoomLayout.findOne({ tenant: req.params.tenantId }).lean(),
  ]);
  if (!tenant || !doc || !tenant.room || doc.room !== tenant.room)
    throw new HttpError(404, 'This tenant has not saved a layout for their current room.');
  const room = await Room.findById(tenant.room).select('type');
  res.json({
    tenant: { id: tenant.id, name: tenant.name, room: tenant.room, roomType: room?.type || null },
    layout: publicShape(doc, sizeFor(room?.type)),
    updatedAt: doc.updatedAt,
  });
});

export default router;
