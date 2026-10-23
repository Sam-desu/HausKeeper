import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import './ChatBot.css';

const MODES = {
  tenant: {
    endpoint: '/chat',
    title: 'Help assistant',
    note: 'For billing disputes or emergencies, contact the office.',
    greeting: "Hi! I'm the HausKeeper assistant. Ask me about your bills, repair requests or house rules.",
    suggestions: ['How much do I owe?', 'When is my next payment due?', 'What is the status of my repair request?', 'What are the quiet hours?'],
  },
  admin: {
    endpoint: '/chat/admin',
    title: 'Admin assistant',
    note: 'Read-only. It cannot change anything. Double-check numbers before acting.',
    greeting: "Hi! I can summarise occupancy, overdue payments, repairs and pending approvals, or draft a message to a tenant. What do you need?",
    suggestions: ['What needs my attention today?', 'Who has overdue payments?', 'Which repairs are still open?', 'How many rooms are vacant?'],
  },
};

// Floating help chat for tenants. The server only lets it read the signed-in tenant's own data.
export default function ChatBot({ mode = 'tenant' }) {
  const cfg = MODES[mode] || MODES.tenant;
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', text: cfg.greeting }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => {
    api.get('/chat/config').then((c) => setEnabled(!!c.enabled)).catch(() => {});
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages, open, busy]);

  if (!enabled) return null;

  const send = async (text) => {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...messages, { role: 'user', text: t }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const history = next.filter((m) => m.role !== 'error');
      const { reply } = await api.post(cfg.endpoint, { messages: history });
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'error', text: err.message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {open && (
        <div className="chat-panel" role="dialog" aria-label={cfg.title}>
          <div className="chat-head">
            <div>{cfg.title}<small>AI · answers may contain mistakes</small></div>
            <button onClick={() => setOpen(false)} aria-label="Close chat">×</button>
          </div>
          <div className="chat-body">
            {messages.map((m, i) => <div key={i} className={`chat-msg ${m.role}`}>{m.text}</div>)}
            {messages.length === 1 && (
              <div className="chat-suggest">
                {cfg.suggestions.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
            {busy && <div className="chat-msg assistant">…</div>}
            <div ref={end} />
          </div>
          <div className="chat-note">{cfg.note}</div>
          <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="Type your question…" />
            <button className="btn small" disabled={busy || !input.trim()}>Send</button>
          </form>
        </div>
      )}
      <button className="chat-fab" onClick={() => setOpen((o) => !o)} aria-label="Open help assistant">{open ? '×' : '💬'}</button>
    </>
  );
}
