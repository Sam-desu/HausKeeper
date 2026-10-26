// Imported right after dotenv by every seed script: they wipe data and create demo accounts
if (process.env.NODE_ENV === 'production') {
  console.error('❌ Seed scripts wipe data and are disabled when NODE_ENV=production.');
  process.exit(1);
}