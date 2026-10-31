import { Router } from 'express';
import mongoose from 'mongoose';
import Room from '../models/Room.js';
import Hallway from '../models/Hallway.js';
import { requireStaff } from '../middleware/auth.js';
import { HttpError } from '../services/housing.js';
import { expireReservations } from '../services/reservations.js';

const router = Router();

const MAX_COORD = 5000;
const MAX_CORNERS = 50;
const hasPlan = { 'plan.0': { $exists: true } };

const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
// true when the segments a-b and c-d cross each other (touching at an end doesn't count)
const properCross = (a, b, c, d) =>
  orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;

function validatePoints(p, label = 'room') {
  if (!Array.isArray(p) || p.length % 2 !== 0)
    throw new HttpError(400, 'Send the outline as a list of x, y pairs');
  if (p.length < 6) throw new HttpError(400, `A ${label} needs at least 3 corners`);
  if (p.length > MAX_CORNERS * 2) throw new HttpError(400, `A ${label} can have at most ${MAX_CORNERS} corners`);
  if (!p.every((n) => Number.isFinite(n) && n >= 0 && n <= MAX_COORD))
    throw new HttpError(400, `Coordinates must be numbers between 0 and ${MAX_COORD}`);

  const pts = [];
  for (let i = 0; i < p.length; i += 2) pts.push([Math.round(p[i] * 10) / 10, Math.round(p[i + 1] * 10) / 10]);
  const n = pts.length;

  let area = 0;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  });
  if (Math.abs(area) / 2 < 100) throw new HttpError(400, `That outline is too small or flat to be a ${label}`);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // neighbouring edges share a corner
      if (properCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]))
        throw new HttpError(400, 'The outline crosses itself. Redraw it without crossing lines');
    }
  }
  return pts.flat();
}

// GET /api/map?floor=1: public. Rooms that have an outline, with their LIVE status.
router.get('/', async (req, res) => {
  await expireReservations();
  const filter = { ...hasPlan };
  if (req.query.floor) {
    const floor = Number(req.query.floor);
    if (!Number.isInteger(floor)) throw new HttpError(400, 'Invalid floor');
    filter.floor = floor;
  }
  const [rooms, roomFloors, hallways, hallwayFloors] = await Promise.all([
    Room.find(filter).select('-tenant -notes -amenities').sort({ _id: 1 }),
    Room.distinct('floor'),
    Hallway.find(filter.floor === undefined ? {} : { floor: filter.floor }).sort({ createdAt: 1 }),
    Hallway.distinct('floor'),
  ]);
  const floors = [...new Set([...roomFloors, ...hallwayFloors])].sort((a, b) => a - b);
  res.json({ floors, rooms, hallways });
});

const cleanName = (v) => {
  const name = String(v ?? '').trim().slice(0, 40);
  return name || 'Hallway';
};
const hallwayId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Hallway not found');
  return id;
};

// Hallways live under /api/map/hallways. These routes are declared before /:id so the word
// "hallways" is never mistaken for a room id.

// POST /api/map/hallways   body: { floor, name?, points }
router.post('/hallways', requireStaff('rooms'), async (req, res) => {
  const floor = Number(req.body.floor);
  if (!Number.isInteger(floor) || floor < 0) throw new HttpError(400, 'Invalid floor');
  const plan = validatePoints(req.body.points, 'hallway');
  const hallway = await Hallway.create({ floor, name: cleanName(req.body.name), plan });
  res.status(201).json(hallway);
});

// PUT /api/map/hallways/:id   body: { points?, name? }
router.put('/hallways/:id', requireStaff('rooms'), async (req, res) => {
  const update = {};
  if (req.body.points !== undefined) update.plan = validatePoints(req.body.points, 'hallway');
  if (req.body.name !== undefined) update.name = cleanName(req.body.name);
  if (!Object.keys(update).length) throw new HttpError(400, 'Nothing to update');
  const hallway = await Hallway.findByIdAndUpdate(hallwayId(req.params.id), update, { new: true });
  if (!hallway) throw new HttpError(404, 'Hallway not found');
  res.json(hallway);
});

// DELETE /api/map/hallways/:id
router.delete('/hallways/:id', requireStaff('rooms'), async (req, res) => {
  const hallway = await Hallway.findByIdAndDelete(hallwayId(req.params.id));
  if (!hallway) throw new HttpError(404, 'Hallway not found');
  res.json({ ok: true });
});

// PUT /api/map/:id   body: { points: [x1, y1, x2, y2, ...] }
router.put('/:id', requireStaff('rooms'), async (req, res) => {
  const points = validatePoints(req.body.points);
  const room = await Room.findByIdAndUpdate(req.params.id, { plan: points }, { new: true });
  if (!room) throw new HttpError(404, 'Room not found');
  res.json(room);
});

// DELETE /api/map/:id: removes the outline only, never the room
router.delete('/:id', requireStaff('rooms'), async (req, res) => {
  const room = await Room.findByIdAndUpdate(req.params.id, { $unset: { plan: 1 } }, { new: true });
  if (!room) throw new HttpError(404, 'Room not found');
  res.json(room);
});

export default router;