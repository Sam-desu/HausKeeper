import { Router } from 'express';
import Staff, { PERMISSIONS } from '../models/Staff.js';
import { requireStaff } from '../middleware/auth.js';
import { HttpError } from '../services/housing.js';

const router = Router();
router.use(requireStaff('staff')); // everything here needs the "staff" permission

const USERNAME_RX = /^[a-z0-9._-]{3,30}$/;

function checkPerms(perms) {
  if (!Array.isArray(perms) || perms.some((p) => !PERMISSIONS.includes(p)))
    throw new HttpError(400, 'Unknown permission');
  return [...new Set(perms)];
}

// GET /api/staff
router.get('/', async (_req, res) => {
  res.json(await Staff.find().sort({ createdAt: 1 }));
});

// POST /api/staff   body: { name, role, username, password, perms }
router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim();
  const username = (req.body.username || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!name) throw new HttpError(400, 'Name is required');
  if (!USERNAME_RX.test(username))
    throw new HttpError(400, 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  const perms = checkPerms(req.body.perms ?? []);
  if (await Staff.exists({ username })) throw new HttpError(409, 'That username is already taken');

  const staff = await Staff.create({
    name,
    role: (req.body.role || '').trim(),
    username,
    password,
    perms,
  });
  res.status(201).json(staff);
});

// PUT /api/staff/:id   body: any of { name, role, perms, password }
// (username is intentionally not editable)
router.put('/:id', async (req, res) => {
  const staff = await Staff.findById(req.params.id);
  if (!staff) throw new HttpError(404, 'Staff member not found');

  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw new HttpError(400, 'Name is required');
    staff.name = name;
  }
  if (req.body.role !== undefined) staff.role = String(req.body.role).trim();

  if (req.body.perms !== undefined) {
    const perms = checkPerms(req.body.perms);
    // never allow the last "staff" admin to lock everyone out
    if (staff.perms.includes('staff') && !perms.includes('staff')) {
      const others = await Staff.countDocuments({ perms: 'staff', _id: { $ne: staff._id } });
      if (!others)
        throw new HttpError(409, 'At least one account must keep the "staff" permission');
    }
    staff.perms = perms;
  }

  if (req.body.password !== undefined) {
    if (String(req.body.password).length < 6)
      throw new HttpError(400, 'Password must be at least 6 characters');
    staff.password = req.body.password; // hashed by the model's save hook
  }

  await staff.save();
  res.json(staff);
});

export default router;