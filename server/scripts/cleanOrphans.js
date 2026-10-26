import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import Tenant from '../models/Tenant.js';
import Room from '../models/Room.js';
import Reservation from '../models/Reservation.js';
import MoveIn from '../models/MoveIn.js';
import Invoice from '../models/Invoice.js';
import Ticket from '../models/Ticket.js';

const apply = process.argv.includes('--apply');
const UPLOADS = path.join(import.meta.dirname, '..', 'uploads');

await mongoose.connect(process.env.MONGO_URI);
const alive = new Set((await Tenant.find().select('_id')).map((t) => String(t._id)));
const gone = (tenantId) => !tenantId || !alive.has(String(tenantId));

console.log(apply ? 'APPLYING cleanup\n' : 'DRY RUN (nothing is changed). Add --apply to clean up.\n');

for (const [name, Model] of [['reservations', Reservation], ['move-in forms', MoveIn], ['invoices', Invoice], ['tickets', Ticket]]) {
  const docs = (await Model.find().select('tenant idFile')).filter((d) => gone(d.tenant));
  console.log(`${name}: ${docs.length} orphaned`);
  if (apply && docs.length) {
    for (const d of docs) if (d.idFile?.name) await fs.unlink(path.join(UPLOADS, d.idFile.name)).catch(() => {});
    await Model.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
  }
}

const rooms = (await Room.find({ tenant: { $ne: null } }).select('tenant')).filter((r) => gone(r.tenant));
console.log(`rooms held by a missing tenant: ${rooms.length}`);
if (apply && rooms.length)
  await Room.updateMany({ _id: { $in: rooms.map((r) => r._id) } }, { status: 'available', tenant: null });

await mongoose.disconnect();