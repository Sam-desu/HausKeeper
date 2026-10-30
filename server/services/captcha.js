import { HttpError } from './housing.js';

// Google reCAPTCHA v2 ("I'm not a robot" checkbox).
// Set RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET in .env to turn it on. Without them the login works as before.
export const captchaEnabled = () => !!(process.env.RECAPTCHA_SITE_KEY && process.env.RECAPTCHA_SECRET);

export async function verifyCaptcha(token, ip) {
  if (!captchaEnabled()) return;
  if (!token || typeof token !== 'string') throw new HttpError(400, 'Please tick "I\'m not a robot".');

  let data;
  try {
    const body = new URLSearchParams({ secret: process.env.RECAPTCHA_SECRET, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body });
    data = await res.json();
  } catch {
    throw new HttpError(503, 'Could not check the captcha. Please try again.');
  }
  if (!data.success) throw new HttpError(400, 'Captcha check failed. Please try again.');
}
