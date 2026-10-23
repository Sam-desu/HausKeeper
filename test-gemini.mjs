// Run from the HausKeeper folder:  node test-gemini.mjs
// Tries several models at the same time (25s limit each) and shows which ones actually answer.
import 'dotenv/config';
const key = process.env.GEMINI_API_KEY;
if (!key) { console.log('No GEMINI_API_KEY found in .env'); process.exit(1); }
const base = 'https://generativelanguage.googleapis.com/v1beta';
const models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'];

console.log('Testing', models.length, 'models (up to 25s)...\n');
await Promise.all(models.map(async (model) => {
  const t = Date.now();
  const secs = () => ((Date.now() - t) / 1000).toFixed(1) + 's';
  try {
    const r = await fetch(`${base}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say hello in 5 words.' }] }] }),
      signal: AbortSignal.timeout(25000),
    });
    const j = await r.json();
    if (!r.ok) return console.log(`${model.padEnd(26)} ERROR ${r.status} in ${secs()}: ${(j.error?.message || '').slice(0, 90)}`);
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '(empty)';
    console.log(`${model.padEnd(26)} WORKS in ${secs()}: ${text.trim().slice(0, 50)}`);
  } catch (e) {
    console.log(`${model.padEnd(26)} NO ANSWER after ${secs()} (${e.name})`);
  }
}));
console.log('\nPut a model marked WORKS into .env as GEMINI_MODEL=... and restart the server.');
