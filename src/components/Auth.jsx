import React, { useState } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { peso } from "../data.js";
import { StatusPill } from "./Common.jsx";
import { useAuth, portalHome } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { useApi } from "../useApi.js";

export function HomeScreen() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { data: rooms, loading } = useApi("/rooms?status=available");
  const { data: settings } = useApi("/settings/public");
  const available = (rooms || []).slice(0, 3);

  const goHome = () => navigate("/");
  const scrollToRooms = () =>
    document
      .getElementById("roomsPreview")
      ?.scrollIntoView({ behavior: "smooth" });
  const goAuth = (tab) => {
    if (role === "tenant" && tab === "tenant") return navigate("/tenant/rooms");
    if (role === "staff" && tab === "admin")
      return navigate("/admin/dashboard");
    navigate(`/login?role=${tab}`);
  };

  return (
    <div className="home">
      <div className="home-nav">
        <div className="brand" onClick={goHome}>
          <div className="mark">🗝</div>
          <div>
            <div className="brand-name">HausKeeper</div>
          </div>
        </div>
        <div className="links">
          <button className="active" onClick={goHome}>
            Home
          </button>
          <button onClick={scrollToRooms}>Rooms</button>
          <button onClick={() => goAuth("admin")}>Admin</button>
        </div>
        <button className="btn brass" onClick={() => goAuth("tenant")}>
          Find a room
        </button>
      </div>

      <div className="home-hero">
        <div>
          <span className="eyebrow">Room &amp; tenant management</span>
          <h1>
            A room ready.
            <br />A key waiting.
          </h1>
          <p className="lede">
            HausKeeper keeps every room, tenant, and payment in one ledger — so
            move-in day takes minutes, not paperwork.
          </p>
          <div className="cta-row">
            <button className="btn brass" onClick={() => goAuth("tenant")}>
              Find a room
            </button>
            <button className="btn secondary" onClick={() => goAuth("admin")}>
              Admin sign in
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="tilt-card tilt-card-1">
            <div className="ring">🗝</div>
            <div className="room-label">Room</div>
            <div className="room-num">101</div>
            <span className="pill ok">Available</span>
          </div>
          <div className="tilt-card tilt-card-2">
            <div className="ring">🗝</div>
            <div className="room-label">Room</div>
            <div className="room-num">104</div>
            <span className="pill warn">1 spot left</span>
          </div>
          <div className="tilt-card tilt-card-3">
            <div className="ring">🗝</div>
            <div className="room-label">Room</div>
            <div className="room-num">207</div>
            <span className="pill bad">Occupied</span>
          </div>
        </div>
      </div>

      <div className="how-section">
        <div className="how-inner">
          <span className="eyebrow">How it works</span>
          <div className="how-grid">
            <div className="how-step">
              <div className="step-num">01 — browse</div>
              <h3>Pick a room</h3>
              <p>
                Filter by type, price, and availability, then reserve on the
                spot.
              </p>
            </div>
            <div className="how-step">
              <div className="step-num">02 — move in</div>
              <h3>Sign &amp; settle</h3>
              <p>Register your details, pay the deposit, and get your key.</p>
            </div>
            <div className="how-step">
              <div className="step-num">03 — stay</div>
              <h3>Pay &amp; request</h3>
              <p>Handle rent and maintenance requests from one place.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rooms-preview" id="roomsPreview">
        <div className="rooms-preview-head">
          <div>
            <span className="eyebrow">Available now</span>
            <h2>Rooms ready to move into</h2>
          </div>
          <button className="btn secondary" onClick={() => goAuth("tenant")}>
            Sign in to reserve
          </button>
        </div>
        {loading && !rooms ? (
          <div className="empty">
            <p>Loading rooms…</p>
          </div>
        ) : available.length ? (
          <div className="rooms-preview-grid">
            {available.map((r) => (
              <div className="rp-card" key={r.id}>
                <div className="ring">①</div>
                <div className="room-label">Room · {r.type}</div>
                <div className="room-num">{r.id.replace("R-", "")}</div>
                <div className="rp-meta">
                  {r.beds} bed{r.beds > 1 ? "s" : ""} · Floor {r.floor} ·{" "}
                  {r.amenities.slice(0, 2).join(", ")}
                </div>
                <div className="rp-price">
                  {peso(r.price)}
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--slate)",
                      fontWeight: 400,
                    }}
                  >
                    {" "}
                    /mo
                  </span>
                </div>
                <button className="btn brass" onClick={() => goAuth("tenant")}>
                  Find a room
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <h3>No vacancies right now</h3>
            <p>Check back soon or contact the front desk.</p>
          </div>
        )}
      </div>

      <div className="home-footer">
        <p>{settings?.propertyName}</p>
      </div>
    </div>
  );
}

