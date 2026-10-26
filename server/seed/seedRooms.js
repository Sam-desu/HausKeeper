import 'dotenv/config';
import './guard.js';
import mongoose from 'mongoose';
import Room from '../models/Room.js';

// tenant is null for now; we'll link rooms to tenants when we build the Tenants step
const rooms = [
  { id: 'R-101', floor: 1, type: 'Single', beds: 1, price: 6500, status: 'occupied', amenities: ['Window', 'Study desk', 'Shared bath'] },
  { id: 'R-102', floor: 1, type: 'Single', beds: 1, price: 6500, status: 'available', amenities: ['Window', 'Study desk', 'Shared bath'] },
  { id: 'R-103', floor: 1, type: 'Double', beds: 2, price: 5200, status: 'occupied', amenities: ['Balcony', 'Twin beds', 'Own bath'] },
  { id: 'R-104', floor: 1, type: 'Double', beds: 2, price: 5200, status: 'maintenance', amenities: ['Balcony', 'Twin beds', 'Own bath'], notes: 'Leaking faucet — plumber booked' },
  { id: 'R-201', floor: 2, type: 'Single', beds: 1, price: 7000, status: 'occupied', amenities: ['Aircon', 'Study desk', 'Own bath'] },
  { id: 'R-202', floor: 2, type: 'Suite', beds: 1, price: 9800, status: 'available', amenities: ['Aircon', 'Kitchenette', 'Own bath'] },
  { id: 'R-203', floor: 2, type: 'Double', beds: 2, price: 5800, status: 'occupied', amenities: ['Aircon', 'Twin beds', 'Shared bath'] },
  { id: 'R-204', floor: 2, type: 'Single', beds: 1, price: 6800, status: 'available', amenities: ['Window', 'Study desk', 'Own bath'] },
  { id: 'R-301', floor: 3, type: 'Suite', beds: 1, price: 10500, status: 'occupied', amenities: ['Aircon', 'Kitchenette', 'Own bath', 'Balcony'] },
  { id: 'R-302', floor: 3, type: 'Double', beds: 2, price: 5600, status: 'available', amenities: ['Window', 'Twin beds', 'Shared bath'] },
];

await mongoose.connect(process.env.MONGO_URI);
await Room.deleteMany({}); // ⚠️ wipes existing rooms, so only run this on dev data
await Room.insertMany(rooms.map(({ id, ...rest }) => ({ _id: id, ...rest })));
console.log(`Seeded ${rooms.length} rooms`);
await mongoose.disconnect();