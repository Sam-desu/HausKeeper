import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import { attachUser } from './middleware/auth.js';
import { expireReservations } from './services/reservations.js';
import { notifyOverdueInvoices } from './services/billing.js';
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import tenantRoutes from './routes/tenants.js';
import invoiceRoutes from './routes/invoices.js';
import ticketRoutes from './routes/tickets.js';
import staffRoutes from './routes/staff.js';
import settingsRoutes from './routes/settings.js';
import reportRoutes from './routes/reports.js';
import reservationRoutes from './routes/reservations.js';
import moveInRoutes from './routes/moveIn.js';
import mapRoutes from './routes/map.js';
import paymentRoutes from './routes/payments.js';
import notificationRoutes from './routes/notifications.js';
import chatRoutes from './routes/chat.js';
import roomLayoutsRouter from './routes/roomLayouts.js';
import supportRoutes from './routes/support.js';

const isProd = process.env.NODE_ENV === 'production';

// Fail fast on bad configuration instead of running half-broken
for (const key of ['MONGO_URI', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`❌ Missing ${key} in the environment`);
    process.exit(1);
  }
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET is too short. Use at least 32 random characters.');
  process.exit(1);
}

const app = express();
if (isProd) app.set('trust proxy', 1); // behind one hosting proxy: needed so rate limits see real client IPs

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'blob:'],   // blob: lets staff view uploaded IDs
        'object-src': ["'self'", 'blob:'],
        'frame-src': ["'self'", 'blob:'],
        'upgrade-insecure-requests': null,         // the host handles HTTPS; this breaks http://localhost testing
      },
    },
  })
);

// Same-origin by default (the built site and the API share one server, and Vite proxies in dev).
// Only set CLIENT_ORIGIN if a different website needs to call this API.
if (process.env.CLIENT_ORIGIN) {
  app.use(cors({ origin: process.env.CLIENT_ORIGIN.split(',').map((s) => s.trim()) }));
}

// keep the raw bytes too: PayMongo's webhook signature is calculated over them
app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(attachUser);

// Rate limits apply in production only, so the test scripts can log in freely
const limiter = (windowMs, limit, message, extra = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message },
    skip: () => !isProd,
    ...extra,
  });

app.use('/api/auth/login', limiter(15 * 60_000, 20, 'Too many failed sign-in attempts. Try again in a few minutes.', { skipSuccessfulRequests: true }));
app.use('/api/auth/register', limiter(60 * 60_000, 10, 'Too many sign-ups from this network. Try again later.'));
app.use('/api', limiter(60_000, 300, 'Too many requests. Please slow down a little.'));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/move-in', moveInRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/room-layouts', roomLayoutsRouter);
app.use('/api/support', supportRoutes);
app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));

// Serve the built frontend (npm run build → dist/), with a fallback so refreshing /admin/rooms works
const dist = path.join(import.meta.dirname, '..', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// Central error handler: turns errors into clean JSON responses
app.use((err, _req, res, _next) => {
  if (err.status) return res.status(err.status).json({ message: err.message });
  if (err.name === 'MulterError')
    return res
      .status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      .json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB)' : 'Upload failed' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request is too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON' });
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0];
    const message = field === 'email' ? 'That email is already in use' : 'A record with that ID already exists';
    return res.status(409).json({ message });
  }
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  if (err.name === 'CastError')
    return res.status(400).json({ message: err.path === '_id' ? 'That link is not valid' : `Invalid value for ${err.path}` });
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

const PORT = process.env.PORT || 5000;

try {
  await mongoose.connect(process.env.MONGO_URI);
} catch (err) {
  console.error('❌ Connection failed:', err.message);
  process.exit(1);
}
console.log('✅ MongoDB connected');

const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}${isProd ? ' (production)' : ''}`));

const expiryTimer = setInterval(() => expireReservations().catch(console.error), 60_000);
// overdue notices: once at start-up, then every hour (each invoice is only ever notified once)
notifyOverdueInvoices().catch(console.error);
const overdueTimer = setInterval(() => notifyOverdueInvoices().catch(console.error), 60 * 60_000);

// Finish in-flight requests when the host restarts the service
const shutdown = () => {
  clearInterval(expiryTimer);
  clearInterval(overdueTimer);
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);