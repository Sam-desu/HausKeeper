import 'dotenv/config';
import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import Tenant from '../models/Tenant.js';
import Counter from '../models/Counter.js';

// [id, tenant email, room, period, amount, status, due, paidOn]
const rows = [
  ['INV-2201', 'carmela.calonzo@gmail.com', 'R-101', 'Aug 2026', 6500, 'paid', '2026-08-05', '2026-08-02'],
  ['INV-2202', 'adrian.crisostomo@gmail.com', 'R-103', 'Aug 2026', 5200, 'unpaid', '2026-08-05', null],
  ['INV-2203', 'john.dizon@gmail.com', 'R-201', 'Aug 2026', 7000, 'paid', '2026-08-05', '2026-08-01'],
  ['INV-2204', 'krisha.guiterrez@gmail.com', 'R-203', 'Jul 2026', 5800, 'unpaid', '2026-07-05', null],
  ['INV-2205', 'krisha.guiterrez@gmail.com', 'R-203', 'Aug 2026', 5800, 'unpaid', '2026-08-05', null],
  ['INV-2206', 'jonee.santos@gmail.com', 'R-301', 'Aug 2026', 10500, 'paid', '2026-08-05', '2026-08-03'],
];

await mongoose.connect(process.env.MONGO_URI);

const tenants = await Tenant.find();
const byEmail = Object.fromEntries(tenants.map((t) => [t.email, t._id]));
if (!tenants.length) throw new Error('No tenants found. Run: npm run seed:users first');

await Invoice.deleteMany({});
await Invoice.insertMany(
  rows.map(([_id, email, room, period, amount, status, due, paidOn]) => ({
    _id, tenant: byEmail[email], room, period, amount, status, due, paidOn,
  }))
);
await Counter.findOneAndUpdate({ _id: 'invoice' }, { seq: rows.length }, { upsert: true });

console.log(`Seeded ${rows.length} invoices`);
await mongoose.disconnect();