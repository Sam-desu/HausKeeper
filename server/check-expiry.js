import 'dotenv/config';
import mongoose from 'mongoose';
import Room from './models/Room.js';
import Tenant from './models/Tenant.js';
import Reservation from './models/Reservation.js';
import { expireReservations } from './services/reservations.js';

await mongoose.connect(process.env.MONGO_URI);

const tenant = await Tenant.create({ name: 'Expiry Test', email: `exp${Date.now()}@example.com`, password: 'test1234' });
const held = await Room.updateOne({ _id: 'R-302', status: 'available' }, { status: 'reserved', tenant: tenant._id });
if (!held.modifiedCount) throw new Error('R-302 must be available for this check (run npm run seed:rooms)');

// a reservation whose 48-hour hold ended a second ago
await Reservation.create({ _id: 'RS-EXPIRY', tenant: tenant._id, room: 'R-302', moveInDate: '2030-01-01', holdUntil: new Date(Date.now() - 1000) });

await expireReservations();

const r = await Reservation.findById('RS-EXPIRY');
const room = await Room.findById('R-302');
const ok = r.status === 'expired' && room.status === 'available' && room.tenant === null;
console.log(ok ? 'PASS  Expired holds are released' : `FAIL  reservation=${r.status} room=${room.status}`);

await Reservation.deleteOne({ _id: 'RS-EXPIRY' });
await tenant.deleteOne();
await mongoose.disconnect();