import 'dotenv/config';
import mongoose from 'mongoose';
import Ticket from '../models/Ticket.js';
import Tenant from '../models/Tenant.js';
import Staff from '../models/Staff.js';
import Counter from '../models/Counter.js';

// [id, tenant email, room, title, category, priority, status, assigned username, created, notes]
const rows = [
  ['MT-501', 'adrian.crisostomo@gmail.com', 'R-103', 'Aircon not cooling', 'Electrical', 'high', 'in-progress', 'admin', '2026-08-01', 'Technician visited, awaiting part.'],
  ['MT-502', 'krisha.guiterrez@gmail.com', 'R-203', 'Broken window latch', 'Carpentry', 'medium', 'open', null, '2026-08-04', ''],
  ['MT-503', 'carmela.calonzo@gmail.com', 'R-101', 'Slow drain in sink', 'Plumbing', 'low', 'resolved', 'staff', '2026-07-20', 'Cleared blockage.'],
  ['MT-504', 'jonee.santos@gmail.com', 'R-301', 'Wifi signal weak', 'Utilities', 'medium', 'open', null, '2026-08-06', ''],
];

await mongoose.connect(process.env.MONGO_URI);

const tenants = await Tenant.find();
const staff = await Staff.find();
if (!tenants.length || !staff.length) throw new Error('Run: npm run seed:users first');
const tenantId = Object.fromEntries(tenants.map((t) => [t.email, t._id]));
const staffId = Object.fromEntries(staff.map((s) => [s.username, s._id]));

await Ticket.deleteMany({});
await Ticket.insertMany(
  rows.map(([_id, email, room, title, category, priority, status, who, created, notes]) => ({
    _id, tenant: tenantId[email], room, title, category, priority, status,
    assigned: who ? staffId[who] : null, created, notes,
  }))
);
await Counter.findOneAndUpdate({ _id: 'ticket' }, { seq: 4 }, { upsert: true });

console.log(`Seeded ${rows.length} tickets`);
await mongoose.disconnect();
