import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import MoveIn from '../models/MoveIn.js';
import Tenant from '../models/Tenant.js';
import { requireStaff, requireTenant } from '../middleware/auth.js';
import { HttpError } from '../services/housing.js';
import { todayManila, isDateStr } from '../utils/dates.js';

const router = Router();
const UPLOAD_DIR = path.join(import.meta.dirname, '..', 'uploads');

// kept in memory so the contents can be checked BEFORE anything touches the disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20 },
});

// Identify the file by its first bytes, never by the name or type the browser claims
function detectType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return { ext: 'png', mime: 'image/png' };
  if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF')
    return { ext: 'pdf', mime: 'application/pdf' };
  return null;
}

const FIELDS = ['legalName', 'dob', 'email', 'phone', 'govId', 'emergencyName', 'emergencyRelationship', 'emergencyPhone'];
const withName = (q) => q.populate('tenant', 'name');

/* ---------- tenant ---------- */

// GET /api/move-in/mine   → the form, or null if not submitted yet
router.get('/mine', requireTenant, async (req, res) => {
  res.json(await MoveIn.findOne({ tenant: req.user.id }));
});

// PUT /api/move-in/mine   multipart/form-data: text fields + optional file field "idFile"
router.put('/mine', requireTenant, upload.single('idFile'), async (req, res) => {
  const tenant = await Tenant.findById(req.user.id);
  if (!tenant) throw new HttpError(404, 'Account not found');

  const f = Object.fromEntries(FIELDS.map((k) => [k, String(req.body[k] ?? '').trim()]));
  f.email = (f.email || tenant.email).toLowerCase();
  f.phone = f.phone || tenant.phone;

  if (req.body.agreed !== 'true') throw new HttpError(400, 'You must agree to the house rules and lease terms');
  for (const [key, label] of [
    ['legalName', 'Full legal name'],
    ['govId', 'Government ID'],
    ['emergencyName', 'Emergency contact name'],
    ['emergencyPhone', 'Emergency contact phone'],
  ]) {
    if (!f[key]) throw new HttpError(400, `${label} is required`);
  }
  if (!isDateStr(f.dob) || f.dob < '1900-01-01' || f.dob >= todayManila())
    throw new HttpError(400, 'Enter a valid date of birth');
  if (!/^\S+@\S+\.\S+$/.test(f.email)) throw new HttpError(400, 'Enter a valid email address');

  const existing = await MoveIn.findOne({ tenant: tenant._id });
  if (existing?.status === 'approved') throw new HttpError(409, 'Your move-in form was already approved');
  if (!req.file && !existing?.idFile?.name) throw new HttpError(400, 'Please upload a photo or scan of your ID');

  let stored = null;
  if (req.file) {
    const type = detectType(req.file.buffer);
    if (!type) throw new HttpError(400, 'The ID must be a JPG, PNG or PDF file');
    stored = { name: `${crypto.randomUUID()}.${type.ext}`, mime: type.mime };
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, stored.name), req.file.buffer);
  }

  const form = existing || new MoveIn({ tenant: tenant._id });
  const oldFile = form.idFile?.name;
  form.set({ ...f, agreedAt: new Date(), status: 'submitted', reviewNote: '', reviewedAt: null });
  if (stored) form.idFile = stored;

  try {
    await form.save();
  } catch (err) {
    if (stored) await fs.unlink(path.join(UPLOAD_DIR, stored.name)).catch(() => {});
    throw err;
  }
  if (stored && oldFile) await fs.unlink(path.join(UPLOAD_DIR, oldFile)).catch(() => {});

  res.json(form);
});

/* ---------- staff (needs "tenants" permission) ---------- */

// GET /api/move-in?status=submitted
router.get('/', requireStaff('tenants'), async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  res.json(await withName(MoveIn.find(filter).sort({ createdAt: -1 })));
});

// GET /api/move-in/:id/id-file: streams the uploaded ID to staff only
router.get('/:id/id-file', requireStaff('tenants'), async (req, res) => {
  const form = await MoveIn.findById(req.params.id);
  if (!form?.idFile?.name) throw new HttpError(404, 'No ID on file');
  res.set({
    'Content-Type': form.idFile.mime,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.sendFile(path.join(UPLOAD_DIR, form.idFile.name), (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'The file is missing from the server' });
  });
});

// POST /api/move-in/:id/review   body: { decision: 'approved' | 'rejected', note }
router.post('/:id/review', requireStaff('tenants'), async (req, res) => {
  const { decision } = req.body;
  const note = String(req.body.note || '').trim();
  if (!['approved', 'rejected'].includes(decision)) throw new HttpError(400, 'Decision must be approved or rejected');
  if (decision === 'rejected' && !note) throw new HttpError(400, 'Add a note telling the tenant what to fix');

  const form = await MoveIn.findById(req.params.id);
  if (!form) throw new HttpError(404, 'Form not found');
  if (form.status !== 'submitted') throw new HttpError(409, `This form is already ${form.status}`);

  form.status = decision;
  form.reviewNote = note;
  form.reviewedAt = new Date();
  await form.save();

  if (decision === 'approved') {
    // copy the verified details onto the tenant's record
    const tenant = await Tenant.findById(form.tenant);
    if (tenant) {
      const who = [form.emergencyName, form.emergencyRelationship && `(${form.emergencyRelationship})`].filter(Boolean).join(' ');
      tenant.emergency = `${who} · ${form.emergencyPhone}`;
      if (form.phone) tenant.phone = form.phone;
      await tenant.save();
    }
  }
  res.json(await withName(MoveIn.findById(form._id)));
});

export default router;