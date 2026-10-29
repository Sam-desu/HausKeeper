const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';

const THEMES = {
  success: { accent: '#16a34a', dark: '#15803d', soft: '#dcfce7', light: '#d1fae5' },
  danger:  { accent: '#dc2626', dark: '#b91c1c', soft: '#fee2e2', light: '#fecaca' },
  info:    { accent: '#4f46e5', dark: '#4338ca', soft: '#e0e7ff', light: '#c7d2fe' },
};

const row = (label, value, valueColor = INK) => `
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${MUTED};">${esc(label)}</td>
    <td align="right" style="padding:12px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${valueColor};font-weight:600;">${esc(value)}</td>
  </tr>`;

function layout({
  theme, propertyName, preheader, icon, title, subtitle,
  amountLabel, amountText, badge, rows, buttonUrl, buttonText, note,
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

        <tr>
          <td align="center" style="padding:32px 24px 8px;">
            <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};font-weight:600;">${esc(amountLabel)}</div>
            <div style="font-size:44px;font-weight:800;color:${INK};margin:6px 0 10px;">₱${esc(amountText)}</div>
            <span style="display:inline-block;background:${c.soft};color:${c.dark};font-size:12px;font-weight:700;padding:5px 14px;border-radius:999px;letter-spacing:1px;">
              ● ${esc(badge)}
            </span>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          </td>
        </tr>

        ${buttonUrl ? `
        <tr>
          <td align="center" style="padding:28px 32px 36px;">
            <a href="${esc(buttonUrl)}"
              style="display:inline-block;background:${c.accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;">
              ${esc(buttonText)}
            </a>
          </td>
        </tr>` : '<tr><td style="padding-bottom:28px;"></td></tr>'}

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
export function paymentReceiptEmail({ propertyName = 'HausKeeper', name, invoice, methodLabel, amountText, buttonUrl }) {
  return layout({
    theme: 'success',
    propertyName,
    preheader: `We received your ₱${amountText} payment for invoice ${invoice.id}.`,
    icon: '✓',
    title: 'Payment received',
    subtitle: `Thank you, ${name || 'there'}!`,
    amountLabel: 'Amount paid',
    amountText,
    badge: 'PAID',
    rows: [
      row('Invoice', invoice.id),
      row('Billing period', invoice.period),
      row('Room', invoice.room),
      row('Payment method', methodLabel || '—'),
      row('Paid on', invoice.paidOn),
    ].join(''),
    buttonUrl,
    buttonText: 'View billing history',
    note: 'Keep this email as your payment receipt.<br>Questions? Just reply to this email or message the admin.',
  });
}

/* ---------- 2. New invoice (indigo) ---------- */
export function newInvoiceEmail({ propertyName = 'HausKeeper', name, invoice, amountText, buttonUrl }) {
  return layout({
    theme: 'info',
    propertyName,
    preheader: `Invoice ${invoice.id}: ₱${amountText} due ${invoice.due}.`,
    icon: '🧾',
    title: 'New invoice',
    subtitle: `Hi ${name || 'there'}, your invoice is ready.`,
    amountLabel: 'Amount due',
    amountText,
    badge: 'UNPAID',
    rows: [
      row('Invoice', invoice.id),
      row('Billing period', invoice.period),
      row('Room', invoice.room),
      row('Due date', invoice.due, '#4338ca'),
    ].join(''),
    buttonUrl,
    buttonText: 'View & pay invoice',
    note: 'Please pay on or before the due date to avoid a late notice.<br>Questions? Just reply to this email or message the admin.',
  });
}

/* ---------- 3. Overdue notice (red) ---------- */
export function overdueEmail({ propertyName = 'HausKeeper', name, invoice, amountText, daysLate, buttonUrl }) {
  const lateText = daysLate > 0 ? `${daysLate} day${daysLate === 1 ? '' : 's'} overdue` : 'Overdue';
  return layout({
    theme: 'danger',
    propertyName,
    preheader: `Invoice ${invoice.id} (₱${amountText}) was due ${invoice.due}.`,
    icon: '!',
    title: 'Payment overdue',
    subtitle: `Hi ${name || 'there'}, this is a friendly reminder.`,
    amountLabel: 'Amount overdue',
    amountText,
    badge: lateText.toUpperCase(),
    rows: [
      row('Invoice', invoice.id),
      row('Billing period', invoice.period),
      row('Room', invoice.room),
      row('Was due on', invoice.due, '#b91c1c'),
    ].join(''),
    buttonUrl,
    buttonText: 'Pay now',
    note: 'If you have already paid, please ignore this message.<br>Need more time? Reply to this email or talk to the admin.',
  });
}