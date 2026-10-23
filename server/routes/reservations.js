import { Router } from 'express';
import Reservation, { LEASES } from '../models/Reservation.js';
import Room from '../models/Room.js';
import Tenant from '../models/Tenant.js';
import MoveIn from '../models/MoveIn.js';
import { nextSeq } from '../models/Counter.js';
import { requireStaff, requireTenant } from '../middleware/auth.js';
import { HttpError, setTenantRoom } from '../services/housing.js';
import { expireReservations, closeReservation } from '../services/reservations.js';
import { todayManila, isDateStr } from '../utils/dates.js';

const router = Router();
const withName = (q) => q.populate('tenant', 'name');

/* ---------- tenant ---------- */

// GET /api/reservations/mine
router.get('/mine', requireTenant, async (req, res) => {
  await expireReservations();
  res.json(await Reservation.find({ tenant: req.user.id }).sort({ createdAt: -1 }));
});

// POST /api/reservations   body: { room, date, lease, requests }
router.post('/', requireTenant, async (req, res) => {
  await expireReservations();

  const roomId = String(req.body.room || '').trim();
  const date = req.body.date;
  const lease = req.body.lease || '12 months';
  if (!roomId) throw new HttpError(400, 'Choose a room');
  if (!isDateStr(date) || date < todayManila())
    throw new HttpError(400, 'Choose a valid move-in date (today or later)');
  if (!LEASES.includes(lease)) throw new HttpError(400, 'Invalid lease length');

  const tenant = await Tenant.findById(req.user.id);
  if (!tenant) throw new HttpError(404, 'Account not found');
  if (tenant.room) throw new HttpError(409, 'You already have a room');
  if (await Reservation.exists({ tenant: tenant._id, status: 'pending' }))
    throw new HttpError(409, 'You already have a pending reservation');

  // atomic: only one person can ever win the room
  const room = await Room.findOneAndUpdate(
    { _id: roomId, status: 'available' },
    { status: 'reserved', tenant: tenant._id },
    { new: true }
  );
  if (!room) {
    const exists = await Room.exists({ _id: roomId });
    throw new HttpError(exists ? 409 : 404, exists ? 'That room is no longer available' : 'Room not found');
  }

  try {
    const seq = await nextSeq('reservation');
    const reservation = await Reservation.create({
      _id: 'RS-' + String(seq).padStart(4, '0'),
      tenant: tenant._id,
      room: roomId,
      moveInDate: date,
      lease,
      requests: String(req.body.requests || '').slice(0, 500),
    });
    res.status(201).json(reservation);
  } catch (err) {
    await Room.updateOne({ _id: roomId, status: 'reserved', tenant: tenant._id }, { status: 'available', tenant: null });
    throw err;
  }
});

// POST /api/reservations/mine/:id/cancel
router.post('/mine/:id/cancel', requireTenant, async (req, res) => {
  const r = await Reservation.findOne({ _id: req.params.id, tenant: req.user.id });
  if (!r) throw new HttpError(404, 'Reservation not found');
  const closed = await closeReservation(r, 'cancelled');
  if (!closed) throw new HttpError(409, `Reservation is already ${r.status}`);
  res.json(closed);
});

/* ---------- staff (needs "tenants" permission) ---------- */

// GET /api/reservations?status=pending
router.get('/', requireStaff('tenants'), async (req, res) => {
  await expireReservations();
  const filter = req.query.status ? { status: req.query.status } : {};
  const list = await withName(Reservation.find(filter).sort({ createdAt: -1 }));

  // lets staff see whether the tenant's move-in form has been approved
  const forms = await MoveIn.find({ tenant: { $in: list.map((r) => r.tenant?._id) } }).select('tenant status');
  const formStatus = new Map(forms.map((f) => [String(f.tenant), f.status]));

  res.json(list.map((r) => ({ ...r.toJSON(), moveInStatus: formStatus.get(String(r.tenant?._id)) ?? null })));
});

// POST /api/reservations/:id/approve: moves the tenant into the room
router.post('/:id/approve', requireStaff('tenants'), async (req, res) => {
  await expireReservations();
  const r = await Reservation.findById(req.params.id);
  if (!r) throw new HttpError(404, 'Reservation not found');
  if (r.status !== 'pending') throw new HttpError(409, `Reservation is ${r.status}`);

  const tenant = await Tenant.findById(r.tenant);
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  if (tenant.room) throw new HttpError(409, 'That tenant already has a room');

  // claim it first so a double-click can't approve twice
  const claimed = await Reservation.findOneAndUpdate(
    { _id: r._id, status: 'pending' },
    { status: 'approved', decidedAt: new Date() }
  );
  if (!claimed) throw new HttpError(409, 'Reservation was just updated by someone else');

  try {
    await setTenantRoom(tenant, r.room);
    tenant.moveIn = r.moveInDate;
    await tenant.save();
  } catch (err) {
    await Reservation.updateOne({ _id: r._id }, { status: 'pending', decidedAt: null }); // roll back
    throw err;
  }
  res.json(await withName(Reservation.findById(r._id)));
});

// POST /api/reservations/:id/decline
router.post('/:id/decline', requireStaff('tenants'), async (req, res) => {
  const r = await Reservation.findById(req.params.id);
  if (!r) throw new HttpError(404, 'Reservation not found');
  const closed = await closeReservation(r, 'declined');
  if (!closed) throw new HttpError(409, `Reservation is already ${r.status}`);
  res.json(await withName(Reservation.findById(r._id)));
});

export default router;