import { Router } from 'express';
import { getSettings } from '../models/Settings.js';
import { requireStaff } from '../middleware/auth.js';
import { emailConfigured, smsConfigured } from '../services/notify.js';
import { HttpError } from '../services/housing.js';

const router = Router();

// GET /api/settings/public: safe for the home page footer and the staff dashboard header
router.get('/public', async (_req, res) => {
  const s = await getSettings();
  res.json({ propertyName: s.propertyName, address: s.address });
});

// Tells the Settings page whether the .env credentials for each channel are in place
const withChannelStatus = (s) => ({
  ...s.toJSON(),
  channelStatus: { email: emailConfigured(), sms: smsConfigured() },
});

// GET /api/settings
router.get('/', requireStaff('settings'), async (_req, res) => {
  res.json(withChannelStatus(await getSettings()));
});

// PUT /api/settings   body: any of the fields; notifTemplates may be partial
router.put('/', requireStaff('settings'), async (req, res) => {
  const s = await getSettings();

  for (const key of ['propertyName', 'address', 'billingCycle', 'lateFee']) {
    if (req.body[key] === undefined) continue;
    const value = String(req.body[key]).trim();
    if (key === 'propertyName' && !value) throw new HttpError(400, 'Property name is required');
    s.set(key, value);
  }

  const templates = req.body.notifTemplates;
  if (templates && typeof templates === 'object') {
    for (const key of ['invoice', 'overdue', 'ticket']) {
      if (templates[key] !== undefined) s.set(`notifTemplates.${key}`, String(templates[key]));
    }
  }

  const channels = req.body.notifChannels;
  if (channels && typeof channels === 'object') {
    for (const key of ['email', 'sms']) {
      if (channels[key] === undefined) continue;
      if (typeof channels[key] !== 'boolean') throw new HttpError(400, `Invalid value for ${key}`);
      s.set(`notifChannels.${key}`, channels[key]);
    }
  }

  await s.save(); // schema length limits are enforced here and return 400
  res.json(withChannelStatus(s));
});

export default router;