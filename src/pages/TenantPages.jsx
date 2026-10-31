import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { peso, METHOD_LABELS } from "../data.js";
import { StatusPill, PhoneInput } from "../components/Common.jsx";
import { NewTicketBody, HouseRulesModal } from "../components/Modals.jsx";
import { useApi } from "../useApi.js";
import { GOV_ID_TYPES, govIdError, splitGovId } from "../govIdRules.js";
import { checkPhone, splitEmergency, joinEmergency } from "../utils/phone.js";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { useModal } from "../context/ModalContext.jsx";

/* ---------------- small shared helpers ---------------- */

// YYYY-MM-DD in the browser's local time (matches what a date input produces)
const todayLocal = () => new Date().toLocaleDateString("en-CA");
const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const Loading = () => (
  <div className="empty">
    <p>Loading…</p>
  </div>
);

function LoadError({ title = "Couldn't load this page", error, onRetry }) {
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

/* ---------------- dashboard ---------------- */

export function TenantDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const inv = useApi("/invoices/mine");
  const tix = useApi("/tickets/mine");
  const res = useApi("/reservations/mine");
  const form = useApi("/move-in/mine");
  const room = useApi(
    user.room ? `/rooms/${encodeURIComponent(user.room)}` : null,
  );
  const [busy, setBusy] = useState(false);

  if ((inv.loading && !inv.data) || (tix.loading && !tix.data))
    return <Loading />;
  if (inv.error || tix.error)
    return (
      <LoadError
        error={inv.error || tix.error}
        onRetry={() => {
          inv.reload();
          tix.reload();
        }}
      />
    );

  const invoices = inv.data || [];
  const tickets = tix.data || [];
  const unpaid = invoices.filter((i) => i.status !== "paid");
  const openBal = unpaid.reduce((s, i) => s + i.amount, 0);
  const hasOverdue = unpaid.some((i) => i.status === "overdue");
  // the server derives "overdue" from due dates, so show that instead of a stored flag
  const status = hasOverdue
    ? "overdue"
    : user.status === "overdue"
      ? "active"
      : user.status;

  const pending = (res.data || []).find((r) => r.status === "pending");
  const moveInForm = form.data;
  const roomInfo = room.data;
  const needsMoveIn =
    !form.loading &&
    (pending || user.room) &&
    (!moveInForm || moveInForm.status === "rejected");

  const cancelReservation = async () => {
    setBusy(true);
    try {
      await api.post(`/reservations/mine/${pending.id}/cancel`);
      toast("Reservation cancelled");
      res.reload();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Welcome back</span>
          <h1>{user.name.split(" ")[0]}'s dashboard</h1>
          <p>Here's what's happening with your room and account this week.</p>
        </div>
        <button
          className="btn brass"
          onClick={() => navigate("/tenant/billing")}
        >
          Pay balance
        </button>
      </div>

      {pending ? (
        <div
          className="card card-pad"
          style={{
            background: "var(--brass-tint)",
            borderColor: "var(--brass)",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong>Room {pending.room} is held for you</strong>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>
              Move-in {pending.moveInDate} · {pending.lease} lease · hold ends{" "}
              {fmtDateTime(pending.holdUntil)}. Staff will confirm your move-in
              before then.
            </div>
          </div>
          <button
            className="btn secondary small"
            onClick={cancelReservation}
            disabled={busy}
          >
            {busy ? "Cancelling…" : "Cancel reservation"}
          </button>
        </div>
      ) : null}

      {needsMoveIn ? (
        <div
          className="card card-pad"
          style={{
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <strong>
              {moveInForm?.status === "rejected"
                ? "Your move-in form needs changes"
                : "Complete your move-in form"}
            </strong>
            <div
              style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 4 }}
            >
              {moveInForm?.status === "rejected"
                ? moveInForm.reviewNote
                : "Staff might need your details and a copy of your ID."}
            </div>
          </div>
          <button
            className="btn brass small"
            onClick={() => navigate("/tenant/move-in")}
          >
            {moveInForm ? "Fix and resubmit" : "Fill in the form"}
          </button>
        </div>
      ) : null}

      <div className="grid grid-4">
        <div className="card kpi">
          <span className="eyebrow">Room</span>
          <div className="val">{user.room || "—"}</div>
          <div className="delta">
            {roomInfo
              ? `${roomInfo.type} · Floor ${roomInfo.floor}`
              : user.room
                ? ""
                : pending
                  ? `Reserved: ${pending.room}`
                  : "Not assigned"}
          </div>
        </div>
        <div className="card kpi">
          <span className="eyebrow">Balance due</span>
          <div className="val">{peso(openBal)}</div>
          <div className={`delta ${openBal > 0 ? "down" : "up"}`}>
            {hasOverdue
              ? "Payment overdue"
              : openBal > 0
                ? "Payment pending"
                : "All settled"}
          </div>
        </div>
        <div className="card kpi">
          <span className="eyebrow">Open tickets</span>
          <div className="val">
            {tickets.filter((x) => x.status !== "resolved").length}
          </div>
          <div className="delta">of {tickets.length} total filed</div>
        </div>
        <div className="card kpi">
          <span className="eyebrow">Resident since</span>
          <div className="val" style={{ fontSize: 20 }}>
            {user.moveIn}
          </div>
          <div className="delta">Status: {status}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 14 }}>Recent invoices</h3>
          {invoices.length ? (
            invoices.slice(0, 4).map((i) => (
              <div className="checklist-item" key={i.id}>
                <div className="tag-room">{i.room.split("-")[1]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{i.period}</div>
                  <div style={{ fontSize: 12, color: "var(--slate)" }}>
                    Due {i.due} · {peso(i.amount)}
                  </div>
                </div>
                <StatusPill status={i.status} />
              </div>
            ))
          ) : (
            <p style={{ color: "var(--slate)" }}>No invoices yet.</p>
          )}
          <div style={{ marginTop: 14 }}>
            <button
              className="linklike"
              onClick={() => navigate("/tenant/billing")}
            >
              View all billing →
            </button>
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 14 }}>Maintenance activity</h3>
          {tickets.length ? (
            tickets.slice(0, 4).map((tk) => (
              <div className="checklist-item" key={tk.id}>
                <div className="avatar-sm">{tk.category[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{tk.title}</div>
                  <div style={{ fontSize: 12, color: "var(--slate)" }}>
                    Filed {tk.created}
                  </div>
                </div>
                <StatusPill status={tk.status} />
              </div>
            ))
          ) : (
            <p style={{ color: "var(--slate)" }}>
              No maintenance requests filed.
            </p>
          )}
          <div style={{ marginTop: 14 }}>
            <button
              className="linklike"
              onClick={() => navigate("/tenant/maintenance")}
            >
              File a new request →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------- find a room ---------------- */

export function RoomPicker() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const type = params.get("type") || "";

  const { data, loading, error, reload } = useApi(
    `/rooms?status=available${type ? `&type=${encodeURIComponent(type)}` : ""}`,
  );
  const rooms = (data || []).filter((r) =>
    r.id.toLowerCase().includes(q.toLowerCase()),
  );

  const setFilter = (key, value) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Housing</span>
          <h1>Find a room</h1>
          <p>
            Browse currently available rooms. Tap a card for full details and to
            start a reservation.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <input
          type="text"
          placeholder="Search room number…"
          value={q}
          onChange={(e) => setFilter("q", e.target.value)}
        />
        <select
          value={type}
          onChange={(e) => setFilter("type", e.target.value)}
        >
          <option value="">All types</option>
          {["Single", "Double", "Suite"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <span style={{ color: "var(--slate)", fontSize: 12.5 }}>
          {loading && !data ? "Loading…" : `${rooms.length} available`}
        </span>
      </div>

      {error ? (
        <LoadError title="Couldn't load rooms" error={error} onRetry={reload} />
      ) : (
        <div className="grid grid-3">
          {rooms.length ? (
            rooms.map((r) => (
              <div className="card room-card" key={r.id}>
                <div className="photo">
                  <span className="big-tag">{r.id}</span>
                </div>
                <div className="info">
                  <h4>
                    {r.type} · {r.beds} bed{r.beds > 1 ? "s" : ""}
                  </h4>
                  <div className="price">
                    {peso(r.price)}{" "}
                    <span
                      style={{
                        color: "var(--slate)",
                        fontWeight: 400,
                        fontSize: 11,
                      }}
                    >
                      / month
                    </span>
                  </div>
                  <div className="meta">
                    {r.amenities.slice(0, 2).map((a) => (
                      <span key={a}>· {a}</span>
                    ))}
                  </div>
                  <button
                    className="btn secondary small"
                    style={{ width: "100%", justifyContent: "center" }}
                    onClick={() =>
                      navigate(`/tenant/rooms/${encodeURIComponent(r.id)}`)
                    }
                  >
                    View details
                  </button>
                </div>
              </div>
            ))
          ) : loading && !data ? null : (
            <div className="empty" style={{ gridColumn: "1/-1" }}>
              <h3>No rooms match</h3>
              <p>Try clearing your filters.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function RoomDetail() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const {
    data: r,
    loading,
    error,
    status,
  } = useApi(`/rooms/${encodeURIComponent(roomId)}`);

  if (loading && !r) return <Loading />;
  if (error)
    return (
      <div className="empty">
        <h3>{status === 404 ? "Room not found" : "Couldn't load this room"}</h3>
        <p>{error}</p>
        <button
          className="btn secondary small"
          onClick={() => navigate("/tenant/rooms")}
        >
          Back to rooms
        </button>
      </div>
    );

  return (
    <>
      <button
        className="linklike"
        style={{ marginBottom: 14 }}
        onClick={() => navigate(-1)}
      >
        ← Back to results
      </button>
      <div className="grid grid-2">
        <div className="card room-card">
          <div className="photo" style={{ height: 260 }}>
            <span className="big-tag" style={{ fontSize: 40 }}>
              {r.id}
            </span>
          </div>
        </div>
        <div className="card card-pad">
          <span className="eyebrow">
            {r.type} · Floor {r.floor}
          </span>
          <h1 style={{ marginTop: 6 }}>{r.id}</h1>
          <div className="price" style={{ fontSize: 22, margin: "10px 0" }}>
            {peso(r.price)}{" "}
            <span
              style={{ color: "var(--slate)", fontWeight: 400, fontSize: 12 }}
            >
              / month
            </span>
          </div>
          <StatusPill status={r.status} />
          <div className="divider" />
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Amenities</h3>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {r.amenities.map((a) => (
              <span className="pill neutral" key={a}>
                {a}
              </span>
            ))}
          </div>
          <button
            className="btn brass"
            disabled={r.status !== "available"}
            onClick={() =>
              navigate(`/tenant/rooms/${encodeURIComponent(r.id)}/book`)
            }
          >
            Reserve this room
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------------- booking ---------------- */

export function Booking() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const room = useApi(`/rooms/${encodeURIComponent(roomId)}`);
  const mine = useApi("/reservations/mine");
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ date: "", lease: "12 months", requests: "" });
  const [busy, setBusy] = useState(false);

  if ((room.loading && !room.data) || (mine.loading && !mine.data))
    return <Loading />;
  if (room.error)
    return (
      <div className="empty">
        <h3>
          {room.status === 404 ? "Room not found" : "Couldn't load this room"}
        </h3>
        <p>{room.error}</p>
        <button
          className="btn secondary small"
          onClick={() => navigate("/tenant/rooms")}
        >
          Back to rooms
        </button>
      </div>
    );

  const r = room.data;
  const pending = (mine.data || []).find((x) => x.status === "pending");

  const blocked = user.room
    ? `You already have a room (${user.room}). Use the move-out request first if you want to change rooms.`
    : pending
      ? `You already have a pending reservation for ${pending.room}. Cancel it from your dashboard before reserving another room.`
      : r.status !== "available"
        ? "This room is no longer available."
        : null;

  if (blocked)
    return (
      <div className="empty">
        <h3>Can't reserve {r.id}</h3>
        <p>{blocked}</p>
        <button
          className="btn secondary small"
          onClick={() =>
            navigate(
              pending || user.room ? "/tenant/dashboard" : "/tenant/rooms",
            )
          }
        >
          {pending || user.room ? "Go to dashboard" : "Back to rooms"}
        </button>
      </div>
    );

  const continueFromStep1 = () => {
    if (!f.date) return toast("Choose your preferred move-in date");
    if (f.date < todayLocal())
      return toast("The move-in date can't be in the past");
    setStep(2);
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await api.post("/reservations", {
        room: r.id,
        date: f.date,
        lease: f.lease,
        requests: f.requests,
      });
      toast(`Room ${r.id} is held for 48 hours. Staff will follow up.`);
      navigate("/tenant/dashboard");
    } catch (err) {
      toast(err.message); // e.g. someone else took the room a moment ago
      room.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Reservation</span>
          <h1>Book {r.id}</h1>
        </div>
      </div>
      <div className="card card-pad" style={{ maxWidth: 560 }}>
        <div className="steps">
          <div
            className={`step ${step >= 1 ? (step > 1 ? "done" : "active") : ""}`}
          >
            1 · Move-in date
          </div>
          <div
            className={`step ${step >= 2 ? (step > 2 ? "done" : "active") : ""}`}
          >
            2 · Your details
          </div>
          <div className={`step ${step >= 3 ? "active" : ""}`}>3 · Confirm</div>
        </div>

        {step === 1 && (
          <>
            <div className="field">
              <label>Preferred move-in date</label>
              <input
                type="date"
                min={todayLocal()}
                value={f.date}
                onChange={(e) => setF((s) => ({ ...s, date: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Lease length</label>
              <select
                value={f.lease}
                onChange={(e) => setF((s) => ({ ...s, lease: e.target.value }))}
              >
                <option>6 months</option>
                <option>12 months</option>
                <option>24 months</option>
              </select>
            </div>
            <button className="btn brass" onClick={continueFromStep1}>
              Continue
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="field-row">
              <div className="field">
                <label>Full name</label>
                <input value={user.name} disabled />
              </div>
              <div className="field">
                <label>Phone</label>
                <input value={user.phone || "—"} disabled />
              </div>
            </div>
            <div className="field">
              <label>Email</label>
              <input value={user.email} disabled />
              <div className="hint">
                These come from your account. Update them under Profile &amp;
                settings.
              </div>
            </div>
            <div className="field">
              <label>Special requests (optional)</label>
              <textarea
                maxLength={500}
                placeholder="e.g. ground floor preferred"
                value={f.requests}
                onChange={(e) =>
                  setF((s) => ({ ...s, requests: e.target.value }))
                }
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="btn brass" onClick={() => setStep(3)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div
              className="card card-pad"
              style={{
                background: "var(--brass-tint)",
                borderColor: "var(--brass)",
                marginBottom: 16,
              }}
            >
              <strong>{r.id}</strong> · {r.type} · {peso(r.price)}/mo
              <br />
              <span style={{ fontSize: 12.5 }}>
                Move-in: {f.date} · Lease: {f.lease}
              </span>
              {f.requests ? (
                <>
                  <br />
                  <span style={{ fontSize: 12.5 }}>Request: {f.requests}</span>
                </>
              ) : null}
            </div>
            <p
              style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}
            >
              By confirming, the room is held for you for 48 hours. Staff will
              confirm your move-in during that time, otherwise the hold is
              released.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn secondary"
                onClick={() => setStep(2)}
                disabled={busy}
              >
                Back
              </button>
              <button className="btn brass" onClick={confirm} disabled={busy}>
                {busy ? "Reserving…" : "Confirm reservation"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ---------------- move-in form ---------------- */

const MAX_ID_BYTES = 5 * 1024 * 1024;

function MoveInForm({ existing, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const { openModal } = useModal();

  const showRules = () =>
    openModal({
      title: "House rules & lease terms",
      Body: HouseRulesModal,
      bodyProps: {
        onAgree: () => setF((s) => ({ ...s, agreed: true })),
      },
      cancelLabel: "Close",
      submitLabel: "I agree",
    });

  const [f, setF] = useState({
    legalName: existing?.legalName || user.name || "",
    dob: existing?.dob || "",
    email: existing?.email || user.email || "",
    phone: existing?.phone || user.phone || "",
    govIdType: splitGovId(existing?.govId).type,
    govIdNumber: splitGovId(existing?.govId).number,
    emergencyName: existing?.emergencyName || "",
    emergencyRelationship: existing?.emergencyRelationship || "",
    emergencyPhone: existing?.emergencyPhone || "",
    agreed: !!existing?.agreedAt,
  });
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0); // changing it clears the file input
  const [busy, setBusy] = useState(false);
  const locked = existing?.status === "approved";
  const set = (key) => (e) => setF((s) => ({ ...s, [key]: e.target.value }));

  const submit = async () => {
    if (!f.agreed)
      return toast("You need to agree to the house rules and lease terms");
    const idProblem = govIdError(f.govIdType, f.govIdNumber);
    if (idProblem) return toast(idProblem);
    if (!file && !existing?.hasId)
      return toast("Please upload a photo or scan of your ID");
    if (file && file.size > MAX_ID_BYTES)
      return toast("The ID file must be 5 MB or smaller");

    // accepts 0917 123 4567, 09171234567, +63 917 123 4567 ... and sends the standard format
    let phone, emergencyPhone;
    try {
      phone = checkPhone(f.phone, "Phone");
      emergencyPhone = checkPhone(f.emergencyPhone, "Emergency contact phone", true);
    } catch (err) {
      return toast(err.message);
    }

    const fd = new FormData();
    for (const k of [
      "legalName",
      "dob",
      "email",
      "phone",
      "govIdType",
      "govIdNumber",
      "emergencyName",
      "emergencyRelationship",
      "emergencyPhone",
    ]) {
      fd.append(k, f[k]);
    }
    fd.set("phone", phone);
    fd.set("emergencyPhone", emergencyPhone);
    fd.append("agreed", "true");
    if (file) fd.append("idFile", file);

    setBusy(true);
    try {
      onSaved(await api.put("/move-in/mine", fd));
      setFile(null);
      setFileKey((k) => k + 1);
      toast("Move-in form submitted for review");
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 640 }}>
      {existing ? (
        <div style={{ marginBottom: 16 }}>
          {existing.status === "approved" && (
            <>
              <span className="pill ok">Approved</span>
              <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 8 }}>
                Your move-in details were verified by staff. Contact the front
                desk if anything needs to change.
              </p>
            </>
          )}
          {existing.status === "submitted" && (
            <>
              <span className="pill warn">Submitted · awaiting review</span>
              <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 8 }}>
                You can still edit and resubmit until staff review it.
              </p>
            </>
          )}
          {existing.status === "rejected" && (
            <>
              <span className="pill bad">Needs changes</span>
              <p style={{ fontSize: 13, marginTop: 8 }}>
                <strong>Staff note:</strong> {existing.reviewNote}
              </p>
            </>
          )}
        </div>
      ) : null}

      <fieldset
        disabled={locked}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="field-row">
          <div className="field">
            <label>Full legal name</label>
            <input
              placeholder="Juan Dela Cruz"
              value={f.legalName}
              onChange={set("legalName")}
            />
          </div>
          <div className="field">
            <label>Date of birth</label>
            <input
              type="date"
              max={todayLocal()}
              value={f.dob}
              onChange={set("dob")}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Email</label>
            <input type="email" value={f.email} onChange={set("email")} />
          </div>
          <div className="field">
            <label>Phone</label>
            <PhoneInput
              value={f.phone}
              onChange={(v) => setF((s) => ({ ...s, phone: v }))}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Government ID type</label>
            <select value={f.govIdType} onChange={set("govIdType")}>
              <option value="">Choose an ID…</option>
              {Object.keys(GOV_ID_TYPES).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>ID number</label>
            <input
              placeholder={GOV_ID_TYPES[f.govIdType]?.hint || "Pick an ID type first"}
              value={f.govIdNumber}
              maxLength={30}
              onChange={set("govIdNumber")}
            />
          </div>
        </div>
        <div className="field">
          <label>Upload ID (photo/scan)</label>
          <input
            key={fileKey}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <div className="hint">
            {existing?.hasId
              ? "An ID is already on file. Choose a new file only if you want to replace it. "
              : ""}
            JPG, PNG or PDF, up to 5 MB. Only staff can view it.
          </div>
        </div>
        <div className="divider" />
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Emergency contact</h3>
        <div className="field-row">
          <div className="field">
            <label>Name</label>
            <input value={f.emergencyName} onChange={set("emergencyName")} />
          </div>
          <div className="field">
            <label>Relationship</label>
            <input
              value={f.emergencyRelationship}
              onChange={set("emergencyRelationship")}
            />
          </div>
          <div className="field">
            <label>Phone</label>
            <PhoneInput
              value={f.emergencyPhone}
              onChange={(v) => setF((s) => ({ ...s, emergencyPhone: v }))}
            />
          </div>
        </div>
        <div className="divider" />
        <div className="field">
          <label>
            <input
              type="checkbox"
              style={{ width: "auto", marginRight: 8 }}
              checked={f.agreed}
              onChange={(e) =>
                setF((s) => ({ ...s, agreed: e.target.checked }))
              }
            />
            I agree to the{" "}
            <button type="button" className="link-btn" onClick={showRules}>
              house rules and lease terms
            </button>
          </label>
        </div>
      </fieldset>

      {!locked ? (
        <button className="btn brass" onClick={submit} disabled={busy}>
          {busy
            ? "Submitting…"
            : existing
              ? "Resubmit form"
              : "Submit move-in form"}
        </button>
      ) : null}
    </div>
  );
}

export function MoveIn() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi("/move-in/mine");
  const reservations = useApi("/reservations/mine");
  const navigate = useNavigate();
  const [saved, setSaved] = useState(null); // the server's copy after a successful submit

  if ((loading && !saved) || (reservations.loading && !reservations.data))
    return <Loading />;
  if (error && !saved) return <LoadError error={error} onRetry={reload} />;
  if (reservations.error)
    return <LoadError error={reservations.error} onRetry={reservations.reload} />;

  // the form only opens once the tenant has a room, or a pending/approved reservation for one
  const hasRoom =
    !!user.room ||
    (reservations.data || []).some(
      (r) => r.status === "pending" || r.status === "approved",
    );
  if (!hasRoom)
    return (
      <>
        <div className="pageHead">
          <div>
            <span className="eyebrow">Housing</span>
            <h1>Move-in registration</h1>
          </div>
        </div>
        <div className="card card-pad" style={{ maxWidth: 640 }}>
          <h3>Reserve a room first</h3>
          <p style={{ color: "var(--slate)" }}>
            The move-in form opens once you have rented or reserved a room.
            Pick a room, then come back to finish your paperwork.
          </p>
          <button className="btn brass" onClick={() => navigate("/tenant/rooms")}>
            Find a room
          </button>
        </div>
      </>
    );

  const form = saved ?? data; // null = nothing submitted yet

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Housing</span>
          <h1>Move-in registration</h1>
          <p>Complete this form to finalize your move-in paperwork.</p>
        </div>
      </div>
      <MoveInForm
        existing={form}
        onSaved={setSaved}
        key={form?.updatedAt ?? "new"}
      />
    </>
  );
}

/* ---------------- move-out ---------------- */

export function MoveOut() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ date: "", reason: "End of lease", notes: "" });
  const [busy, setBusy] = useState(false);
  const isPending = user.status === "move-out-pending";

  const run = async (action, doneMessage) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      toast(doneMessage);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!f.date) return toast("Choose your planned move-out date");
    if (f.date < todayLocal())
      return toast("The move-out date can't be in the past");
    run(
      () => api.post("/tenants/me/move-out", f),
      "Move-out request submitted",
    );
  };

  const cancel = () =>
    run(
      () => api.post("/tenants/me/move-out/cancel"),
      "Move-out request cancelled",
    );

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Housing</span>
          <h1>Move-out request</h1>
          <p>
            Let us know your planned move-out date so we can schedule your
            inspection and deposit return.
          </p>
        </div>
      </div>
      <div className="card card-pad" style={{ maxWidth: 560 }}>
        {isPending ? (
          <>
            <div className="pill warn" style={{ marginBottom: 14 }}>
              Request pending review
            </div>
            <p style={{ fontSize: 13, marginBottom: 6 }}>
              <strong>Planned move-out:</strong> {user.moveOut?.date || "—"}
              {user.moveOut?.reason ? ` · ${user.moveOut.reason}` : ""}
            </p>
            <p style={{ color: "var(--slate)", fontSize: 13 }}>
              Your move-out request is being processed. A staff member will
              confirm your final inspection date.
            </p>
            <div className="progress-track" style={{ marginTop: 16 }}>
              <div className="progress-fill" style={{ width: "40%" }} />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: "var(--slate)",
                marginTop: 6,
                fontFamily: "var(--mono)",
              }}
            >
              <span>Submitted</span>
              <span>Inspection</span>
              <span>Deposit return</span>
            </div>
            <button
              className="btn secondary small"
              style={{ marginTop: 18 }}
              onClick={cancel}
              disabled={busy}
            >
              {busy ? "Cancelling…" : "Cancel request"}
            </button>
          </>
        ) : !user.room ? (
          <>
            <p
              style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}
            >
              You don&apos;t have a room to move out of right now.
            </p>
            <button
              className="btn secondary small"
              onClick={() => navigate("/tenant/rooms")}
            >
              Find a room
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label>Planned move-out date</label>
              <input
                type="date"
                min={todayLocal()}
                value={f.date}
                onChange={(e) => setF((s) => ({ ...s, date: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Reason for leaving</label>
              <select
                value={f.reason}
                onChange={(e) =>
                  setF((s) => ({ ...s, reason: e.target.value }))
                }
              >
                <option>End of lease</option>
                <option>Relocating</option>
                <option>Found other housing</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field">
              <label>Notes for the property manager (optional)</label>
              <textarea
                value={f.notes}
                onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>
            <button className="btn brass" onClick={submit} disabled={busy}>
              {busy ? "Submitting…" : "Submit request"}
            </button>
          </>
        )}
      </div>
    </>
  );
}

/* ---------------- billing ---------------- */

export function TenantBilling() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useApi("/invoices/mine");
  const config = useApi("/payments/config");
  const [paying, setPaying] = useState(null);
  const [payingAll, setPayingAll] = useState(false);
  const gateway = !!config.data?.gateway;

  // PayMongo sends the tenant back here as /tenant/billing?paid=INV-2207 (or ?cancelled=...).
  // Ask the server to confirm with PayMongo, then clean the address bar. The ref stops a double run in dev.
  const handled = useRef(false);
  useEffect(() => {
    const paidId = params.get("paid");
    const cancelledId = params.get("cancelled");
    if (handled.current || (!paidId && !cancelledId)) return;
    handled.current = true;
    setParams({}, { replace: true });
    if (cancelledId) {
      toast("Payment cancelled. You have not been charged.");
      return;
    }
    if (paidId === "all") {
      api
        .post("/payments/verify-all")
        .then((r) =>
          toast(
            r.settled
              ? `Payment received for ${r.settled} invoice${r.settled > 1 ? "s" : ""}`
              : "We haven't received confirmation yet. Give it a minute and refresh this page.",
          ),
        )
        .catch((err) => toast(err.message))
        .finally(reload);
      return;
    }
    api
      .post(`/payments/verify/${encodeURIComponent(paidId)}`)
      .then((r) =>
        toast(
          r.paid
            ? `Payment received for ${paidId}`
            : "We haven't received confirmation yet. Give it a minute and refresh this page.",
        ),
      )
      .catch((err) => toast(err.message))
      .finally(reload);
  }, [params, setParams, toast, reload]);

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;

  const invoices = data || [];
  const unpaid = invoices
    .filter((i) => i.status !== "paid")
    .sort((a, b) => a.due.localeCompare(b.due));
  const outstanding = unpaid.reduce((s, i) => s + i.amount, 0);
  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.amount, 0);

  // Online: sends the tenant to PayMongo's page. Without a PayMongo key the server pays instantly (simulated).
  const pay = async (id) => {
    setPaying(id);
    try {
      const r = await api.post(`/payments/checkout/${id}`);
      if (r.url) {
        window.location.assign(r.url);
        return; // leaving the page: keep the button disabled
      }
      toast(`Payment received for ${id}`);
    } catch (err) {
      toast(err.message);
    }
    setPaying(null);
    reload();
  };
  
  const payAll = async () => {
    setPayingAll(true);
    try {
      const r = await api.post("/payments/checkout-all");
      if (r.url) {
        window.location.assign(r.url);
        return; // leaving the page: keep the button disabled
      }
      toast(`Payment received for ${r.count} invoice${r.count > 1 ? "s" : ""}`);
    } catch (err) {
      toast(err.message);
    }
    setPayingAll(false);
    reload();
  };

  return (
    <>
      <div className="pageHead">
  <div>
    <span className="eyebrow">Account</span>
    <h1>Billing &amp; payments</h1>
    <p>Review your invoices and payment history.</p>
  </div>
  {unpaid.length > 1 ? (
    <button className="btn brass" onClick={payAll} disabled={payingAll || !!paying}>
      {payingAll
        ? "Opening…"
        : `Pay all (${unpaid.length}) · ${peso(outstanding)}`}
    </button>
  ) : null}
</div>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card kpi">
          <span className="eyebrow">Outstanding</span>
          <div className="val">{peso(outstanding)}</div>
        </div>
        <div className="card kpi">
          <span className="eyebrow">Next due</span>
          <div className="val" style={{ fontSize: 18 }}>
            {unpaid[0] ? unpaid[0].due : "—"}
          </div>
        </div>
        <div className="card kpi">
          <span className="eyebrow">Total paid</span>
          <div className="val">{peso(totalPaid)}</div>
        </div>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Period</th>
              <th>Amount</th>
              <th>Due</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length ? (
              invoices.map((i) => (
                <tr key={i.id}>
                  <td style={{ fontFamily: "var(--mono)" }}>{i.id}</td>
                  <td>
                    {i.period}
                    {i.kind === "maintenance" ? (
                      <span className="tag-mini">Repair</span>
                    ) : null}
                    {i.description ? (
                      <div style={{ fontSize: 12, color: "var(--slate)" }}>
                        {i.description}
                      </div>
                    ) : null}
                  </td>
                  <td>{peso(i.amount)}</td>
                  <td>{i.due}</td>
                  <td>
                    <StatusPill status={i.status} />
                  </td>
                  <td>
                    {i.status !== "paid" ? (
                      <button
                        className="btn brass small"
                        onClick={() => pay(i.id)}
                        disabled={paying === i.id}
                      >
                        {paying === i.id
                          ? "Opening…"
                          : gateway
                            ? "Pay online"
                            : "Pay now"}
                      </button>
                    ) : (
                      <span style={{ color: "var(--slate)", fontSize: 12 }}>
                        Paid {i.paidOn}
                        {i.method
                          ? ` · ${METHOD_LABELS[i.method] || i.method}`
                          : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty">No invoices</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 12, marginTop: 12 }}>
        {gateway
          ? "Online payments (GCash, Maya or card) are processed securely by PayMongo. You'll come back here once you've paid."
          : "Payments are recorded instantly for now. Online payment (card / GCash) isn't connected yet."}
      </p>
    </>
  );
}

/* ---------------- maintenance ---------------- */

export function NewTicketModalBody({ onDone, registerSubmit }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const [state, setState] = useState({
    title: "",
    category: "Plumbing",
    priority: "medium",
    notes: "",
  });

  // errors thrown here are shown as a toast by the modal shell
  registerSubmit(async () => {
    if (!state.title.trim()) throw new Error("Please give the request a title");
    await api.post("/tickets", state);
    closeModal();
    toast("Maintenance request filed");
    onDone?.();
  });

  return <NewTicketBody state={state} setState={setState} />;
}

export function TenantMaintenance() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openModal } = useModal();
  const { data, loading, error, reload } = useApi("/tickets/mine");

  const openNewTicketModal = () =>
    openModal({
      title: "New maintenance request",
      Body: NewTicketModalBody,
      bodyProps: { onDone: reload },
      submitLabel: "Submit request",
    });

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const tickets = data || [];

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Account</span>
          <h1>Maintenance requests</h1>
          <p>Report issues in your room and track their progress.</p>
        </div>
        <button
          className="btn brass"
          onClick={openNewTicketModal}
          disabled={!user.room}
        >
          + New request
        </button>
      </div>
      {!user.room ? (
        <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
          You can file maintenance requests once you have an assigned room.
        </p>
      ) : null}
      <div className="card">
        {tickets.length ? (
          tickets.map((tk) => (
            <div
              className="checklist-item"
              style={{ padding: "16px 20px" }}
              key={tk.id}
            >
              <div className="avatar-sm">{tk.category[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{tk.title}</div>
                <div style={{ fontSize: 12, color: "var(--slate)" }}>
                  {tk.category} · Filed {tk.created}
                  {tk.assignedName ? ` · Assigned to ${tk.assignedName}` : ""}
                </div>
                {tk.notes ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ink-soft)",
                      marginTop: 4,
                    }}
                  >
                    "{tk.notes}"
                  </div>
                ) : null}
                {tk.charge ? (
                  <div style={{ fontSize: 12.5, marginTop: 6 }}>
                    Repair charge {peso(tk.charge.amount)} ·{" "}
                    {tk.charge.status === "paid" ? (
                      "paid"
                    ) : (
                      <button
                        className="linklike"
                        style={{ fontSize: 12.5 }}
                        onClick={() => navigate("/tenant/billing")}
                      >
                        {tk.charge.status === "overdue"
                          ? "overdue, pay now"
                          : "pay now"}
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
              <StatusPill status={tk.priority} />{" "}
              <StatusPill status={tk.status} />
            </div>
          ))
        ) : (
          <div className="empty">
            <h3>No requests yet</h3>
            <p>File one when something needs fixing.</p>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------- profile ---------------- */

export function Profile() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const em = splitEmergency(user.emergency); // saved as "Name · 0917 000 0000"
  const [f, setF] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    emergencyName: em.name,
    emergencyPhone: em.phone,
  });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState(null); // 'profile' | 'password'
  const set = (key) => (e) => setF((s) => ({ ...s, [key]: e.target.value }));

  const saveProfile = async () => {
    if (!f.name.trim()) return toast("Your name can't be empty");
    setBusy("profile");
    try {
      const phone = checkPhone(f.phone, "Phone");
      const emergency = joinEmergency(f.emergencyName, f.emergencyPhone);
      await api.put("/tenants/me", {
        name: f.name,
        email: f.email,
        phone,
        emergency,
      });
      await refresh();
      toast("Profile updated");
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(null);
    }
  };

  const updatePassword = async () => {
    if (!pw.current) return toast("Enter your current password");
    if (pw.next.length < 4)
      return toast("New password must be at least 4 characters");
    setBusy("password");
    try {
      await api.put("/tenants/me/password", pw);
      setPw({ current: "", next: "" });
      toast("Password updated — use it next time you log in");
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Account</span>
          <h1>Profile &amp; settings</h1>
        </div>
      </div>
      <div className="grid grid-2">
        <div className="card card-pad">
          <h3 style={{ marginBottom: 14 }}>Personal information</h3>
          <div className="field">
            <label>Full name</label>
            <input value={f.name} onChange={set("name")} />
          </div>
          <div className="field">
            <label>Email (also your login)</label>
            <input value={f.email} onChange={set("email")} />
          </div>
          <div className="field">
            <label>Phone</label>
            <PhoneInput
              value={f.phone}
              onChange={(v) => setF((s) => ({ ...s, phone: v }))}
            />
          </div>
          <div className="field">
            <label>Emergency contact name</label>
            <input
              value={f.emergencyName}
              onChange={set("emergencyName")}
            />
          </div>
          <div className="field">
            <label>Emergency contact number</label>
            <PhoneInput
              value={f.emergencyPhone}
              onChange={(v) => setF((s) => ({ ...s, emergencyPhone: v }))}
            />
          </div>
          <button
            className="btn brass"
            onClick={saveProfile}
            disabled={busy === "profile"}
          >
            {busy === "profile" ? "Saving…" : "Save changes"}
          </button>
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 14 }}>Security</h3>
          <div className="field">
            <label>Current password</label>
            <input
              type="password"
              value={pw.current}
              onChange={(e) =>
                setPw((s) => ({ ...s, current: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>New password</label>
            <input
              type="password"
              value={pw.next}
              onChange={(e) => setPw((s) => ({ ...s, next: e.target.value }))}
            />
          </div>
          <button
            className="btn secondary"
            onClick={updatePassword}
            disabled={busy === "password"}
          >
            {busy === "password" ? "Updating…" : "Update password"}
          </button>
          {/* <div className="divider" />
          <h3 style={{ marginBottom: 6, fontSize: 14 }}>Notification preferences</h3>
          <p style={{ color: "var(--slate)", fontSize: 12, marginBottom: 8 }}>Coming soon. These aren&apos;t saved yet.</p>
          <div className="checklist-item">
            <span style={{ flex: 1 }}>Billing reminders</span>
            <input type="checkbox" defaultChecked disabled />
          </div>
          <div className="checklist-item">
            <span style={{ flex: 1 }}>Maintenance updates</span>
            <input type="checkbox" defaultChecked disabled />
          </div>
          <div className="checklist-item">
            <span style={{ flex: 1 }}>Community announcements</span>
            <input type="checkbox" disabled />
          </div> */}
        </div>
      </div>
    </>
  );
}