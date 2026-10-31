import React, { useState } from "react";
import { api } from "../api.js";
import { useApi } from "../useApi.js";
import { useModal } from "../context/ModalContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { peso } from "../data.js";

/* ============================================================
   Presentational bodies: just fields, controlled by the container.
   Containers below own the state and the API call, and register a
   submit handler that the modal footer's button calls. A thrown
   Error becomes a toast and keeps the modal open.
=============================================================*/

const field = (label, input, hint) => (
  <div className="field">
    <label>{label}</label>
    {input}
    {hint ? <div className="hint">{hint}</div> : null}
  </div>
);

export function TenantEditBody({ tenant, rooms, state, setState }) {
  const set = (k) => (e) => setState((s) => ({ ...s, [k]: e.target.value }));
  const options = [
    ...(tenant.room ? [{ id: tenant.room }] : []),
    ...rooms.filter((r) => r.id !== tenant.room),
  ];
  return (
    <>
      {field("Name", <input value={state.name} onChange={set("name")} />)}
      {field("Email", <input value={state.email} onChange={set("email")} />)}
      {field("Phone", <input value={state.phone} onChange={set("phone")} />)}
      {field(
        "Emergency contact",
        <input value={state.emergency} onChange={set("emergency")} />,
      )}
      {field(
        "Room",
        <select value={state.room} onChange={set("room")}>
          <option value="">Unassigned</option>
          {options.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id}
            </option>
          ))}
        </select>,
        "Moving a tenant frees their old room and occupies the new one.",
      )}
    </>
  );
}

export function TenantAddBody({ rooms, state, setState }) {
  const set = (k) => (e) => setState((s) => ({ ...s, [k]: e.target.value }));
  return (
    <>
      {field(
        "Full name",
        <input
          value={state.name}
          onChange={set("name")}
          placeholder="Juan Dela Cruz"
        />,
      )}
      {field(
        "Email (used for tenant login)",
        <input
          value={state.email}
          onChange={set("email")}
          placeholder="juan.delacruz@gmail.com"
        />,
      )}
      {field("Phone", <input value={state.phone} onChange={set("phone")} />)}
      {field(
        "Assign room",
        <select value={state.room} onChange={set("room")}>
          <option value="">Unassigned</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.id}
            </option>
          ))}
        </select>,
      )}
      {field(
        "Temporary password",
        <input value={state.password} onChange={set("password")} />,
      )}
      <div className="hint">
        Share this password with the tenant. They can change it after first
        login in Profile &amp; settings.
      </div>
    </>
  );
}

export function RoomFormBody({ room, locked, state, setState }) {
  const set = (k) => (e) => setState((s) => ({ ...s, [k]: e.target.value }));
  const num = (k) => (e) =>
    setState((s) => ({
      ...s,
      [k]: e.target.value === "" ? "" : Number(e.target.value),
    }));
  return (
    <>
      {field(
        "Room number",
        <input
          value={state.id}
          disabled={!!room}
          onChange={set("id")}
          placeholder="e.g. R-105"
        />,
      )}
      <div className="field-row">
        {field(
          "Type",
          <select value={state.type} onChange={set("type")}>
            {["Single", "Double", "Suite"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>,
        )}
        {field(
          "Floor",
          <input
            type="number"
            min="0"
            value={state.floor}
            onChange={num("floor")}
          />,
        )}
      </div>
      <div className="field-row">
        {field(
          "Price / month",
          <input
            type="number"
            min="0"
            value={state.price}
            onChange={num("price")}
          />,
        )}
        {field(
          "Beds",
          <input
            type="number"
            min="1"
            value={state.beds}
            onChange={num("beds")}
          />,
        )}
      </div>
      {field(
        "Status",
        locked ? (
          <select value={state.status} disabled>
            <option value={state.status}>{state.status}</option>
          </select>
        ) : (
          <select value={state.status} onChange={set("status")}>
            <option value="available">Available</option>
            <option value="maintenance">Maintenance</option>
          </select>
        ),
        locked
          ? "This changes automatically when the tenant moves in or out, or the reservation ends."
          : "Occupied and reserved are set automatically when a tenant is assigned.",
      )}
      {field(
        "Amenities",
        <input
          value={state.amenities}
          onChange={set("amenities")}
          placeholder="Aircon, Study desk, Own bath"
        />,
        "Separate with commas.",
      )}
      {field("Notes", <textarea value={state.notes} onChange={set("notes")} />)}
    </>
  );
}

export function GenerateInvoiceBody({ tenants, loading, state, setState }) {
  const set = (k) => (e) => setState((s) => ({ ...s, [k]: e.target.value }));
  const chosen = tenants.find((t) => t.id === state.tenant);
  return (
    <>
      {field(
        "Tenant",
        <select value={state.tenant} onChange={set("tenant")}>
          <option value="">{loading ? "Loading…" : "Choose a tenant"}</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.room})
            </option>
          ))}
        </select>,
      )}
      <div className="field-row">
        {field(
          "Period",
          <input value={state.period} onChange={set("period")} placeholder="e.g. Nov 2026" />,
        )}
        {field("Due date", <input type="date" value={state.due} onChange={set("due")} />)}
      </div>
      {field(
        "Amount",
        <input
          value={chosen ? peso(chosen.price) : ""}
          placeholder="Choose a tenant first"
          readOnly
          disabled
        />,
        chosen ? `Monthly price of room ${chosen.room}` : null,
      )}
    </>
  );
}

