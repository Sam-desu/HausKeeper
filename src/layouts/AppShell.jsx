import React, { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { initials } from '../data.js';
import NotificationBell from '../components/NotificationBell.jsx';
import ChatBot from '../components/ChatBot.jsx';

export default function AppShell({ portal, nav }) {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // keep permissions / room / status fresh as the user moves around (skips the first render)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    refresh();
  }, [pathname, refresh]);

  const can = (perm) => portal === 'tenant' || !perm || user.perms?.includes(perm);
  const sub = portal === 'tenant' ? user.room || 'No room' : user.role;

  const signOut = () => {
    navigate('/');
    logout();
  };

  return (
    <>
      <div className="topbar">
        <div className="winlights">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <div className="brand">
          <div className="mark">&gt;_</div>
          <div>
            <div className="brand-name">HausKeeper<span className="cursor">▌</span></div>
            <div className="brand-sub">boardinghouse-mgmt-system@main</div>
          </div>
        </div>
        <div className="topbar-spacer" />
        <div className="identity">
          <NotificationBell />
          <span className="whoami">
            {user.name} <span style={{ color: 'var(--slate)' }}>· {sub}</span>
          </span>
          <div className="avatar">{initials(user.name)}</div>
          <button className="btn secondary small" onClick={signOut}>Log out</button>
        </div>
      </div>
      <div className="body-wrap">
        <div className="sidebar">
          {nav.map((g) => {
            const items = g.items.filter((it) => can(it.perm));
            if (!items.length) return null;
            return (
              <React.Fragment key={g.group}>
                <div className="group-label">{g.group}</div>
                {items.map((it) => (
                  <NavLink key={it.to} to={it.to} className={({ isActive }) => `navitem ${isActive ? 'active' : ''}`}>
                    <div className="tag">{it.tag}</div>
                    <span>{it.label}</span>
                  </NavLink>
                ))}
              </React.Fragment>
            );
          })}
        </div>
        <main>
          <Outlet />
        </main>
      </div>
      <ChatBot mode={portal} />
    </>
  );
}