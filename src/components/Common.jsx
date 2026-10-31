import React, { useState } from "react";
import { sanitizePhoneInput, isValidPhone, PHONE_HINT } from "../utils/phone.js";

const STATUS_MAP = {
  occupied: ["ok", "Occupied"],
  reserved: ["warn", "Reserved"],
  available: ["warn", "Available"],
  maintenance: ["bad", "Maintenance"],
  active: ["ok", "Active"],
  overdue: ["bad", "Overdue"],
  "move-out-pending": ["warn", "Move-out pending"],
  inactive: ["neutral", "Inactive"],
  paid: ["ok", "Paid"],
  unpaid: ["warn", "Unpaid"],
  open: ["bad", "Open"],
  "in-progress": ["warn", "In progress"],
  resolved: ["ok", "Resolved"],
  high: ["bad", "High"],
  medium: ["warn", "Medium"],
  low: ["neutral", "Low"],
  pending: ["warn", "Pending"],
  approved: ["ok", "Approved"],
  declined: ["bad", "Declined"],
  cancelled: ["neutral", "Cancelled"],
  expired: ["neutral", "Expired"],
  submitted: ["warn", "Submitted"],
  rejected: ["bad", "Rejected"],
};

export function StatusPill({ status }) {
  const [cls, label] = STATUS_MAP[status] || ["neutral", status];
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function ToastStack({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export const Loading = () => (
  <div className="empty">
    <p>Loading…</p>
  </div>
);

export function LoadError({ title = "Couldn't load this page", error, onRetry }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{error}</p>
      {onRetry ? (
        <button className="btn secondary small" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

// Kept for compatibility; the app uses the modal in ModalContext now
export function Field({ label, hint, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}
/* Phone number input: only lets valid-looking characters in (digits, a leading +),
   caps the length, and shows a hint once the user leaves the field with a bad number.
   Use inside a .field; `onChange` receives the cleaned string (not the event). */
export function PhoneInput({ value, onChange, placeholder = "0917 123 4567", ...rest }) {
  const [touched, setTouched] = useState(false);
  const bad = touched && value && !isValidPhone(value);
  return (
    <>
      <input
        {...rest}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={16}
        placeholder={placeholder}
        value={value}
        className={bad ? "invalid" : undefined}
        aria-invalid={bad ? "true" : undefined}
        onChange={(e) => onChange(sanitizePhoneInput(e.target.value))}
        onBlur={() => setTouched(true)}
      />
      {bad ? <div className="hint field-error">{PHONE_HINT}</div> : null}
    </>
  );
}
