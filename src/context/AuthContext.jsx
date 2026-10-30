import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// role is 'tenant' or 'staff'; the staff portal lives at /admin
export const portalHome = (role) => (role === 'staff' ? '/admin/dashboard' : '/tenant/dashboard');

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(() => !!getToken()); // true while restoring a saved session

  const clear = useCallback(() => {
    setToken(null);
    setUser(null);
    setRole(null);
  }, []);

  const applySession = useCallback(({ token, role, user }) => {
    if (token) setToken(token);
    setRole(role);
    setUser(user);
  }, []);

  // Re-reads the current account (permissions, room, status) from the server
  const refresh = useCallback(async () => {
    try {
      applySession(await api.get('/auth/me'));
    } catch { /* a 401 is handled by the unauthorized handler */ }
  }, [applySession]);

  useEffect(() => {
    setUnauthorizedHandler(clear);
    if (!getToken()) return;
    api.get('/auth/me')
      .then(applySession)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [applySession, clear]);

  const login = async (apiRole, identifier, password, captcha) => {
    const res = await api.post('/auth/login', { role: apiRole, identifier, password, captcha });
    applySession(res);
    return res.user;
  };

  const register = async (fields) => {
    const res = await api.post('/auth/register', fields);
    applySession(res);
    return res.user;
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, login, register, logout: clear, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}