import { Router } from 'express';
import Room from '../models/Room.js';
import { attachUser, requireStaff } from '../middleware/auth.js';
import { expireReservations } from '../services/reservations.js';
import Tenant from '../models/Tenant.js';

const router = Router();
router.use(attachUser);

const EDITABLE = ['floor', 'type', 'beds', 'price', 'status', 'amenities', 'notes'];
const MANUAL_STATUSES = ['available', 'maintenance']; // occupied/reserved are set by tenant assignments
const LOCKED = ['occupied', 'reserved'];

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
const isStaff = (req) => req.user?.role === 'staff';

// GET /api/rooms: public, but only staff see who lives in each room
router.get('/', async (req, res) => {
  await expireReservations();
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  const query = Room.find(filter).sort({ _id: 1 });

  if (!isStaff(req)) {
    query.select('-tenant');
    return res.json(await query);
  }

  const rooms = await query;
  const ids = rooms.map((r) => r.tenant).filter(Boolean);
  const names = new Map(
    (await Tenant.find({ _id: { $in: ids } }).select('name')).map((t) => [String(t._id), t.name])
  );
  res.json(rooms.map((r) => ({ ...r.toJSON(), tenantName: r.tenant ? names.get(String(r.tenant)) ?? null : null })));
});

router.get('/:id', async (req, res) => {
  await expireReservations();
  const query = Room.findById(req.params.id);
  if (!isStaff(req)) query.select('-tenant');
  const room = await query;
  if (!room) return res.status(404).json({ message: 'Room not found' });
  res.json(room);
});

router.post('/', requireStaff('rooms'), async (req, res) => {
  const id = (req.body.id || '').trim();
  if (!id) return res.status(400).json({ message: 'Room number is required' });
  if (req.body.status !== undefined && !MANUAL_STATUSES.includes(req.body.status))
    return res.status(400).json({ message: 'A new room can only be Available or Maintenance' });
  const room = await Room.create({ _id: id, ...pick(req.body, EDITABLE) });
  res.status(201).json(room);
});

router.put('/:id', requireStaff('rooms'), async (req, res) => {
  const current = await Room.findById(req.params.id);
  if (!current) return res.status(404).json({ message: 'Room not found' });

  const data = pick(req.body, EDITABLE);
  if (data.status !== undefined && data.status !== current.status) {
    if (LOCKED.includes(current.status))
      return res.status(409).json({ message: `This room is ${current.status}. Its status changes when the tenant is moved out or the reservation ends.` });
    if (!MANUAL_STATUSES.includes(data.status))
      return res.status(409).json({ message: 'Occupied and reserved are set automatically when a tenant is assigned' });
  }

  const room = await Room.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  res.json(room);
});

router.delete('/:id', requireStaff('rooms'), async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) return res.status(404).json({ message: 'Room not found' });
  if (LOCKED.includes(room.status))
    return res.status(409).json({ message: `Cannot delete a room that is ${room.status}` });
  await room.deleteOne();
  res.json({ message: 'Room deleted' });
});

export default router;