export function LoginScreen() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('role') === 'admin' ? 'admin' : 'tenant';
  const { role, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [idVal, setIdVal] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // already signed in (or just signed in) → go where they were headed, or to their dashboard
  if (role) {
    const base = role === 'staff' ? '/admin' : '/tenant';
    const from = location.state?.from;
    const target = from?.pathname?.startsWith(base + '/')
      ? from.pathname + (from.search || '')
      : portalHome(role);
    return <Navigate to={target} replace />;
  }

  const setTab = (t) => {
    setParams({ role: t }, { replace: true });
    setError('');
  };

  const submit = async () => {
    if (!idVal.trim() || !pass) {
      setError(tab === 'tenant' ? 'Enter both email and password.' : 'Enter both username and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const user = await login(tab === 'admin' ? 'staff' : 'tenant', idVal, pass);
      toast(tab === 'tenant' ? `Welcome back, ${user.name.split(' ')[0]}` : `Signed in as ${user.name}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="card-pad" style={{ paddingTop: 30 }}>
          <button className="linklike" style={{ marginBottom: 14 }} onClick={() => navigate('/')}>&larr; Back to home</button>
          <h1 style={{ fontSize: 20, marginBottom: 4 }}>HausKeeper</h1>
          <p style={{ color: 'var(--slate)', fontFamily: 'var(--mono)', fontSize: 10.5, margin: '-2px 0 6px' }}>boardinghouse management system</p>
          <p style={{ color: 'var(--slate)', fontFamily: 'var(--mono)', fontSize: 12, margin: '6px 0 20px' }}>sign in to continue — role determines which portal loads</p>

          <div className="steps" style={{ marginBottom: 20 }}>
            <div className={`step ${tab === 'tenant' ? 'active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('tenant')}>tenant login</div>
            <div className={`step ${tab === 'admin' ? 'active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setTab('admin')}>staff / admin login</div>
          </div>

          <div className="field">
            <label>{tab === 'tenant' ? 'Email' : 'Username'}</label>
            <input
              type="text"
              placeholder={tab === 'tenant' ? 'name@gmail.com' : 'staff or admin'}
              value={idVal}
              onChange={(e) => setIdVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
          </div>

          {error ? <div className="pill bad" style={{ marginBottom: 14 }}>{error}</div> : null}

          <button className="btn brass" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={submit} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {tab === 'tenant' ? (
            <p className="switch-line">no account? <button className="linklike" style={{ fontSize: 11.5 }} onClick={() => navigate('/register')}>register here</button></p>
          ) : (
            <p className="switch-line">staff accounts are created by a property manager in Settings → Staff.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function RegisterScreen() {
  const { role, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', pass: '', pass2: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setF((s) => ({ ...s, [key]: e.target.value }));

  // signed in (including right after registering) → straight to the room finder
  if (role) return <Navigate to={role === 'staff' ? '/admin/dashboard' : '/tenant/rooms'} replace />;

  const submit = async () => {
    const name = f.name.trim();
    const email = f.email.trim().toLowerCase();
    if (!name || !email || !f.pass) return setError('Name, email, and password are required.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.');
    if (f.pass.length < 4) return setError('Password must be at least 4 characters.');
    if (f.pass !== f.pass2) return setError('Passwords do not match.');

    setBusy(true);
    setError('');
    try {
      await register({ name, email, phone: f.phone.trim(), pass: f.pass });
      toast(`Account created — welcome, ${name.split(' ')[0]}. Pick a room to get started.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="card-pad" style={{ paddingTop: 30 }}>
          <button className="linklike" style={{ marginBottom: 14 }} onClick={() => navigate('/')}>&larr; Back to home</button>
          <h1 style={{ fontSize: 20, marginBottom: 4 }}>HausKeeper</h1>
          <p style={{ color: 'var(--slate)', fontFamily: 'var(--mono)', fontSize: 10.5, margin: '-2px 0 6px' }}>boardinghouse management system</p>
          <p style={{ color: 'var(--slate)', fontFamily: 'var(--mono)', fontSize: 12, margin: '6px 0 20px' }}>create a tenant account — admin accounts are issued by property staff</p>

          <div className="field"><label>Full name</label><input value={f.name} onChange={set('name')} placeholder="Juan Dela Cruz" /></div>
          <div className="field"><label>Email</label><input value={f.email} onChange={set('email')} placeholder="juan.delacruz@gmail.com" /></div>
          <div className="field"><label>Phone</label><input value={f.phone} onChange={set('phone')} placeholder="0917 000 0000" /></div>
          <div className="field-row">
            <div className="field"><label>Password</label><input type="password" value={f.pass} onChange={set('pass')} placeholder="••••••••" /></div>
            <div className="field">
              <label>Confirm password</label>
              <input
                type="password"
                value={f.pass2}
                onChange={set('pass2')}
                placeholder="••••••••"
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              />
            </div>
          </div>

          {error ? <div className="pill bad" style={{ marginBottom: 14 }}>{error}</div> : null}

          <button className="btn brass" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={submit} disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <p className="switch-line">already have an account? <button className="linklike" style={{ fontSize: 11.5 }} onClick={() => navigate('/login')}>sign in</button></p>
        </div>
      </div>
    </div>
  );
}
