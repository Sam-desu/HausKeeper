import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useApi } from "../useApi.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { Loading, LoadError } from "./Common.jsx";
import "./support.css";

const POLL_MS = 5000;
const MAX_CHARS = 1000;

const clock = (iso) =>
  new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

/* ------------------------------------------------------------------ */
/*  One conversation: loads `path`, refreshes every few seconds, sends */
/*  to the same path. `self` is 'tenant' or 'staff' (who is looking).  */
/*  `embedded` = fills its parent (used inside the chat bubble).       */
/*  `onSeen` runs after every successful load (the server marks the    */
/*  messages read at that moment), so the bubble badge can refresh.    */
/* ------------------------------------------------------------------ */

function Conversation({ path, self, title, subtitle, headerExtra, empty, placeholder, onSent, onSeen, embedded }) {
  const toast = useToast();
  const [state, setState] = useState({ messages: [], tenant: null, loading: true, error: null });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);
  const reloadRef = useRef(() => {});
  const seenRef = useRef(onSeen);
  const count = useRef(0);
  seenRef.current = onSeen;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await api.get(path);
        if (cancelled) return;
        setState({ messages: d.messages, tenant: d.tenant || null, loading: false, error: null });
        seenRef.current?.();
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message }));
      }
    };
    reloadRef.current = load;
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [path]);

  // stick to the bottom when something new arrives
  useEffect(() => {
    if (state.messages.length === count.current) return;
    count.current = state.messages.length;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await api.post(path, { text: t });
      setText("");
      await reloadRef.current();
      onSent?.();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const tenant = state.tenant;
  const label = (m) => {
    if (m.from === "staff") return self === "tenant" ? `Support · ${m.staffName || "Staff"}` : m.staffName || "Staff";
    return self === "staff" ? tenant?.name || "Tenant" : "";
  };
  const heading = typeof title === "function" ? title(tenant) : title;
  const sub = typeof subtitle === "function" ? subtitle(tenant) : subtitle;
  const extra = headerExtra ? headerExtra(tenant) : null;

  return (
    <section className={embedded ? "sup-card embedded" : "card sup-card"}>
      {heading || sub || extra ? (
        <div className="sup-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {embedded ? extra : null}
            <div style={{ flex: 1, minWidth: 0 }}>
              {heading ? <h3>{heading}</h3> : null}
              {sub ? <small>{sub}</small> : null}
            </div>
            {embedded ? null : extra}
          </div>
        </div>
      ) : null}

      <div className="sup-body" ref={bodyRef} aria-live="polite">
        {state.loading ? (
          <div className="sup-empty">Loading…</div>
        ) : state.error && !state.messages.length ? (
          <div className="sup-empty">
            {state.error}
            <div style={{ marginTop: 10 }}>
              <button className="btn secondary small" onClick={() => reloadRef.current()}>
                Try again
              </button>
            </div>
          </div>
        ) : state.messages.length ? (
          state.messages.map((m) => (
            <div key={m.id} className={`sup-msg ${m.from === self ? "mine" : "theirs"}`}>
              {label(m) ? <span className="sup-who">{label(m)}</span> : null}
              {m.text}
              <span className="sup-time">{clock(m.createdAt)}</span>
            </div>
          ))
        ) : (
          <div className="sup-empty">{empty}</div>
        )}
      </div>

      <form
        className="sup-form"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={text}
          maxLength={MAX_CHARS}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          aria-label="Message"
        />
        <button className="btn brass" disabled={busy || !text.trim()}>
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}

/* The clickable conversation rows, shared by the full inbox and the bubble */
function ThreadItems({ list, selected, onPick }) {
  return list.map((t) => (
    <button
      key={t.tenant}
      className={`sup-thread ${t.tenant === selected ? "is-on" : ""}`}
      onClick={() => onPick(t.tenant)}
    >
      <div className="sup-thread-top">
        <span className="sup-thread-name">
          {t.tenantName}
          {t.room ? ` · ${t.room}` : ""}
        </span>
        {t.unread > 0 ? <span className="sup-unread">{t.unread}</span> : null}
        <span className="sup-thread-time">{ago(t.lastAt)}</span>
      </div>
      <div className="sup-thread-last">
        {t.lastFrom === "staff" ? "Staff: " : ""}
        {t.lastText}
      </div>
    </button>
  ));
}

const threadSubtitle = (t) =>
  t ? `${t.room ? `Room ${t.room}` : "No room"}${t.status === "inactive" ? " · inactive account" : ""}` : "";

/* ---------------- tenant: "Contact support" page ---------------- */

export function TenantSupport() {
  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Account</span>
          <h1>Contact support</h1>
          <p>
            Message the property staff directly. Any of our team can reply, and you&apos;ll get a notification when
            they do. You can also use the chat bubble in the corner.
          </p>
        </div>
      </div>
      <div style={{ maxWidth: 760 }}>
        <Conversation
          path="/support/mine"
          self="tenant"
          title="Support team"
          subtitle="Replies usually arrive during office hours"
          empty="No messages yet. Say hello or describe what you need help with."
          placeholder="Type your message… (Enter to send)"
        />
      </div>
    </>
  );
}

/* ---------------- staff: "Support inbox" page ---------------- */

export function StaffSupport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = params.get("tenant") || "";
  const threads = useApi("/support/threads");
  const reload = threads.reload;

  // keep the list fresh (new messages, unread counts)
  useEffect(() => {
    const t = setInterval(reload, 8000);
    return () => clearInterval(t);
  }, [reload]);

  if (threads.loading && !threads.data) return <Loading />;
  if (threads.error && !threads.data) return <LoadError error={threads.error} onRetry={reload} />;

  const list = threads.data || [];
  const canSeeTenant = !!user.perms?.includes("tenants");

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>Support inbox</h1>
          <p>
            Messages from tenants. Every staff account can see and answer every conversation, and replies show the
            name of who sent them. The chat bubble in the corner shows the same conversations.
          </p>
        </div>
      </div>

      <div className="sup-layout">
        <aside className="card sup-card" aria-label="Conversations">
          <div className="sup-head">
            <h3>Conversations</h3>
            <small>{list.length} total</small>
          </div>
          <div className="sup-list">
            {list.length ? (
              <ThreadItems list={list} selected={selected} onPick={(id) => setParams({ tenant: id }, { replace: true })} />
            ) : (
              <div className="empty" style={{ padding: 28 }}>
                <p>No one has written to support yet.</p>
              </div>
            )}
          </div>
        </aside>

        {selected ? (
          <Conversation
            key={selected}
            path={`/support/threads/${encodeURIComponent(selected)}`}
            self="staff"
            title={(t) => t?.name || "Conversation"}
            subtitle={threadSubtitle}
            headerExtra={(t) =>
              canSeeTenant && t ? (
                <button className="btn secondary small" onClick={() => navigate(`/admin/tenants/${t.id}`)}>
                  View tenant
                </button>
              ) : null
            }
            empty="No messages in this conversation."
            placeholder="Write a reply… (Enter to send)"
            onSent={reload}
          />
        ) : (
          <section className="card sup-card">
            <div className="sup-body">
              <div className="sup-empty">Choose a conversation on the left to read and reply.</div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Inside the chat bubble. Mounted only while the Support tab is      */
/*  showing, so messages are only marked as read when actually seen.   */
/* ------------------------------------------------------------------ */

function TenantBubble({ onSeen, onClose }) {
  const navigate = useNavigate();
  return (
    <div className="chat-support">
      <Conversation
        embedded
        path="/support/mine"
        self="tenant"
        empty="Message the property staff here. Any of our team can reply, and you'll get a notification."
        placeholder="Message support… (Enter to send)"
        onSeen={onSeen}
      />
      <div className="chat-note">
        <button
          className="linklike"
          style={{ fontSize: 11 }}
          onClick={() => {
            onClose?.();
            navigate("/tenant/support");
          }}
        >
          Open full page
        </button>
      </div>
    </div>
  );
}

function StaffBubble({ onSeen, onClose }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState("");
  const threads = useApi(selected ? null : "/support/threads");
  const reload = threads.reload;

  // refresh the list while it is showing
  useEffect(() => {
    if (selected) return undefined;
    const t = setInterval(reload, 8000);
    return () => clearInterval(t);
  }, [selected, reload]);

  // refresh the badge whenever the list reloads
  useEffect(() => {
    if (!selected && threads.data) onSeen?.();
  }, [selected, threads.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selected)
    return (
      <div className="chat-support">
        <Conversation
          key={selected}
          embedded
          path={`/support/threads/${encodeURIComponent(selected)}`}
          self="staff"
          title={(t) => t?.name || "Conversation"}
          subtitle={threadSubtitle}
          headerExtra={() => (
            <button className="btn secondary small" onClick={() => setSelected("")}>
              ← Back
            </button>
          )}
          empty="No messages in this conversation."
          placeholder="Write a reply… (Enter to send)"
          onSeen={onSeen}
        />
      </div>
    );

  const list = threads.data || [];
  return (
    <div className="chat-support">
      <div className="sup-list" style={{ background: "var(--paper-raised)" }}>
        {threads.loading && !threads.data ? (
          <div className="sup-empty" style={{ padding: 24 }}>Loading…</div>
        ) : threads.error && !threads.data ? (
          <div className="sup-empty" style={{ padding: 24 }}>
            {threads.error}
            <div style={{ marginTop: 10 }}>
              <button className="btn secondary small" onClick={reload}>
                Try again
              </button>
            </div>
          </div>
        ) : list.length ? (
          <ThreadItems list={list} selected="" onPick={setSelected} />
        ) : (
          <div className="sup-empty" style={{ padding: 24 }}>No one has written to support yet.</div>
        )}
      </div>
      <div className="chat-note">
        <button
          className="linklike"
          style={{ fontSize: 11 }}
          onClick={() => {
            onClose?.();
            navigate("/admin/support");
          }}
        >
          Open full inbox
        </button>
      </div>
    </div>
  );
}

export function SupportPanel({ mode, onSeen, onClose }) {
  return mode === "admin" ? <StaffBubble onSeen={onSeen} onClose={onClose} /> : <TenantBubble onSeen={onSeen} onClose={onClose} />;
}
