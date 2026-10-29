import Notification from '../models/Notification.js';
import Tenant from '../models/Tenant.js';
import Staff from '../models/Staff.js';
import { getSettings } from '../models/Settings.js';

// Every notification is saved in-app (the bell). Email and SMS are extra channels the admin
// can switch on in Settings. Nothing here ever throws, so a failed text never breaks a payment.

export const emailConfigured = () => !!process.env.SMTP_HOST;
export const smsConfigured = () => !!process.env.SEMAPHORE_API_KEY;

// "Hi {name}, ..." → fills {name}, {period}, {amount}, {due}, {title}, {status}; unknown {tags} stay as typed
export const fill = (tpl, vars) =>
  String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));

export const peso = (n) => Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/* ---------- email (SMTP via nodemailer) ---------- */

let transport; // undefined = not tried yet, null = unavailable
async function getTransport() {
  if (transport !== undefined) return transport;
  transport = null;
  if (!emailConfigured()) return transport;
  try {
    const { default: nodemailer } = await import('nodemailer');
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } catch {
    console.error('[notify] Email is configured but nodemailer is not installed. Run: npm install');
  }
  return transport;
}

async function sendEmail(to, subject, text, html) {
  const t = await getTransport();
  if (!t) return;
  await t.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });
}

/* ---------- SMS (Semaphore, a Philippine SMS provider) ---------- */

async function sendSms(number, message) {
  const body = new URLSearchParams({ apikey: process.env.SEMAPHORE_API_KEY, number, message });
  if (process.env.SEMAPHORE_SENDER) body.set('sendername', process.env.SEMAPHORE_SENDER);
  const res = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', body });
  if (!res.ok) throw new Error(`Semaphore replied ${res.status}`);
}

/* ---------- public helpers ---------- */

// opts: { type, title, link, message }  or  { type, title, link, template: 'invoice'|'overdue'|'ticket', vars }
export async function notifyTenant(tenantId, opts) {
  try {
    const [tenant, settings] = await Promise.all([Tenant.findById(tenantId), getSettings()]);
    if (!tenant) return;

    const message = opts.template
      ? fill(settings.notifTemplates[opts.template], { name: tenant.name, ...opts.vars })
      : opts.message;
    const html = typeof opts.html === 'function' ? opts.html(tenant, settings) : opts.html;

    await Notification.create({
      recipientType: 'tenant',
      recipient: tenant._id,
      type: opts.type || 'info',
      title: opts.title,
      body: message,
      link: opts.link || '',
    });

    const sends = [];
    if (settings.notifChannels?.email && emailConfigured() && tenant.email)
  sends.push(sendEmail(tenant.email, `${settings.propertyName}: ${opts.title}`, message, html));
    if (settings.notifChannels?.sms && smsConfigured() && tenant.phone)
      sends.push(sendSms(tenant.phone, message));
    for (const r of await Promise.allSettled(sends))
      if (r.status === 'rejected') console.error('[notify] delivery failed:', r.reason?.message);
  } catch (err) {
    console.error('[notify] tenant notification failed:', err.message);
  }
}

async function notifyStaffIds(ids, opts) {
  if (!ids.length) return;
  await Notification.insertMany(
    ids.map((id) => ({
      recipientType: 'staff',
      recipient: id,
      type: opts.type || 'info',
      title: opts.title,
      body: opts.message || '',
      link: opts.link || '',
    }))
  );
}

// Everyone who holds a permission (e.g. 'billing' or 'maintenance'). In-app only: staff have no email on file.
export async function notifyStaff(perm, opts) {
  try {
    const staff = await Staff.find({ perms: perm }).select('_id');
    await notifyStaffIds(staff.map((s) => s._id), opts);
  } catch (err) {
    console.error('[notify] staff notification failed:', err.message);
  }
}

export async function notifyStaffMember(staffId, opts) {
  try {
    await notifyStaffIds([staffId], opts);
  } catch (err) {
    console.error('[notify] staff notification failed:', err.message);
  }
}
