import { Router } from 'express';
import Tenant from '../models/Tenant.js';
import Staff from '../models/Staff.js';
import { signToken, requireAuth } from '../middleware/auth.js';


const router = Router();

const tokenFor = (role, user) =>
  signToken({
    id: user.id,
    role,
    perms: role === 'staff' ? user.perms : [],
  });

// POST /api/auth/login   body: { role: 'tenant' | 'staff', identifier, password }
router.post('/login', async (req, res) => {
  const { role, identifier, password } = req.body;
  if (!identifier || !password)
    return res.status(400).json({ message: 'Enter both fields.' });

  const id = String(identifier).trim().toLowerCase();
  const user =
    role === 'staff'
      ? await Staff.findOne({ username: id }).select('+password')
      : await Tenant.findOne({ email: id }).select('+password');

  // Same message for "no such user" and "wrong password" on purpose
  if (!user || !(await user.checkPassword(password)))
    return res.status(401).json({ message: 'Incorrect credentials.' });

  if (user.status === 'inactive')
    return res.status(403).json({ message: 'This account has been deactivated.' });

  const r = role === 'staff' ? 'staff' : 'tenant';
  res.json({ token: tokenFor(r, user), role: r, user });
});

// POST /api/auth/register   (tenant self-registration)
router.post('/register', async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const phone = (req.body.phone || '').trim();
  const { pass } = req.body;

  if (!name || !email || !pass)
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  if (!/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ message: 'Enter a valid email address.' });
  if (pass.length < 4)
    return res.status(400).json({ message: 'Password must be at least 4 characters.' });
  if (await Tenant.exists({ email }))
    return res.status(409).json({ message: 'An account with that email already exists.' });

  const tenant = await Tenant.create({ name, email, phone, password: pass });
  res.status(201).json({ token: tokenFor('tenant', tenant), role: 'tenant', user: tenant });
});

// GET /api/auth/me   → restores the session after a page refresh
router.get('/me', requireAuth, async (req, res) => {
  const { id, role } = req.user;
  const user = role === 'staff' ? await Staff.findById(id) : await Tenant.findById(id);
  if (!user || user.status === 'inactive')
    return res.status(401).json({ message: 'Account no longer active' });
  res.json({ role, user });
  
});

export default router;