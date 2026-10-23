import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, portalHome } from '../context/AuthContext.jsx';

export const Splash = () => (
  <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: 'var(--slate)' }}>Loading…</div>
);

// Only lets the given role through; everyone else is redirected
export function RequireRole({ role, children }) {
  const { role: current, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!current) {
    const tab = role === 'staff' ? 'admin' : 'tenant';
    return <Navigate to={`/login?role=${tab}`} replace state={{ from: location }} />;
  }
  if (current !== role) return <Navigate to={portalHome(current)} replace />;
  return children ?? <Outlet />;
}

// Hides a page from staff without the permission. This is a courtesy; the server is the real lock.
export function RequirePerm({ perm, children }) {
  const { user } = useAuth();
  if (perm && !user?.perms?.includes(perm)) {
    return (
      <div className="empty">
        <h3>No access</h3>
        <p>Your account doesn&apos;t have permission to view this page.</p>
      </div>
    );
  }
  return children;
}

export const NotFound = () => (
  <div className="empty" style={{ marginTop: 80 }}>
    <h3>Page not found</h3>
    <p>That address doesn&apos;t exist.</p>
  </div>
);

export const Pending = ({ title }) => (
  <div className="empty">
    <h3>{title}</h3>
    <p>This page is being connected to the backend. It&apos;s coming in the next step.</p>
  </div>
);