// Sends plain emails through SMTP (Gmail works with an "app password").
//   SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_USER=you@gmail.com  SMTP_PASS=<16-letter app password>
//   MAIL_FROM="HausKeeper <you@gmail.com>"   (optional)
// These are the same variables the notification system already uses.
import { HttpError } from './housing.js';

export const mailConfigured = () => !!process.env.SMTP_HOST;

let transport;
async function getTransport() {
  if (transport) return transport;
  const { default: nodemailer } = await import('nodemailer');
  const port = Number(process.env.SMTP_PORT) || 587;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

// Returns true if the email was sent. When SMTP is not set up (development), the message is printed
// in the server console instead and false is returned. In production a missing setup is an error.
export async function sendMail({ to, subject, text, html }) {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV === 'production') throw new HttpError(503, 'Email is not set up on the server.');
    console.log(`\n[mail:not configured] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return false;
  }
  try {
    const t = await getTransport();
    await t.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    });
    return true;
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    throw new HttpError(502, 'Could not send the email. Check the address and try again.');
  }
}