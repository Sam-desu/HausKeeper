
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import Room from '../models/Room.js';
import Tenant from '../models/Tenant.js';
import Staff from '../models/Staff.js';
import Invoice from '../models/Invoice.js';
import Ticket from '../models/Ticket.js';
import Reservation from '../models/Reservation.js';
import MoveIn from '../models/MoveIn.js';
import Settings from '../models/Settings.js';
import Counter from '../models/Counter.js';

const UPLOADS = path.join(import.meta.dirname, '..', 'uploads');

await mongoose.connect(process.env.MONGO_URI);
const dbName = mongoose.connection.name;

if (!process.argv.includes('--yes')) {
  console.log(`This will DELETE ALL DATA in the database "${dbName}" and every uploaded ID file.`);
  console.log('Run again with --yes to confirm:  npm run reset-db -- --yes');
  await mongoose.disconnect();
  process.exit(0);
}

// deleteMany (not dropDatabase) so the unique indexes on email/username survive
for (const Model of [Room, Tenant, Staff, Invoice, Ticket, Reservation, MoveIn, Settings, Counter]) {
  const { deletedCount } = await Model.deleteMany({});
  console.log(`${Model.modelName}: removed ${deletedCount}`);
}

await fs.rm(UPLOADS, { recursive: true, force: true });
console.log('Uploaded ID files: removed');

console.log(`\n"${dbName}" is now empty.`);
await mongoose.disconnect();