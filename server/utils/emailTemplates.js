const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

const THEMES = {
  success: {
    accent: "#16a34a",
    dark: "#15803d",
    soft: "#dcfce7",
    light: "#d1fae5",
  },
  danger: {
    accent: "#dc2626",
    dark: "#b91c1c",
    soft: "#fee2e2",
    light: "#fecaca",
  },
  info: {
    accent: "#4f46e5",
    dark: "#4338ca",
    soft: "#e0e7ff",
    light: "#c7d2fe",
  },
  warning: { accent: '#d97706', dark: '#b45309', soft: '#fef3c7', light: '#fde68a' },
};

const row = (label, value, valueColor = INK) => `
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${MUTED};">${esc(label)}</td>
    <td align="right" style="padding:12px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${valueColor};font-weight:600;">${esc(value)}</td>
  </tr>`;

function layout({
  theme,
  propertyName,
  preheader,
  icon,
  title,
  subtitle,
  amountLabel,
  amountText,
  badge,
  rows,
  hero,
  buttonUrl,
  buttonText,
  note,
}) {
  const c = THEMES[theme];
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr><td align="center" style="padding:32px 16px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

        <tr>
          <td align="center" bgcolor="${c.accent}"
            style="background-color:${c.accent};background-image:linear-gradient(135deg,${c.accent} 0%,${c.dark} 100%);padding:36px 24px 32px;">
            <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:${c.light};font-weight:700;">🏠 ${esc(propertyName)}</div>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 14px;">
              <tr>
                <td align="center" width="64" height="64" bgcolor="#ffffff"
                  style="width:64px;height:64px;border-radius:32px;background:#ffffff;font-size:30px;line-height:64px;color:${c.accent};font-weight:700;">
                  ${icon}
                </td>
              </tr>
            </table>
            <div style="font-size:24px;font-weight:700;color:#ffffff;">${esc(title)}</div>
            <div style="font-size:14px;color:${c.light};margin-top:6px;">${esc(subtitle)}</div>
          </td>
        </tr>

        ${
          hero ||
          `
        <tr>
          <td align="center" style="padding:32px 24px 8px;">
            <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};font-weight:600;">${esc(amountLabel)}</div>
            <div style="font-size:44px;font-weight:800;color:${INK};margin:6px 0 10px;">₱${esc(amountText)}</div>
            <span style="display:inline-block;background:${c.soft};color:${c.dark};font-size:12px;font-weight:700;padding:5px 14px;border-radius:999px;letter-spacing:1px;">
              ● ${esc(badge)}
            </span>
          </td>
        </tr>`
        }

                ${
                  rows
                    ? `
        <tr>
          <td style="padding:24px 32px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          </td>
        </tr>`
                    : ""
                }

        ${
          buttonUrl
            ? `
        <tr>
          <td align="center" style="padding:28px 32px 36px;">
            <a href="${esc(buttonUrl)}"
              style="display:inline-block;background:${c.accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;">
              ${esc(buttonText)}
            </a>
          </td>
        </tr>`
            : '<tr><td style="padding-bottom:28px;"></td></tr>'
        }

        <tr>
          <td align="center" bgcolor="#f9fafb" style="background:#f9fafb;padding:22px 24px;border-top:1px solid ${LINE};">
            <div style="font-size:12px;color:${MUTED};line-height:1.6;">${note}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:10px;">Sent by ${esc(propertyName)} · Powered by HausKeeper</div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ---------- 1. Payment receipt (green) ---------- */
export function paymentReceiptEmail({
  propertyName = "HausKeeper",
  name,
  invoice,
  methodLabel,
  amountText,
  buttonUrl,
}) {
  return layout({
    theme: "success",
    propertyName,
    preheader: `We received your ₱${amountText} payment for invoice ${invoice.id}.`,
    icon: "✓",
    title: "Payment received",
    subtitle: `Thank you, ${name || "there"}!`,
    amountLabel: "Amount paid",
    amountText,
    badge: "PAID",
    rows: [
      row("Invoice", invoice.id),
      row("Billing period", invoice.period),
      row("Room", invoice.room),
      row("Payment method", methodLabel || "—"),
      row("Paid on", invoice.paidOn),
    ].join(""),
    buttonUrl,
    buttonText: "View billing history",
    note: "Keep this email as your payment receipt.<br>Questions? Just reply to this email or message the admin.",
  });
}

/* ---------- 1b. Combined receipt for several invoices (green) ---------- */
// items: [{ id, period, amountText }]
export function bulkPaymentReceiptEmail({
  propertyName = "HausKeeper",
  name,
  items = [],
  room,
  methodLabel,
  paidOn,
  amountText,
  buttonUrl,
}) {
  const count = items.length;
  return layout({
    theme: "success",
    propertyName,
    preheader: `We received your ₱${amountText} payment covering ${count} invoices.`,
    icon: "✓",
    title: "Payment received",
    subtitle: `Thank you, ${name || "there"}! ${count} invoices paid.`,
    amountLabel: "Total paid",
    amountText,
    badge: "PAID",
    rows: [
      ...items.map((i) =>
        row(`${i.id} · ${i.period}`, `₱${i.amountText}`),
      ),
      room ? row("Room", room) : "",
      row("Payment method", methodLabel || "—"),
      row("Paid on", paidOn || "—"),
    ].join(""),
    buttonUrl,
    buttonText: "View billing history",
    note: "Keep this email as your payment receipt.<br>Questions? Just reply to this email or message the admin.",
  });
}

/* ---------- 2. New invoice (indigo) ---------- */
export function newInvoiceEmail({
  propertyName = "HausKeeper",
  name,
  invoice,
  amountText,
  buttonUrl,
}) {
  return layout({
    theme: "info",
    propertyName,
    preheader: `Invoice ${invoice.id}: ₱${amountText} due ${invoice.due}.`,
    icon: "🧾",
    title: "New invoice",
    subtitle: `Hi ${name || "there"}, your invoice is ready.`,
    amountLabel: "Amount due",
    amountText,
    badge: "UNPAID",
    rows: [
      row("Invoice", invoice.id),
      row("Billing period", invoice.period),
      row("Room", invoice.room),
      row("Due date", invoice.due, "#4338ca"),
    ].join(""),
    buttonUrl,
    buttonText: "View & pay invoice",
    note: "Please pay on or before the due date to avoid a late notice.<br>Questions? Just reply to this email or message the admin.",
  });
}

/* ---------- 3. Overdue notice (red) ---------- */
export function overdueEmail({
  propertyName = "HausKeeper",
  name,
  invoice,
  amountText,
  daysLate,
  buttonUrl,
}) {
  const lateText =
    daysLate > 0
      ? `${daysLate} day${daysLate === 1 ? "" : "s"} overdue`
      : "Overdue";
  return layout({
    theme: "danger",
    propertyName,
    preheader: `Invoice ${invoice.id} (₱${amountText}) was due ${invoice.due}.`,
    icon: "!",
    title: "Payment overdue",
    subtitle: `Hi ${name || "there"}, this is a friendly reminder.`,
    amountLabel: "Amount overdue",
    amountText,
    badge: lateText.toUpperCase(),
    rows: [
      row("Invoice", invoice.id),
      row("Billing period", invoice.period),
      row("Room", invoice.room),
      row("Was due on", invoice.due, "#b91c1c"),
    ].join(""),
    buttonUrl,
    buttonText: "Pay now",
    note: `${lateFeeNote ? `A late fee applies: ${lateFeeNote}.<br>` : ""}If you have already paid, please ignore this message.<br>Need more time? Reply to this email or talk to the admin.`,
  });
}

/* ---------- 4. Verification code / OTP (indigo) ---------- */
export function otpEmail({
  propertyName = "HausKeeper",
  name,
  code,
  expiresInMinutes = 10,
}) {
  const c = THEMES.info;
  const hero = `
        <tr>
          <td align="center" style="padding:32px 24px 8px;">
            <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};font-weight:600;">Your verification code</div>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px auto 14px;">
              <tr>
                <td align="center" bgcolor="${c.soft}"
                  style="background:${c.soft};border:2px dashed ${c.accent};border-radius:14px;padding:18px 28px;">
                  <span style="font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:38px;font-weight:800;letter-spacing:10px;color:${c.dark};">${esc(code)}</span>
                </td>
              </tr>
            </table>
            <div style="font-size:14px;color:${MUTED};line-height:1.6;">
              Enter this code on the sign-up page to verify your email.<br>
              It expires in <b style="color:${INK};">${esc(expiresInMinutes)} minutes</b>.
            </div>
          </td>
        </tr>`;

  return layout({
    theme: "info",
    propertyName,
    preheader: `Your ${propertyName} verification code is ${code}. It expires in ${expiresInMinutes} minutes.`,
    icon: "🔒",
    title: "Verify your email",
    subtitle: `Hi ${name || "there"}, welcome to ${propertyName}!`,
    hero,
    note: "Never share this code with anyone. Our staff will never ask for it.<br>If you didn’t try to register, you can safely ignore this email.",
  });
}

/* ---------- 5. Maintenance ticket (indigo / amber / green by status) ---------- */
const TICKET_STATUS = {
  open:          { theme: 'info',    icon: '🛠', title: 'Request received',   badge: 'OPEN',        blurb: 'We got your maintenance request and will review it shortly.' },
  'in-progress': { theme: 'warning', icon: '🔧', title: 'Work in progress',   badge: 'IN PROGRESS', blurb: 'Our team is working on your request.' },
  resolved:      { theme: 'success', icon: '✓',  title: 'Request resolved',   badge: 'RESOLVED',    blurb: 'Your request has been marked as resolved. If the problem is still there, please let us know.' },
};

const PRIORITY_COLOR = { low: '#15803d', medium: '#b45309', high: '#b91c1c' };

export function ticketEmail({ propertyName = 'HausKeeper', name, ticket, assignedName, buttonUrl }) {
  const s = TICKET_STATUS[ticket.status] || TICKET_STATUS.open;
  const c = THEMES[s.theme];

  const hero = `
        <tr>
          <td align="center" style="padding:32px 24px 8px;">
            <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};font-weight:600;">Maintenance request</div>
            <div style="font-size:24px;font-weight:800;color:${INK};margin:8px 0 14px;line-height:1.3;">${esc(ticket.title)}</div>
            <span style="display:inline-block;background:${c.soft};color:${c.dark};font-size:12px;font-weight:700;padding:5px 14px;border-radius:999px;letter-spacing:1px;">
              ● ${esc(s.badge)}
            </span>
            <div style="font-size:14px;color:${MUTED};line-height:1.6;margin-top:16px;">${esc(s.blurb)}</div>
          </td>
        </tr>`;

  const rows = [
    row('Ticket', ticket.id),
    row('Room', ticket.room),
    row('Category', ticket.category),
    row('Priority', String(ticket.priority || '').toUpperCase(), PRIORITY_COLOR[ticket.priority] || INK),
    assignedName ? row('Assigned to', assignedName) : '',
    row('Reported on', ticket.created),
    ticket.notes ? row('Notes', ticket.notes) : '',
  ].join('');

  return layout({
    theme: s.theme,
    propertyName,
    preheader: `${s.title}: ${ticket.title} (${ticket.id}).`,
    icon: s.icon,
    title: s.title,
    subtitle: `Hi ${name || 'there'}, here's an update on your request.`,
    hero,
    rows,
    buttonUrl,
    buttonText: 'View my requests',
    note: 'Need to add details? Reply to this email or message the admin.',
  });
}

// server/utils/emailTemplates.js  (EDIT)
// Paste this at the end of the file, after otpEmail.

/* ---------- 6. Password reset code (indigo) ---------- */
export function resetPasswordEmail({
  propertyName = "HausKeeper",
  name,
  code,
  expiresInMinutes = 10,
}) {
  const c = THEMES.info;
  const hero = `
        <tr>
          <td align="center" style="padding:32px 24px 8px;">
            <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};font-weight:600;">Your password reset code</div>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px auto 14px;">
              <tr>
                <td align="center" bgcolor="${c.soft}"
                  style="background:${c.soft};border:2px dashed ${c.accent};border-radius:14px;padding:18px 28px;">
                  <span style="font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:38px;font-weight:800;letter-spacing:10px;color:${c.dark};">${esc(code)}</span>
                </td>
              </tr>
            </table>
            <div style="font-size:14px;color:${MUTED};line-height:1.6;">
              Enter this code on the reset page to choose a new password.<br>
              It expires in <b style="color:${INK};">${esc(expiresInMinutes)} minutes</b>.
            </div>
          </td>
        </tr>`;

  return layout({
    theme: "info",
    propertyName,
    preheader: `Your ${propertyName} password reset code is ${code}. It expires in ${expiresInMinutes} minutes.`,
    icon: "🔑",
    title: "Reset your password",
    subtitle: `Hi ${name || "there"}, we got a request to reset your password.`,
    hero,
    note: "Never share this code with anyone. Our staff will never ask for it.<br>If you didn’t ask for this, you can safely ignore this email. Your password will not change.",
  });
}