const PERMS = [
  "tenants",
  "rooms",
  "billing",
  "maintenance",
  "staff",
  "settings",
];

export function StaffFormBody({ editing, state, setState }) {
  const set = (k) => (e) => setState((s) => ({ ...s, [k]: e.target.value }));
  const toggle = (p) =>
    setState((s) => ({
      ...s,
      perms: s.perms.includes(p)
        ? s.perms.filter((x) => x !== p)
        : [...s.perms, p],
    }));
  return (
    <>
      {field("Name", <input value={state.name} onChange={set("name")} />)}
      {field(
        "Role",
        <input
          value={state.role}
          onChange={set("role")}
          placeholder="e.g. Front Desk Staff"
        />,
      )}
      {field(
        "Username (used for login)",
        <input
          value={state.username}
          onChange={set("username")}
          disabled={editing}
          placeholder="e.g. jgarcia"
        />,
        editing
          ? "Usernames can’t be changed."
          : "3–30 characters: letters, numbers, dot, dash or underscore.",
      )}
      {field(
        editing
          ? "New password (leave blank to keep the current one)"
          : "Temporary password",
        <input value={state.password} onChange={set("password")} />,
        "At least 6 characters.",
      )}
      <div className="field">
        <label>Permissions</label>
        <div
          style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}
        >
          {PERMS.map((p) => (
            <label
              key={p}
              style={{
                fontSize: 12.5,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <input
                type="checkbox"
                checked={state.perms.includes(p)}
                onChange={() => toggle(p)}
              />{" "}
              {p}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

// Used by the tenant side (TenantPages.jsx)
export function NewTicketBody({ state, setState }) {
  return (
    <>
      <div className="field">
        <label>Title</label>
        <input
          value={state.title}
          onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
          placeholder="e.g. Ceiling light flickering"
        />
      </div>
      <div className="field">
        <label>Category</label>
        <select
          value={state.category}
          onChange={(e) =>
            setState((s) => ({ ...s, category: e.target.value }))
          }
        >
          <option>Plumbing</option>
          <option>Electrical</option>
          <option>Carpentry</option>
          <option>Utilities</option>
          <option>Other</option>
        </select>
      </div>
      <div className="field">
        <label>Priority</label>
        <select
          value={state.priority}
          onChange={(e) =>
            setState((s) => ({ ...s, priority: e.target.value }))
          }
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div className="field">
        <label>Description</label>
        <textarea
          value={state.notes}
          onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
          placeholder="Describe the issue…"
        />
      </div>
    </>
  );
}

export function ViewTicketBody({ ticket, state, setState }) {
  return (
    <>
      <p>
        <strong>Room:</strong> {ticket.room} · <strong>Tenant:</strong>{" "}
        {ticket.tenantName || "—"}
      </p>
      <p>
        <strong>Category:</strong> {ticket.category} &nbsp;{" "}
        <strong>Priority:</strong> {ticket.priority}
      </p>
      <p>
        <strong>Filed:</strong> {ticket.created}
      </p>
      <div className="field" style={{ marginTop: 12 }}>
        <label>Notes</label>
        <textarea
          value={state.notes}
          onChange={(e) => setState({ notes: e.target.value })}
        />
      </div>
    </>
  );
}

/* ============================================================
   Containers
=============================================================*/

export function EditTenantModal({ tenant, onDone, registerSubmit }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const rooms = useApi("/rooms?status=available");
  const [state, setState] = useState({
    name: tenant.name,
    email: tenant.email,
    phone: tenant.phone || "",
    emergency: tenant.emergency || "",
    room: tenant.room || "",
  });

  registerSubmit(async () => {
    if (!state.name.trim()) throw new Error("Name is required");
    await api.put(`/tenants/${tenant.id}`, {
      ...state,
      room: state.room || null,
    });
    closeModal();
    toast("Tenant updated");
    onDone?.();
  });

  return (
    <TenantEditBody
      tenant={tenant}
      rooms={rooms.data || []}
      state={state}
      setState={setState}
    />
  );
}

export function AddTenantModal({ onDone, registerSubmit }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const rooms = useApi("/rooms?status=available");
  const [state, setState] = useState({
    name: "",
    email: "",
    phone: "",
    room: "",
    password: "welcome123",
  });

  registerSubmit(async () => {
    if (!state.name.trim()) throw new Error("Name is required");
    if (!state.email.trim()) throw new Error("Email is required");
    const body = {
      name: state.name,
      email: state.email,
      phone: state.phone,
      password: state.password,
    };
    if (state.room) body.room = state.room;
    const t = await api.post("/tenants", body);
    closeModal();
    toast(`Tenant added. Login: ${t.email} / ${state.password}`);
    onDone?.();
  });

  return (
    <TenantAddBody rooms={rooms.data || []} state={state} setState={setState} />
  );
}

export function RoomModal({ room, onDone, registerSubmit }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const locked = !!room && ["occupied", "reserved"].includes(room.status);
  const [state, setState] = useState(
    room
      ? {
          id: room.id,
          type: room.type,
          floor: room.floor,
          price: room.price,
          beds: room.beds,
          status: room.status,
          amenities: (room.amenities || []).join(", "),
          notes: room.notes || "",
        }
      : {
          id: "",
          type: "Single",
          floor: 1,
          price: 5000,
          beds: 1,
          status: "available",
          amenities: "",
          notes: "",
        },
  );

  registerSubmit(async () => {
    if (!room && !state.id.trim()) throw new Error("Room number is required");
    if (state.floor === "" || state.floor < 0)
      throw new Error("Enter a valid floor");
    if (state.price === "" || state.price < 0)
      throw new Error("Enter a valid price");
    if (state.beds === "" || state.beds < 1)
      throw new Error("A room needs at least 1 bed");

    const body = {
      type: state.type,
      floor: state.floor,
      price: state.price,
      beds: state.beds,
      amenities: state.amenities
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      notes: state.notes,
    };
    if (!locked) body.status = state.status;

    if (room) await api.put(`/rooms/${encodeURIComponent(room.id)}`, body);
    else await api.post("/rooms", { id: state.id.trim(), ...body });

    closeModal();
    toast("Room saved");
    onDone?.();
  });

  return (
    <RoomFormBody
      room={room}
      locked={locked}
      state={state}
      setState={setState}
    />
  );
}

export function GenerateInvoiceModal({ onDone, registerSubmit }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const billable = useApi("/invoices/billable");
  const [state, setState] = useState({
  tenant: "",
  period: new Date().toLocaleString("en-US", { month: "short", year: "numeric" }),
  due: "",
});

registerSubmit(async () => {
  const { tenant, period, due } = state;
  await api.post("/invoices", { tenant, period, due });
  closeModal();
  toast("Invoice generated");
  onDone?.();
});

  return (
    <GenerateInvoiceBody
      tenants={billable.data || []}
      loading={billable.loading}
      state={state}
      setState={setState}
    />
  );
}

export function AddStaffModal({ onDone, registerSubmit }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const [state, setState] = useState({
    name: "",
    role: "",
    username: "",
    password: "staff123",
    perms: [],
  });

  registerSubmit(async () => {
    const staff = await api.post("/staff", state);
    closeModal();
    toast(`Staff added. Login: ${staff.username} / ${state.password}`);
    onDone?.();
  });

  return <StaffFormBody editing={false} state={state} setState={setState} />;
}

export function EditStaffModal({ staff, onDone, registerSubmit }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const [state, setState] = useState({
    name: staff.name,
    role: staff.role || "",
    username: staff.username,
    password: "",
    perms: staff.perms || [],
  });

  registerSubmit(async () => {
    const body = { name: state.name, role: state.role, perms: state.perms };
    if (state.password) body.password = state.password;
    await api.put(`/staff/${staff.id}`, body);
    closeModal();
    toast("Staff updated");
    onDone?.();
  });

  return <StaffFormBody editing state={state} setState={setState} />;
}

// Bill the tenant for a repair. It turns into an invoice they pay like rent (online or at the desk).
function RepairChargeSection({ ticket, canCharge, onDone }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const [f, setF] = useState({ amount: "", description: "", due: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  if (ticket.charge)
    return (
      <>
        <div className="divider" />
        <p>
          <strong>Repair charge:</strong> {peso(ticket.charge.amount)} · invoice{" "}
          {ticket.charge.invoice} · {ticket.charge.status}
        </p>
      </>
    );
  if (!canCharge)
    return (
      <>
        <div className="divider" />
        <p style={{ color: "var(--slate)", fontSize: 13 }}>
          Adding a repair charge needs the billing permission.
        </p>
      </>
    );

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/tickets/${ticket.id}/charge`, {
        amount: Number(f.amount),
        description: f.description,
        due: f.due || undefined,
      });
      closeModal();
      toast("Repair charge sent to the tenant");
      onDone?.();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="divider" />
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Repair charge</h3>
      <p style={{ color: "var(--slate)", fontSize: 12.5, marginBottom: 10 }}>
        Bill {ticket.tenantName || "the tenant"} for this repair. They get an
        invoice and a notification.
      </p>
      <div className="field-row">
        {field(
          "Amount (₱)",
          <input
            type="number"
            min="1"
            value={f.amount}
            onChange={set("amount")}
            placeholder="e.g. 850"
          />,
        )}
        {field(
          "Due date",
          <input type="date" value={f.due} onChange={set("due")} />,
          "Leave blank for 7 days from today",
        )}
      </div>
      {field(
        "What is the charge for?",
        <input
          value={f.description}
          onChange={set("description")}
          placeholder="e.g. Replacement faucet and labor"
        />,
      )}
      <button
        className="btn secondary small"
        onClick={submit}
        disabled={busy || !(Number(f.amount) > 0)}
      >
        {busy ? "Sending…" : "Send repair charge"}
      </button>
    </>
  );
}

export function ViewTicketModal({ ticket, onDone, canCharge, registerSubmit }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const [state, setState] = useState({ notes: ticket.notes || "" });

  registerSubmit(async () => {
    await api.patch(`/tickets/${ticket.id}`, { notes: state.notes });
    closeModal();
    toast("Notes saved");
    onDone?.();
  });

  return (
    <>
      <ViewTicketBody ticket={ticket} state={state} setState={setState} />
      <RepairChargeSection
        ticket={ticket}
        canCharge={canCharge}
        onDone={onDone}
      />
    </>
  );
}

// Staff records a payment taken outside the website (cash at the desk, bank transfer, ...)
export function MarkPaidModal({ invoice, onDone, registerSubmit }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const [method, setMethod] = useState("cash");

  registerSubmit(async () => {
    await api.post(`/invoices/${invoice.id}/pay`, { method });
    closeModal();
    toast(`${invoice.id} marked as paid`);
    onDone?.();
  });

  return (
    <>
      <p style={{ fontSize: 13, marginBottom: 12 }}>
        <strong>{invoice.tenantName || "Tenant"}</strong> · {invoice.period} ·{" "}
        {peso(invoice.amount)}
        {invoice.lateFee > 0 ? ` (incl. ${peso(invoice.lateFee)} late fee)` : ""}
      </p>
      {field(
        "How was it paid?",
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="cash">Cash</option>
          <option value="bank">Bank transfer</option>
          <option value="gcash">GCash (sent directly)</option>
          <option value="other">Other</option>
        </select>,
        "Online payments through the website are recorded automatically.",
      )}
    </>
  );
}

export function RejectFormModal({ form, onDone, registerSubmit }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const [note, setNote] = useState("");

  registerSubmit(async () => {
    if (!note.trim()) throw new Error("Tell the tenant what to fix");
    await api.post(`/move-in/${form.id}/review`, {
      decision: "rejected",
      note,
    });
    closeModal();
    toast("Form sent back to the tenant");
    onDone?.();
  });

  return (
    <>
      <p style={{ fontSize: 13, marginBottom: 12 }}>
        <strong>{form.tenantName}</strong> will see this note and can fix and
        resubmit the form.
      </p>
      {field(
        "What needs to change?",
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. The ID photo is blurry. Please upload a clearer one."
        />,
      )}
    </>
  );
}

export function HouseRulesModal({ onAgree, registerSubmit }) {
  const { closeModal } = useModal();

  registerSubmit(async () => {
    onAgree?.();
    closeModal();
  });

  return (
    <div
      style={{
        maxHeight: "60vh",
        overflowY: "auto",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <main>
        <section>
          <h2>1. Occupancy &amp; Rental Limits</h2>
          <ul>
            <li>
              <strong>Property Limit:</strong> Tenants are permitted to rent a
              maximum of one (1) property or room within the premises at any
              given time.
            </li>
            <li>
              <strong>Occupancy Restrictions:</strong> Subletting, re-assigning,
              or transferring room occupancy to unregistered individuals is
              strictly prohibited.
            </li>
          </ul>
        </section>

        <section>
          <h2>2. Rent Payments &amp; Late Penalties</h2>
          <ul>
            <li>
              <strong>Payment Methods:</strong> Monthly rent payments may be
              submitted online via GCash, Maya, or Credit/Debit Card through the{" "}
              <strong>Billing page</strong> in the tenant application. Payments
              can also be made in person via cash or bank transfer at the
              management office.
            </li>
            <li>
              <strong>Office Hours:</strong> The management office is open
              Monday through Saturday, from 9:00 AM to 5:00 PM. In-person
              transactions and cash payments must be completed within these
              operating hours.
            </li>
            <li>
              <strong>Late Payment Penalty:</strong> Rent is due on or before
              the specified monthly due date. Payments received past the due
              date will incur a late payment fee of [e.g., 5% per month or a
              fixed daily fee]. Continued non-payment beyond [e.g., 15 days] may
              result in formal demand notices, penalty escalation, or
              termination of tenancy.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. Security Deposit</h2>
          <ul>
            <li>
              <strong>Deposit Requirement:</strong> A deposit equivalent to one
              (1) month’s rent is required prior to move-in.
            </li>
            <li>
              <strong>Refund Eligibility:</strong> The security deposit is
              refundable upon move-out, subject to a satisfactory room
              inspection, deduction for damages (beyond normal wear and tear),
              and full settlement of outstanding rent and utility accounts.
            </li>
          </ul>
        </section>

        <section>
          <h2>4. Utility Billing Rules</h2>
          <ul>
            <li>
              <strong>Billing Allocation:</strong> Utility charges (electricity,
              water, internet) are billed separately based on individual room
              sub-meter consumption or as specified in the tenant agreement.
            </li>
            <li>
              <strong>In-App Invoicing:</strong> Monthly utility statements will
              be calculated and posted directly to the tenant’s account on the{" "}
              <strong>Billing page</strong> in the app.
            </li>
            <li>
              <strong>Payment Due Dates &amp; Service Disconnection:</strong>{" "}
              Utility bills must be settled alongside or by the specified due
              date on the statement. Failure to settle utility balances on time
              may incur late charges or result in temporary suspension of
              utility services.
            </li>
          </ul>
        </section>

        <section>
          <h2>5. Visitors &amp; Quiet Hours</h2>
          <ul>
            <li>
              <strong>Quiet Hours:</strong> Quiet hours are observed daily from
              10:00 PM to 6:00 AM. Noise levels must be kept to a minimum during
              these hours out of respect for all residents.
            </li>
            <li>
              <strong>Visitor Policy:</strong> Guests are allowed on the
              premises until 9:00 PM daily and must register at the front desk
              upon arrival. Visitors are not permitted on the property during
              quiet hours.
            </li>
          </ul>
        </section>

        <section>
          <h2>6. Maintenance &amp; Repair Requests</h2>
          <ul>
            <li>
              <strong>Filing Requests:</strong> All repair and maintenance
              issues must be reported electronically via the{" "}
              <strong>Maintenance page</strong> within the tenant application.
            </li>
            <li>
              <strong>Status Updates:</strong> Management and maintenance staff
              will track, update, and communicate the progress of repair
              requests directly through the app interface.
            </li>
          </ul>
        </section>

        <section>
          <h2>7. Communication &amp; Conduct Standards</h2>
          <ul>
            <li>
              <strong>Appropriate Language:</strong> Tenants must maintain
              polite and respectful communication at all times across all
              platform channels, in-app messaging, community chat features, and
              in-person interactions.
            </li>
            <li>
              <strong>Prohibited Words:</strong> The use of explicit, crude,
              filthy, or abusive language is strictly prohibited and may result
              in warning notices or formal lease review.
            </li>
          </ul>
        </section>

        <section>
          <h2>8. Move-Out Procedure</h2>
          <ul>
            <li>
              <strong>Notice Requirement:</strong> Tenants intending to vacate
              the property must submit an official request via the{" "}
              <strong>Move-out page</strong> in the tenant app at least thirty
              (30) days prior to their planned move-out date.
            </li>
            <li>
              <strong>Inspection &amp; Settlement:</strong> The security deposit
              refund will be processed once the room inspection is finalized and
              any applicable damage or utility deductions are accounted for.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
