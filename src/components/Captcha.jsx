import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { api } from '../api.js';

// Google reCAPTCHA v2 checkbox. The site key comes from the server (RECAPTCHA_SITE_KEY in .env),
// so nothing needs rebuilding. If no key is set, the component shows nothing and the login works as before.
//   <Captcha ref={ref} onChange={setToken} onConfig={setEnabled} />
//   ref.current.reset() clears the tick (a token only works once, so call it after a failed sign-in)

const SRC = 'https://www.google.com/recaptcha/api.js?render=explicit';
let scriptPromise;

// Loads Google's script once and resolves when grecaptcha.render is really ready.
function loadScript() {
  if (window.grecaptcha?.render) return Promise.resolve(window.grecaptcha);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const fail = (msg) => {
      scriptPromise = null; // allow a retry
      document.querySelectorAll('script[data-hk-captcha]').forEach((n) => n.remove());
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail('Google reCAPTCHA took too long to load'), 15000);

    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.dataset.hkCaptcha = '1';
    s.onload = () => {
      // api.js has run; ready() fires once render() can be used
      const g = window.grecaptcha;
      if (!g?.ready) return fail('Google reCAPTCHA loaded but is not usable');
      g.ready(() => { clearTimeout(timer); resolve(window.grecaptcha); });
    };
    s.onerror = () => { clearTimeout(timer); fail('The reCAPTCHA script was blocked or could not be reached (ad blocker, network or firewall?)'); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Wipes every trace of Google's script so the next loadScript() starts from scratch.
// Used when drawing the widget a second time fails (Google's script keeps state about widgets
// whose page elements React has already removed).
function hardReset() {
  document.querySelectorAll('script[src*="recaptcha"]').forEach((n) => n.remove());
  try { delete window.grecaptcha; } catch { window.grecaptcha = undefined; }
  try { delete window.___grecaptcha_cfg; } catch { window.___grecaptcha_cfg = undefined; }
  scriptPromise = null;
}

const Captcha = forwardRef(function Captcha({ onChange, onConfig }, ref) {
  const box = useRef(null);
  const widget = useRef(null);
  const cb = useRef({ onChange, onConfig });
  cb.current = { onChange, onConfig };
  const [cfg, setCfg] = useState(null);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);

  useImperativeHandle(ref, () => ({
    reset() {
      cb.current.onChange?.(null);
      if (widget.current !== null && window.grecaptcha?.reset) {
        try { window.grecaptcha.reset(widget.current); } catch { /* widget already gone */ }
      }
    },
  }));

  useEffect(() => {
    api.get('/auth/captcha-config')
      .then((c) => { setCfg(c); cb.current.onConfig?.(!!c.enabled); })
      .catch(() => { setCfg({ enabled: false }); cb.current.onConfig?.(false); });
  }, []);

  const draw = useCallback(() => {
    if (!cfg?.enabled) return undefined;
    let dead = false;
    const el = box.current;
    setProblem('');

    // always draw into a brand-new element, so Google never sees a container it has used before
    const renderInto = (g) => {
      const holder = document.createElement('div');
      el.innerHTML = '';
      el.appendChild(holder);
      return g.render(holder, {
        sitekey: cfg.siteKey,
        callback: (t) => cb.current.onChange?.(t),
        'expired-callback': () => cb.current.onChange?.(null),
        'error-callback': () => cb.current.onChange?.(null),
      });
    };

    (async () => {
      let g = await loadScript();
      if (dead || !el) return;
      try {
        widget.current = renderInto(g);
      } catch (first) {
        console.warn('[captcha] first draw failed, reloading Google script:', first);
        hardReset();
        g = await loadScript();
        if (dead || !el) return;
        widget.current = renderInto(g);
      }
    })().catch((err) => {
      console.error('[captcha]', err);
      if (!dead) setProblem(err.message || 'Could not load the captcha.');
    });

    return () => {
      dead = true;
      widget.current = null;
      if (el) el.innerHTML = '';
    };
  }, [cfg]);

  useEffect(() => draw(), [draw, attempt]);

  if (!cfg?.enabled) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div ref={box} />
      {problem ? (
        <div className="pill bad" style={{ display: 'block' }}>
          Could not load the captcha. {problem}{' '}
          <button type="button" className="linklike" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      ) : null}
    </div>
  );
});

export default Captcha;
