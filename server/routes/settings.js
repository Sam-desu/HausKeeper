import { Router } from "express";
import { getSettings } from "../models/Settings.js";
import { requireStaff } from "../middleware/auth.js";
import { emailConfigured, smsConfigured } from "../services/notify.js";
import { HttpError } from "../services/housing.js";
import { lateFeeLabel, applyLateFees } from "../services/lateFees.js";

const router = Router();

// GET /api/settings/public: safe for the home page footer and the staff dashboard header
router.get("/public", async (_req, res) => {
  const s = await getSettings();
  res.json({ propertyName: s.propertyName, address: s.address });
});

// Tells the Settings page whether the .env credentials for each channel are in place
const withChannelStatus = (s) => ({
  ...s.toJSON(),
  channelStatus: { email: emailConfigured(), sms: smsConfigured() },
});

// GET /api/settings
router.get("/", requireStaff("settings"), async (_req, res) => {
  res.json(withChannelStatus(await getSettings()));
});

// PUT /api/settings   body: any of the fields; notifTemplates may be partial
router.put("/", requireStaff("settings"), async (req, res) => {
  const s = await getSettings();

  for (const key of ["propertyName", "address"]) {
    if (req.body[key] === undefined) continue;
    const value = String(req.body[key]).trim();
    if (key === "propertyName" && !value)
      throw new HttpError(400, "Property name is required");
    s.set(key, value);
  }

  const templates = req.body.notifTemplates;
  if (templates && typeof templates === "object") {
    for (const key of ["invoice", "overdue", "ticket"]) {
      if (templates[key] !== undefined)
        s.set(`notifTemplates.${key}`, String(templates[key]));
    }
  }

  const channels = req.body.notifChannels;
  if (channels && typeof channels === "object") {
    for (const key of ["email", "sms"]) {
      if (channels[key] === undefined) continue;
      if (typeof channels[key] !== "boolean")
        throw new HttpError(400, `Invalid value for ${key}`);
      s.set(`notifChannels.${key}`, channels[key]);
    }
  }
  const intField = (key, min, max, label) => {
    if (req.body[key] === undefined) return;
    const n = Number(req.body[key]);
    if (!Number.isInteger(n) || n < min || n > max)
      throw new HttpError(
        400,
        `${label} must be a whole number from ${min} to ${max}`,
      );
    s.set(key, n);
  };
  intField("billingDueDay", 1, 31, "Due day");
  intField("invoiceLeadDays", 0, 28, "Send-ahead days");

  if (req.body.autoInvoice !== undefined) {
    if (typeof req.body.autoInvoice !== "boolean")
      throw new HttpError(400, "Invalid value for autoInvoice");
    s.set("autoInvoice", req.body.autoInvoice);
  }

  // keep the display label in sync with the real due day
  if (s.isModified("billingDueDay")) {
    const d = s.billingDueDay;
    const suffix =
      d % 100 >= 11 && d % 100 <= 13
        ? "th"
        : ["th", "st", "nd", "rd"][d % 10] || "th";
    s.set("billingCycle", `Monthly, due on the ${d}${suffix}`);
  }

  const numField = (key, max, label) => {
    if (req.body[key] === undefined) return;
    const n = Number(req.body[key]);
    if (!Number.isFinite(n) || n < 0 || n > max)
      throw new HttpError(400, `${label} must be between 0 and ${max}`);
    s.set(key, Math.round(n * 100) / 100);
  };
  numField("lateFeeFlat", 100000, "Flat fee");
  numField("lateFeeWeeklyPct", 100, "Weekly percentage");
  numField("lateFeeCap", 1000000, "Maximum fee");
  intField("lateFeeGraceDays", 0, 30, "Grace days");
  if (req.body.lateFeeEnabled !== undefined) {
    if (typeof req.body.lateFeeEnabled !== "boolean")
      throw new HttpError(400, "Invalid value for lateFeeEnabled");
    s.set("lateFeeEnabled", req.body.lateFeeEnabled);
  }
  if (
    [
      "lateFeeEnabled",
      "lateFeeFlat",
      "lateFeeWeeklyPct",
      "lateFeeGraceDays",
      "lateFeeCap",
    ].some((k) => s.isModified(k))
  )
    s.set("lateFee", lateFeeLabel(s));

  // POST /api/settings/late-fees/preview: what would be charged right now (ignores the on/off switch)
  router.post(
    "/late-fees/preview",
    requireStaff("settings"),
    async (_req, res) => {
      res.json(await applyLateFees({ dryRun: true, ignoreEnabled: true }));
    },
  );

  await s.save(); // schema length limits are enforced here and return 400
  res.json(withChannelStatus(s));
});

// POST /api/settings/late-fees/preview: what would be charged right now (ignores the on/off switch)
router.post('/late-fees/preview', requireStaff('settings'), async (_req, res) => {
  res.json(await applyLateFees({ dryRun: true, ignoreEnabled: true }));
});

export default router;
