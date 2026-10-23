import { Router } from 'express';
import Tenant from '../models/Tenant.js';
import { requireStaff, requireTenant } from '../middleware/auth.js';
import { setTenantRoom, HttpError } from '../services/housing.js';
import { attachBalances } from '../services/billing.js';
import Invoice from '../models/Invoice.js';
import { isDateStr } from '../utils/dates.js';
import { cancelPendingFor } from '../services/reservations.js';

const router = Router();

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

const emailTaken = async (email, exceptId) =>
  Tenant.exists({ email, ...(exceptId && { _id: { $ne: exceptId } }) });

const normEmail = (e) => String(e || '').trim().toLowerCase();

/* ================= tenant (self-service) =================
   Defined BEFORE '/:id' so "me" isn't treated as an id. */

// GET /api/tenants/me
router.get('/me', requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant) throw new HttpError(404, 'Account not found');
  res.json(await attachBalances(tenant));
});

// PUT /api/tenants/me   body: { name, email, phone, emergency }
router.put('/me', requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant) throw new HttpError(404, 'Account not found');

  const data = pick(req.body, ['name', 'phone', 'emergency']);
  if (req.body.email !== undefined) {
    const email = normEmail(req.body.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (await emailTaken(email, tenant._id)) throw new HttpError(409, 'That email is already in use');
    data.email = email;
  }
  tenant.set(data);
  await tenant.save();
  res.json(tenant);
});

// PUT /api/tenants/me/password   body: { current, next }
router.put('/me/password', requireTenant, async (req, res) => {
  const { current, next } = req.body;
  const tenant = await Tenant.findById(req.user.id).select('+password');
  if (!tenant || !(await tenant.checkPassword(current || '')))
    throw new HttpError(400, 'Current password is incorrect');
  if (!next || next.length < 4)
    throw new HttpError(400, 'New password must be at least 4 characters');
  tenant.password = next;
  await tenant.save();
  res.json({ message: 'Password updated' });
});


// POST /api/tenants/me/move-out   body: { date, reason, notes }
router.post('/me/move-out', requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant) throw new HttpError(404, 'Account not found');
  if (!tenant.room) throw new HttpError(400, 'You have no room to move out of');
  if (tenant.status === 'move-out-pending') throw new HttpError(409, 'You already have a pending move-out request');
  if (!isDateStr(req.body.date)) throw new HttpError(400, 'Choose your planned move-out date');

  tenant.status = 'move-out-pending';
  tenant.moveOut = { ...pick(req.body, ['date', 'reason', 'notes']), requestedAt: new Date() };
  await tenant.save();
  res.json(tenant);
});

// POST /api/tenants/me/move-out/cancel
router.post('/me/move-out/cancel', requireTenant, async (req, res) => {
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant) throw new HttpError(404, 'Account not found');
  if (tenant.status !== 'move-out-pending') throw new HttpError(409, 'You have no pending move-out request');
  tenant.status = 'active';
  tenant.moveOut = undefined;
  await tenant.save();
  res.json(tenant);
});

/* ================= staff (needs "tenants" permission) ================= */

// GET /api/tenants?q=&status=
router.get('/', requireStaff('tenants'), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  res.json(await attachBalances(await Tenant.find(filter).sort({ createdAt: 1 })));
});

router.get('/:id', requireStaff('tenants'), async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  res.json(await attachBalances(tenant));
});

// POST /api/tenants   body: { name, email, phone, room, password }
router.post('/', requireStaff('tenants'), async (req, res) => {
  const email = normEmail(req.body.email);
  const password = req.body.password || 'welcome123';
  if (!req.body.name?.trim() || !email) throw new HttpError(400, 'Name and email are required.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (password.length < 4) throw new HttpError(400, 'Password must be at least 4 characters.');
  if (await emailTaken(email)) throw new HttpError(409, 'That email is already in use');

  const tenant = new Tenant({
    name: req.body.name,
    email,
    password,
    ...pick(req.body, ['phone', 'emergency']),
  });
  await tenant.validate();
  await setTenantRoom(tenant, req.body.room);
  await tenant.save();
  res.status(201).json(tenant);
});

// PUT /api/tenants/:id   body: { name, email, phone, emergency, room }
router.put('/:id', requireStaff('tenants'), async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw new HttpError(404, 'Tenant not found');

  const data = pick(req.body, ['name', 'phone', 'emergency']);
  if (req.body.email !== undefined) {
    const email = normEmail(req.body.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (await emailTaken(email, tenant._id)) throw new HttpError(409, 'That email is already in use');
    data.email = email;
  }
  tenant.set(data);
  await tenant.validate();
  if ('room' in req.body) await setTenantRoom(tenant, req.body.room);
  await tenant.save();
  res.json(tenant);
});

// POST /api/tenants/:id/deactivate: frees their room
router.post('/:id/deactivate', requireStaff('tenants'), async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  await setTenantRoom(tenant, null);
  tenant.status = 'inactive';
  await tenant.save();
  res.json(tenant);
});

// POST /api/tenants/:id/move-out/complete   body: { force }: frees the room
router.post('/:id/move-out/complete', requireStaff('tenants'), async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  if (tenant.status !== 'move-out-pending') throw new HttpError(409, 'There is no pending move-out request');

  if (!req.body.force && (await Invoice.exists({ tenant: tenant._id, status: 'unpaid' })))
    throw new HttpError(409, 'This tenant still has unpaid invoices. Settle them, or complete anyway with force.');

  await cancelPendingFor(tenant._id);
  await setTenantRoom(tenant, null);
  tenant.status = 'active'; // keeps their login so they can see final invoices
  tenant.moveOut = undefined;
  await tenant.save();
  res.json(tenant);
});

// POST /api/tenants/:id/move-out/decline
router.post('/:id/move-out/decline', requireStaff('tenants'), async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  if (tenant.status !== 'move-out-pending') throw new HttpError(409, 'There is no pending move-out request');
  tenant.status = 'active';
  tenant.moveOut = undefined;
  await tenant.save();
  res.json(tenant);
});

// POST /api/tenants/:id/reactivate: does not restore a room; assign one separately
router.post('/:id/reactivate', requireStaff('tenants'), async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  tenant.status = 'active';
  await tenant.save();
  res.json(tenant);
});

export default router;