import { Router } from "express";
import Tenant from "../models/Tenant.js";
import Staff from "../models/Staff.js";
import EmailOtp from "../models/EmailOtp.js";
import { signToken, requireAuth } from "../middleware/auth.js";
import { HttpError } from "../services/housing.js";
import { captchaEnabled, verifyCaptcha } from "../services/captcha.js";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { sendMail, mailConfigured } from "../services/mailer.js";
import { otpEmail, resetPasswordEmail } from "../utils/emailTemplates.js";
import PasswordReset from "../models/PasswordReset.js";
import getSettings from "../models/Settings.js";



const router = Router();

const tokenFor = (role, user) =>
  signToken({
    id: user.id,
    role,
    perms: role === "staff" ? user.perms : [],
  });

/* ---------- captcha ---------- */

// GET /api/auth/captcha-config → lets the login page know whether to show the reCAPTCHA box
router.get("/captcha-config", (_req, res) =>
  res.json({
    enabled: captchaEnabled(),
    siteKey: captchaEnabled() ? process.env.RECAPTCHA_SITE_KEY : null,
  }),
);

/* ---------- registration codes (OTP) ---------- */

const OTP_TTL_MS = 10 * 60 * 1000; // a code is valid for 10 minutes
const OTP_RESEND_MS = 60 * 1000; // at least 60 seconds between codes for one email
const OTP_MAX_ATTEMPTS = 5; // wrong guesses before the code is thrown away
const IP_LIMIT = 8; // codes requested per IP...
const IP_WINDOW_MS = 15 * 60 * 1000; // ...per 15 minutes (in memory; resets on restart)
const ipHits = new Map();

function ipLimit(ip) {
  const now = Date.now();
  const recent = (ipHits.get(ip) || []).filter((t) => now - t < IP_WINDOW_MS);
  if (recent.length >= IP_LIMIT)
    throw new HttpError(
      429,
      "Too many code requests. Please wait a few minutes.",
    );
  recent.push(now);
  ipHits.set(ip, recent);
}

const hashCode = (email, code) =>
  createHmac("sha256", process.env.JWT_SECRET || "dev")
    .update(`${email}:${code}`)
    .digest("hex");

// Same checks the form does, shared by "send code" and "create account"
function readSignup(body) {
  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const phone = (body.phone || "").trim();
  const { pass } = body;

  if (!name || !email || !pass)
    throw new HttpError(400, "Name, email, and password are required.");
  if (!/^\S+@\S+\.\S+$/.test(email))
    throw new HttpError(400, "Enter a valid email address.");
  if (pass.length < 4)
    throw new HttpError(400, "Password must be at least 4 characters.");
  return { name, email, phone, pass };
}

// POST /api/auth/register/otp   body: { name, email, phone, pass } → emails a 6-digit code
router.post("/register/otp", async (req, res) => {
  const { name, email } = readSignup(req.body);
  if (await Tenant.exists({ email }))
    throw new HttpError(409, "An account with that email already exists.");
  ipLimit(req.ip);

  const existing = await EmailOtp.findOne({ email });
  // a first request needs the captcha; "resend code" for a code that is still pending does not
  // (it can only go to the same address, and the 60 second wait below still applies)
  const resend = existing && existing.expiresAt > new Date();
  if (!resend) await verifyCaptcha(req.body.captcha, req.ip);
  if (existing && Date.now() - existing.sentAt.getTime() < OTP_RESEND_MS) {
    const wait = Math.ceil(
      (OTP_RESEND_MS - (Date.now() - existing.sentAt.getTime())) / 1000,
    );
    throw new HttpError(
      429,
      `Please wait ${wait} seconds before asking for a new code.`,
    );
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await EmailOtp.findOneAndUpdate(
    { email },
    {
      codeHash: hashCode(email, code),
      attempts: 0,
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
    { upsert: true },
  );

  const settings = await getSettings();
  
  const sent = await sendMail({
    to: email,
    subject: `Your ${settings.propertyName} verification code`,
    text: `Hi ${name.split(" ")[0]},\n\nYour ${settings.propertyName} verification code is ${code}.\nIt expires in 10 minutes. If you did not try to register, you can ignore this email.`,
    html: otpEmail({
      propertyName: settings.propertyName,
      name: name.split(" ")[0],
      code,
      expiresInMinutes: OTP_TTL_MS / 60000,
    }),
  }); res.json({ ok: true, emailed: !!sent });
});

// POST /api/auth/login   body: { role: 'tenant' | 'staff', identifier, password, captcha }
router.post("/login", async (req, res) => {
  const { role, identifier, password } = req.body;
  if (!identifier || !password)
    return res.status(400).json({ message: "Enter both fields." });
  await verifyCaptcha(req.body.captcha, req.ip);

  const id = String(identifier).trim().toLowerCase();
  const user =
    role === "staff"
      ? await Staff.findOne({ username: id }).select("+password")
      : await Tenant.findOne({ email: id }).select("+password");

  // Same message for "no such user" and "wrong password" on purpose
  if (!user || !(await user.checkPassword(password)))
    return res.status(401).json({ message: "Incorrect credentials." });

  if (user.status === "inactive")
    return res
      .status(403)
      .json({ message: "This account has been deactivated." });

  const r = role === "staff" ? "staff" : "tenant";
  res.json({ token: tokenFor(r, user), role: r, user });
});

// POST /api/auth/register   (tenant self-registration)   body: { name, email, phone, pass, otp }
router.post("/register", async (req, res) => {
  const { name, email, phone, pass } = readSignup(req.body);
  const otp = String(req.body.otp || "").trim();
  if (!/^\d{6}$/.test(otp))
    throw new HttpError(400, "Enter the 6-digit code from your email.");
  if (await Tenant.exists({ email }))
    throw new HttpError(409, "An account with that email already exists.");

  const pending = await EmailOtp.findOne({ email });
  if (!pending || pending.expiresAt < new Date())
    throw new HttpError(
      400,
      "That code has expired. Please request a new one.",
    );
  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    await pending.deleteOne();
    throw new HttpError(400, "Too many wrong codes. Please request a new one.");
  }
  const a = Buffer.from(pending.codeHash);
  const b = Buffer.from(hashCode(email, otp));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    pending.attempts += 1;
    await pending.save();
    throw new HttpError(
      400,
      "Incorrect code. Please check your email and try again.",
    );
  }

  const tenant = await Tenant.create({ name, email, phone, password: pass });
  await pending.deleteOne();
  res
    .status(201)
    .json({ token: tokenFor("tenant", tenant), role: "tenant", user: tenant });
});

