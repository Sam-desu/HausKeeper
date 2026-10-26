import 'dotenv/config';
import './guard.js';
import mongoose from 'mongoose';
import Room from '../models/Room.js';

const GRID = 40;
const SIZE = 4 * GRID; // each room is a 4×4-cell square

await mongoose.connect(process.env.MONGO_URI);

const rooms = await Room.find().sort({ floor: 1, _id: 1 });
const slot = new Map(); // how many rooms already placed on each floor

for (const r of rooms) {
  const i = slot.get(r.floor) ?? 0;
  slot.set(r.floor, i + 1);
  const x = (2 + i * 5) * GRID; // one empty grid cell between neighbours
  const y = 3 * GRID;
  await Room.updateOne({ _id: r._id }, { plan: [x, y, x + SIZE, y, x + SIZE, y + SIZE, x, y + SIZE] });
}

console.log(`Placed ${rooms.length} rooms on the map`);
await mongoose.disconnect();