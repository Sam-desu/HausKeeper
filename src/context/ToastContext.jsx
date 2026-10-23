import React, { createContext, useCallback, useContext, useState } from 'react';
import { ToastStack } from '../components/Common.jsx';

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastStack toasts={toasts} />
    </ToastContext.Provider>
  );
}