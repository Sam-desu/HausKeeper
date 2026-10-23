import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// The bell in the top bar. Works for tenants and staff: the server only returns the signed-in person's own notifications.
export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unread: 0, items: [] });
  const box = useRef(null);

  const load = useCallback(() => api.get('/notifications').then(setData).catch(() => {}), []);

  // refresh every 30 seconds, and again each time the panel is opened
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { if (open) load(); }, [open, load]);

  // click outside or press Escape to close
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const openItem = (n) => {
    setOpen(false);
    if (!n.read) api.post(`/notifications/${n.id}/read`).then(load).catch(() => {});
    if (n.link) navigate(n.link);
  };
  const readAll = () => api.post('/notifications/read-all').then(load).catch(() => {});

  return (
    <div className="bell-wrap" ref={box}>
      <button
        className="bell"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {data.unread > 0 ? <span className="bell-badge">{data.unread > 9 ? '9+' : data.unread}</span> : null}
      </button>
      {open ? (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {data.unread > 0 ? (
              <button className="linklike" style={{ fontSize: 'var(--t-xs)' }} onClick={readAll}>Mark all read</button>
            ) : null}
          </div>
          <div className="bell-list">
            {data.items.length ? (
              data.items.map((n) => (
                <button key={n.id} className={`bell-item ${n.read ? '' : 'unread'}`} onClick={() => openItem(n)}>
                  <span className="bell-title">{n.title}</span>
                  {n.body ? <span className="bell-body">{n.body}</span> : null}
                  <span className="bell-time">{ago(n.createdAt)}</span>
                </button>
              ))
            ) : (
              <div className="bell-empty">You&apos;re all caught up.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
