import jwt from 'jsonwebtoken';
import Staff from '../models/Staff.js';
import Tenant from '../models/Tenant.js';

export const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

const readToken = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

// Sets req.user if a valid token is present, but never blocks the request
export const attachUser = (req, _res, next) => {
  const token = readToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      /* invalid or expired token → treated as logged out */
    }
  }
  next();
};

// Must be logged in
export const requireAuth = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Please sign in' });
  next();
};

// Must be staff, optionally with a specific permission.
// Permissions are re-read from the database, so changes apply immediately.
export const requireStaff = (perm) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Please sign in' });
  if (req.user.role !== 'staff') return res.status(403).json({ message: 'Staff only' });

  const staff = await Staff.findById(req.user.id).select('perms');
  if (!staff) return res.status(401).json({ message: 'Account no longer exists' });
  if (perm && !staff.perms.includes(perm))
    return res.status(403).json({ message: `Missing permission: ${perm}` });

  req.user.perms = staff.perms;
  next();
};

// Must be an active tenant
export const requireTenant = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Please sign in' });
  if (req.user.role !== 'tenant') return res.status(403).json({ message: 'Tenants only' });

  const tenant = await Tenant.findById(req.user.id).select('status');
  if (!tenant || tenant.status === 'inactive')
    return res.status(401).json({ message: 'This account is no longer active' });
  next();
};