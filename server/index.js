import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import roomRoutes from './routes/rooms.js';
import authRoutes from './routes/auth.js';
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
import { expireReservations } from './services/reservations.js';
import { notifyOverdueInvoices } from './services/billing.js';
import { attachUser } from './middleware/auth.js';

const app = express();
app.use(cors());
// keep the raw bytes too: PayMongo's webhook signature is calculated over them
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(attachUser); 

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/rooms', roomRoutes);
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




// Central error handler: turns Mongo/Mongoose errors into clean JSON responses
app.use((err, _req, res, _next) => {
  if (err.name === 'MulterError')
    return res
      .status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      .json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB)' : 'Upload failed' });
  if (err.status) return res.status(err.status).json({ message: err.message });
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0];
    const message = field === 'email' ? 'That email is already in use' : 'A record with that ID already exists';
    return res.status(409).json({ message });
  }
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  if (err.name === 'CastError') return res.status(400).json({ message: `Invalid value for ${err.path}` });
  console.error(err);
  res.status(500).json({ message: 'Server error' });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    setInterval(() => expireReservations().catch(console.error), 60_000);
    // overdue notices: once at start-up, then every hour (each invoice is only ever notified once)
    notifyOverdueInvoices().catch(console.error);
    setInterval(() => notifyOverdueInvoices().catch(console.error), 60 * 60_000);
  })
  .catch((err) => console.error('Connection failed:', err.message));