// GET /api/auth/me   → restores the session after a page refresh
router.get("/me", requireAuth, async (req, res) => {
  const { id, role } = req.user;
  const user =
    role === "staff" ? await Staff.findById(id) : await Tenant.findById(id);
  if (!user || user.status === "inactive")
    return res.status(401).json({ message: "Account no longer active" });
  res.json({ role, user });
});

const hashResetCode = (email, code) =>
  createHmac("sha256", process.env.JWT_SECRET || "dev")
    .update(`reset:${email}:${code}`)
    .digest("hex");
 
const EMAIL_RX = /^\S+@\S+\.\S+$/;
 
// POST /api/auth/password/forgot   body: { email, captcha }
// Always answers { ok: true } whether or not the email has an account, so nobody can use it
// to find out who is registered. A row is stored either way so "resend" behaves the same.
router.post("/password/forgot", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!EMAIL_RX.test(email))
    throw new HttpError(400, "Enter a valid email address.");
  ipLimit(req.ip);
 
  const existing = await PasswordReset.findOne({ email });
  // first request needs the captcha; "resend" while a code is still pending does not
  const resend = existing && existing.expiresAt > new Date();
  if (!resend) await verifyCaptcha(req.body.captcha, req.ip);
  if (existing && Date.now() - existing.sentAt.getTime() < OTP_RESEND_MS) {
    const wait = Math.ceil(
      (OTP_RESEND_MS - (Date.now() - existing.sentAt.getTime())) / 1000,
    );
    throw new HttpError(
      429,
      `Please wait ${wait} seconds before asking for a new code.`,
    );
  }
 
  const tenant = await Tenant.findOne({ email });
  const eligible = !!tenant && tenant.status !== "inactive";
 
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await PasswordReset.findOneAndUpdate(
    { email },
    {
      // no account → store a random hash nobody can match
      codeHash: eligible ? hashResetCode(email, code) : randomBytes(32).toString("hex"),
      attempts: 0,
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
    { upsert: true },
  );
 
  let sent = false;
  if (eligible) {
    const settings = await getSettings();
    const firstName = tenant.name.split(" ")[0];
    sent = await sendMail({
      to: email,
      subject: `Reset your ${settings.propertyName} password`,
      text: `Hi ${firstName},\n\nYour ${settings.propertyName} password reset code is ${code}.\nIt expires in 10 minutes. If you did not ask to reset your password, you can ignore this email and your password will stay the same.`,
      html: resetPasswordEmail({
        propertyName: settings.propertyName,
        name: firstName,
        code,
        expiresInMinutes: OTP_TTL_MS / 60000,
      }),
    });
  }
  res.json({ ok: true, emailed: eligible ? !!sent : mailConfigured() });
});
 
// POST /api/auth/password/reset   body: { email, otp, pass }
router.post("/password/reset", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const otp = String(req.body.otp || "").trim();
  const { pass } = req.body;
 
  if (!EMAIL_RX.test(email))
    throw new HttpError(400, "Enter a valid email address.");
  if (!/^\d{6}$/.test(otp))
    throw new HttpError(400, "Enter the 6-digit code from your email.");
  if (!pass || pass.length < 4)
    throw new HttpError(400, "Password must be at least 4 characters.");
 
  const pending = await PasswordReset.findOne({ email });
  if (!pending || pending.expiresAt < new Date())
    throw new HttpError(400, "That code has expired. Please request a new one.");
  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    await pending.deleteOne();
    throw new HttpError(400, "Too many wrong codes. Please request a new one.");
  }
  const a = Buffer.from(pending.codeHash);
  const b = Buffer.from(hashResetCode(email, otp));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    pending.attempts += 1;
    await pending.save();
    throw new HttpError(
      400,
      "Incorrect code. Please check your email and try again.",
    );
  }
 
  const tenant = await Tenant.findOne({ email });
  if (!tenant || tenant.status === "inactive")
    throw new HttpError(400, "That code has expired. Please request a new one.");
 
  tenant.password = pass; // hashed by the pre-save hook in Tenant.js
  await tenant.save();
  await pending.deleteOne();
  res.json({ message: "Password updated. You can now sign in." });
});



export default router;
