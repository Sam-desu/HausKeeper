import 'dotenv/config';
import mongoose from 'mongoose';
import Staff from '../models/Staff.js';

await mongoose.connect(process.env.MONGO_URI);
const all = await Staff.find().select('+password');
console.log('Database:', mongoose.connection.name);
console.log(all.map((s) => ({ username: s.username, hashed: s.password?.startsWith('$2') })));
await mongoose.disconnect();