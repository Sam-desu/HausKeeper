import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useToast } from './ToastContext.jsx';

const ModalContext = createContext(null);
export const useModal = () => useContext(ModalContext);

export function ModalProvider({ children }) {
  const toast = useToast();
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const submitRef = useRef(null);

  const openModal = useCallback((descriptor) => {
    submitRef.current = null;
    setModal(descriptor);
  }, []);
  const closeModal = useCallback(() => setModal(null), []);

  const save = async () => {
    if (!submitRef.current || saving) return;
    setSaving(true);
    try {
      await submitRef.current();
    } catch (err) {
      toast(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalContext.Provider value={{ openModal, closeModal }}>
      {children}
      {modal && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>{modal.title}</h3>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              <modal.Body {...modal.bodyProps} registerSubmit={(fn) => { submitRef.current = fn; }} />
            </div>
            <div className="modal-foot">
              <button className="btn secondary" onClick={closeModal}>{modal.cancelLabel || 'Cancel'}</button>
              <button className="btn brass" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : modal.submitLabel || 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}