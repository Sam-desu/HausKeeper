import { Router } from 'express';
import { requireAuth, requireStaff, requireTenant } from '../middleware/auth.js';
import { HttpError } from '../services/housing.js';
import { answer, chatEnabled } from '../services/chatbot.js';
import { answerAdmin } from '../services/adminChatbot.js';

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
  res.json({ reply: await answer(req.user.id, messages) });
});

// POST /api/chat/admin   same body → { reply }   (any staff; the data they get depends on their permissions)
router.post('/admin', requireStaff(), async (req, res) => {
  const messages = readMessages(req.body);
  rateLimit(String(req.user.id));
  res.json({ reply: await answerAdmin(req.user.id, req.user.perms, messages) });
});

export default router;
