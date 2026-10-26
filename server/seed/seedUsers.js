import 'dotenv/config';
import './guard.js';
import mongoose from 'mongoose';
import Staff from '../models/Staff.js';
import Tenant from '../models/Tenant.js';
import Room from '../models/Room.js';
import Reservation from '../models/Reservation.js';
import MoveIn from '../models/MoveIn.js';

const staff = [
  { name: 'Staff', role: 'Front Desk Staff', username: 'staff', password: 'staff123', perms: ['tenants', 'billing', 'maintenance'] },
  { name: 'Admin', role: 'Property Administrator', username: 'admin', password: 'admin123', perms: ['tenants', 'rooms', 'billing', 'maintenance', 'staff', 'settings'] },
];

// \u00B7 is the middle dot (·)
const tenants = [
  { name: 'Carmela Calonzo', email: 'carmela.calonzo@gmail.com', password: 'carmela123', phone: '0917 555 0142', room: 'R-101', moveIn: '2025-03-01', emergency: 'Rosa Calonzo \u00B7 0917 555 0900' },
  { name: 'Adrian Crisostomo', email: 'adrian.crisostomo@gmail.com', password: 'adrian123', phone: '0917 555 0287', room: 'R-103', moveIn: '2025-05-14', emergency: 'Liza Crisostomo \u00B7 0917 555 1188' },
  { name: 'John Samuel Dizon', email: 'john.dizon@gmail.com', password: 'john123', phone: '0917 555 0391', room: 'R-201', moveIn: '2024-11-20', emergency: 'Jun Dizon \u00B7 0917 555 0455' },
  { name: 'Krisha Guiterrez', email: 'krisha.guiterrez@gmail.com', password: 'krisha123', phone: '0917 555 0410', room: 'R-203', status: 'overdue', moveIn: '2025-01-09', emergency: 'Nena Guiterrez \u00B7 0917 555 0212' },
  { name: 'Jonee Rose Santos', email: 'jonee.santos@gmail.com', password: 'jonee123', phone: '0917 555 0532', room: 'R-301', moveIn: '2025-06-02', emergency: 'Rico Santos \u00B7 0917 555 0781' },
];

await mongoose.connect(process.env.MONGO_URI);

await Staff.deleteMany({});
await Tenant.deleteMany({});
// New tenant ids are created below, so records pointing at the old ones would be orphaned
await Reservation.deleteMany({});
await MoveIn.deleteMany({});
await Room.updateMany({}, { tenant: null });

// create() (not insertMany) so the password-hashing hook runs
await Staff.create(staff);
const created = await Tenant.create(tenants);

// link each room back to its tenant
for (const t of created) {
  if (t.room) await Room.updateOne({ _id: t.room }, { tenant: t._id });
}

console.log(`Seeded ${staff.length} staff and ${created.length} tenants`);
await mongoose.disconnect();