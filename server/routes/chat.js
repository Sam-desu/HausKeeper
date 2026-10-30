import { Router } from 'express';
import { requireAuth, requireStaff, requireTenant } from '../middleware/auth.js';
import { HttpError } from '../services/housing.js';
import { answer, chatEnabled } from '../services/chatbot.js';
import { answerAdmin } from '../services/adminChatbot.js';
import ChatMessage from '../models/ChatMessage.js';

const router = Router();

const MAX_TURNS = 10; // only the last 10 messages are sent to the AI
const MAX_CHARS = 500; // per message
const LIMIT = 20; // messages allowed per tenant...
const WINDOW_MS = 10 * 60 * 1000; // ...per 10 minutes
const hits = new Map(); // tenantId → timestamps (in memory; resets when the server restarts)

function rateLimit(id) {
  const now = Date.now();
  const recent = (hits.get(id) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) throw new HttpError(429, 'You have sent a lot of messages. Please wait a few minutes.');
  recent.push(now);
  hits.set(id, recent);
}

const KEEP = 200; // messages kept per person; older ones are removed
const SHOW = 100; // messages sent back when the chat opens

// Saves one exchange (the question and the answer) in the signed-in person's own history.
// Never throws: a storage problem must not lose the answer the person is waiting for.
async function remember(user, question, reply) {
  try {
    const base = { ownerType: user.role === 'staff' ? 'staff' : 'tenant', owner: user.id };
    const now = Date.now();
    await ChatMessage.insertMany([
      { ...base, role: 'user', text: question, createdAt: new Date(now) },
      { ...base, role: 'assistant', text: reply, createdAt: new Date(now + 1) },
    ]);
    const old = await ChatMessage.find(base).sort({ createdAt: -1 }).skip(KEEP).limit(1).select('createdAt');
    if (old.length) await ChatMessage.deleteMany({ ...base, createdAt: { $lte: old[0].createdAt } });
  } catch (err) {
    console.error('[chat] could not save history:', err.message);
  }
}

const ownerOf = (user) => ({ ownerType: user.role === 'staff' ? 'staff' : 'tenant', owner: user.id });

// GET /api/chat/history → { messages }: this person's saved conversation with their assistant
router.get('/history', requireAuth, async (req, res) => {
  const rows = await ChatMessage.find(ownerOf(req.user)).sort({ createdAt: -1, _id: -1 }).limit(SHOW);
  res.json({ messages: rows.reverse() });
});

// DELETE /api/chat/history → clears this person's saved conversation
router.delete('/history', requireAuth, async (req, res) => {
  await ChatMessage.deleteMany(ownerOf(req.user));
  res.json({ ok: true });
});

// GET /api/chat/config → lets the website hide the chat bubble when no API key is set
router.get('/config', requireAuth, (_req, res) => res.json({ enabled: chatEnabled() }));

// Shared by both bots: cleans the incoming messages. Returns at least one message ending with the user's.
function readMessages(body) {
  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages = raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, MAX_CHARS) }))
    .slice(-MAX_TURNS);
  while (messages.length && messages[0].role !== 'user') messages.shift(); // the AI needs the first message to be the user's
  if (!messages.length || messages[messages.length - 1].role !== 'user')
    throw new HttpError(400, 'Please type a message.');
  return messages;
}

// POST /api/chat   body: { messages: [{ role: 'user' | 'assistant', text }] }  → { reply }   (tenants)
router.post('/', requireTenant, async (req, res) => {
  const messages = readMessages(req.body);
  rateLimit(String(req.user.id));
  const reply = await answer(req.user.id, messages);
  await remember(req.user, messages[messages.length - 1].text, reply);
  res.json({ reply });
});

// POST /api/chat/admin   same body → { reply }   (any staff; the data they get depends on their permissions)
router.post('/admin', requireStaff(), async (req, res) => {
  const messages = readMessages(req.body);
  rateLimit(String(req.user.id));
  const reply = await answerAdmin(req.user.id, req.user.perms, messages);
  await remember(req.user, messages[messages.length - 1].text, reply);
  res.json({ reply });
});

export default router;
