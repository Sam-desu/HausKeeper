import 'dotenv/config';
import mongoose from 'mongoose';
import Staff, { PERMISSIONS } from '../models/Staff.js';

const [rawUsername, password, ...nameParts] = process.argv.slice(2);
const usage = 'Usage: npm run create-admin -- <username> "<password, 10+ chars>" [Full Name]';

if (!rawUsername || !password) { console.error(usage); process.exit(1); }
const username = rawUsername.trim().toLowerCase();
if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
  console.error('Username: 3-30 chars, lowercase letters, numbers, dot, dash, underscore.');
  process.exit(1);
}
if (password.length < 10) { console.error('Use a password of at least 10 characters.'); process.exit(1); }

await mongoose.connect(process.env.MONGO_URI);
try {
  if (await Staff.exists({ username })) {
    console.error(`An account named "${username}" already exists.`);
    process.exitCode = 1;
  } else {
    // create() (not insertMany) so the password-hashing hook runs
    await Staff.create({
      name: nameParts.join(' ') || 'Administrator',
      role: 'Property Administrator',
      username,
      password,
      perms: PERMISSIONS,
    });
    console.log(`Admin "${username}" created with all permissions. Sign in at /login?role=admin`);
  }
} finally {
  await mongoose.disconnect();
}