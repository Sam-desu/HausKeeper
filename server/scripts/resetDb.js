import 'dotenv/config';
import '../seed/guard.js'; // refuses to run when NODE_ENV=production (loaded after dotenv so a .env value counts)
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';

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
const collections = (await mongoose.connection.db.collections()).filter((c) => !c.collectionName.startsWith('system.'));
for (const c of collections) {
  const { deletedCount } = await c.deleteMany({});
  console.log(`${c.collectionName}: removed ${deletedCount}`);
}

await fs.rm(UPLOADS, { recursive: true, force: true });
await fs.mkdir(UPLOADS, { recursive: true });
console.log('Uploaded ID files: removed');

console.log(`\n"${dbName}" is now empty.`);
await mongoose.disconnect();