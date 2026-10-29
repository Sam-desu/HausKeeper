import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { SupportPanel } from './SupportChat.jsx';
import './ChatBot.css';

const MODES = {
  tenant: {
    endpoint: '/chat',
    title: 'Help assistant',
    supportSub: 'Chat with the property staff',
    note: 'For billing disputes or emergencies, contact the office.',
    greeting: "Hi! I'm the HausKeeper assistant. Ask me about your bills, repair requests or house rules.",
    suggestions: ['How much do I owe?', 'When is my next payment due?', 'What is the status of my repair request?', 'What are the quiet hours?'],
  },
  admin: {
    endpoint: '/chat/admin',
    title: 'Admin assistant',
    supportSub: 'Messages from tenants',
    note: 'Read-only. It cannot change anything. Double-check numbers before acting.',
    greeting: "Hi! I can summarise occupancy, overdue payments, repairs and pending approvals, or draft a message to a tenant. What do you need?",
    suggestions: ['What needs my attention today?', 'Who has overdue payments?', 'Which repairs are still open?', 'How many rooms are vacant?'],
  },
};

// Floating chat bubble. Two tabs:
//   Assistant: the AI helper (only when a Gemini key is set). It only reads the signed-in user's own data.
//   Support:   the human chat. Tenants write to staff; every staff account can read and answer every conversation.
export default function ChatBot({ mode = 'tenant' }) {
  const cfg = MODES[mode] || MODES.tenant;
  const [aiEnabled, setAiEnabled] = useState(null); // null = still checking
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(null); // null = pick the default
  const [unread, setUnread] = useState(0); // unread support messages
  const [messages, setMessages] = useState([{ role: 'assistant', text: cfg.greeting }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  const active = tab ?? (aiEnabled === false ? 'support' : 'assistant');
  const hasAi = aiEnabled === true;

  useEffect(() => {
    api.get('/chat/config').then((c) => setAiEnabled(!!c.enabled)).catch(() => setAiEnabled(false));
  }, []);

  const loadUnread = useCallback(() => {
    api.get('/support/unread').then((d) => setUnread(d.unread || 0)).catch(() => {});
  }, []);

  // badge: check now, then every 15 seconds
  useEffect(() => {
    loadUnread();
    const t = setInterval(loadUnread, 15_000);
    return () => clearInterval(t);
  }, [loadUnread]);

  useEffect(() => {
    if (open && active === 'assistant') end.current?.scrollIntoView({ block: 'end' });
  }, [messages, open, busy, active]);

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

  const showBadge = unread > 0 && !(open && active === 'support');
  const badgeText = unread > 9 ? '9+' : unread;

  return (
    <>
      {open && (
        <div className="chat-panel" role="dialog" aria-label={active === 'support' ? 'Support chat' : cfg.title}>
          <div className="chat-head">
            <div>
              {active === 'support' ? 'Support' : cfg.title}
              <small>{active === 'support' ? cfg.supportSub : 'AI · answers may contain mistakes'}</small>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat">×</button>
          </div>

          {hasAi && (
            <div className="chat-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={active === 'assistant'}
                className={`chat-tab ${active === 'assistant' ? 'is-on' : ''}`}
                onClick={() => setTab('assistant')}
              >
                Assistant
              </button>
              <button
                role="tab"
                aria-selected={active === 'support'}
                className={`chat-tab ${active === 'support' ? 'is-on' : ''}`}
                onClick={() => setTab('support')}
              >
                Support
                {unread > 0 && active !== 'support' ? <span className="chat-tab-badge">{badgeText}</span> : null}
              </button>
            </div>
          )}

          {active === 'support' ? (
            <SupportPanel mode={mode} onSeen={loadUnread} onClose={() => setOpen(false)} />
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
      <button className="chat-fab" onClick={() => setOpen((o) => !o)} aria-label="Open chat">
        {open ? '×' : '💬'}
        {showBadge ? <span className="chat-badge">{badgeText}</span> : null}
      </button>
    </>
  );
}
