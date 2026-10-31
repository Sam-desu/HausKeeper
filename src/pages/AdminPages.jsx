import React, { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { peso, initials, METHOD_LABELS } from "../data.js";
import { StatusPill, Loading, LoadError } from "../components/Common.jsx";
import { useApi } from "../useApi.js";
import { api, download, fetchBlob } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import {
  EditTenantModal,
  AddTenantModal,
  RoomModal,
  GenerateInvoiceModal,
  AddStaffModal,
  EditStaffModal,
  ViewTicketModal,
  MarkPaidModal,
  RejectFormModal,
} from "../components/Modals.jsx";

/* ---------------- shared helpers ---------------- */

const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

// Filters live in the URL (?status=...) so refresh and back/forward keep them
function useFilters() {
  const [params, setParams] = useSearchParams();
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
  return [params, setFilter];
}

const usePerms = () => {
  const { user } = useAuth();
  return (perm) => !!user.perms?.includes(perm);
};

/* ---------------- dashboard ---------------- */

export function AdminDashboard() {
  const navigate = useNavigate();
  const can = usePerms();
  const dash = useApi("/reports/dashboard");
  const settings = useApi("/settings/public");
  const resv = useApi(can("tenants") ? "/reservations?status=pending" : null);
  const forms = useApi(can("tenants") ? "/move-in?status=submitted" : null);
  const moveOuts = useApi(
    can("tenants") ? "/tenants?status=move-out-pending" : null,
  );

  if (dash.loading && !dash.data) return <Loading />;
  if (dash.error) return <LoadError error={dash.error} onRetry={dash.reload} />;

  const { occupancy, billing, tickets } = dash.data;
  const todos = [
    {
      n: resv.data?.length,
      label: "reservations waiting for a decision",
      to: "/admin/reservations",
    },
    {
      n: forms.data?.length,
      label: "move-in forms to review",
      to: "/admin/move-ins",
    },
    {
      n: moveOuts.data?.length,
      label: "move-out requests",
      to: "/admin/tenants?status=move-out-pending",
    },
  ].filter((t) => t.n > 0);
  const nothingUrgent =
    !todos.length && !billing?.attention.length && !tickets?.attention.length;

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Overview</span>
          <h1>Property dashboard</h1>
          <p>{settings.data?.propertyName || ""}</p>
        </div>
        {can("billing") ? (
          <button
            className="btn secondary"
            onClick={() => navigate("/admin/reports")}
          >
            View reports
          </button>
        ) : null}
      </div>

      <div className="grid grid-4">
        <div className="card kpi">
          <span className="eyebrow">Occupancy</span>
          <div className="val">{occupancy.rate}%</div>
          <div className="delta">
            {occupancy.occupied}/{occupancy.total} rooms filled
          </div>
        </div>
        {billing ? (
          <>
            <div className="card kpi">
              <span className="eyebrow">Revenue collected</span>
              <div className="val">{peso(billing.collected)}</div>
              <div className="delta up">All paid invoices</div>
            </div>
            <div className="card kpi">
              <span className="eyebrow">Overdue invoices</span>
              <div className="val">{billing.overdueCount}</div>
              <div className="delta down">
                {peso(billing.overdueTotal)} at risk
              </div>
            </div>
          </>
        ) : null}
        {tickets ? (
          <div className="card kpi">
            <span className="eyebrow">Open tickets</span>
            <div className="val">{tickets.open}</div>
            <div className="delta">{tickets.highPriority} high priority</div>
          </div>
        ) : null}
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 14 }}>Occupancy by floor</h3>
          {occupancy.byFloor.map((f) => {
            const pct = f.total ? Math.round((f.occupied / f.total) * 100) : 0;
            return (
              <div style={{ marginBottom: 12 }} key={f.floor}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12.5,
                    marginBottom: 5,
                  }}
                >
                  <span>Floor {f.floor}</span>
                  <span style={{ color: "var(--slate)" }}>
                    {f.occupied}/{f.total}
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="card card-pad">
          <h3 style={{ marginBottom: 14 }}>Needs attention</h3>
          {todos.map((t) => (
            <div className="checklist-item" key={t.to}>
              <div className="tag-room">{t.n}</div>
              <div style={{ flex: 1 }}>{t.label}</div>
              <button
                className="btn small secondary"
                onClick={() => navigate(t.to)}
              >
                Open
              </button>
            </div>
          ))}
          {billing?.attention.map((i) => (
            <div className="checklist-item" key={i.id}>
              <div className="tag-room">{i.room.split("-")[1]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{i.tenantName}</div>
                <div style={{ fontSize: 12, color: "var(--slate)" }}>
                  Overdue {peso(i.amount)} · {i.period}
                </div>
              </div>
              <button
                className="btn small secondary"
                onClick={() => navigate("/admin/billing?status=overdue")}
              >
                Review
              </button>
            </div>
          ))}
          {tickets?.attention.map((tk) => (
            <div className="checklist-item" key={tk.id}>
              <div className="avatar-sm">{tk.category[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{tk.title}</div>
                <div style={{ fontSize: 12, color: "var(--slate)" }}>
                  {tk.room} · High priority
                </div>
              </div>
              <button
                className="btn small secondary"
                onClick={() => navigate("/admin/maintenance")}
              >
                Review
              </button>
            </div>
          ))}
          {nothingUrgent ? (
            <p style={{ color: "var(--slate)" }}>
              Nothing needs attention right now.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

/* ---------------- tenants ---------------- */

export function Tenants() {
  const navigate = useNavigate();
  const can = usePerms();
  const { openModal } = useModal();
  const [params, setFilter] = useFilters();
  const q = (params.get("q") || "").toLowerCase();
  const st = params.get("status") || "";

  const tenants = useApi("/tenants");
  // "overdue" is derived from invoices (only possible for staff who can see billing)
  const overdue = useApi(can("billing") ? "/invoices?status=overdue" : null);

  if (
    (tenants.loading && !tenants.data) ||
    (can("billing") && overdue.loading && !overdue.data)
  )
    return <Loading />;
  if (tenants.error)
    return <LoadError error={tenants.error} onRetry={tenants.reload} />;

  const overdueIds = new Set((overdue.data || []).map((i) => i.tenant));
  const shownStatus = (t) =>
    overdue.data && (t.status === "active" || t.status === "overdue")
      ? overdueIds.has(t.id)
        ? "overdue"
        : "active"
      : t.status;

  const rows = (tenants.data || [])
    .map((t) => ({ ...t, shown: shownStatus(t) }))
    .filter(
      (t) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q),
    )
    .filter((t) => !st || t.shown === st);

  const openAddTenantModal = () =>
    openModal({
      title: "Add tenant",
      Body: AddTenantModal,
      bodyProps: { onDone: tenants.reload },
      submitLabel: "Add tenant",
    });

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>Tenant management</h1>
          <p>{tenants.data.length} residents on file</p>
        </div>
        <button className="btn brass" onClick={openAddTenantModal}>
          + Add tenant
        </button>
      </div>
      <div className="toolbar">
        <input
          type="text"
          placeholder="Search name or email…"
          value={params.get("q") || ""}
          onChange={(e) => setFilter("q", e.target.value)}
        />
        <select
          value={st}
          onChange={(e) => setFilter("status", e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="overdue">Overdue</option>
          <option value="move-out-pending">Move-out pending</option>
          <option value="inactive">Inactive</option>
        </select>
        <div className="spacer" />
        <span style={{ color: "var(--slate)", fontSize: 12.5 }}>
          {rows.length} results
        </span>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Room</th>
              <th>Move-in</th>
              <th>Balance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div className="avatar-sm">{initials(t.name)}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--slate)" }}>
                          {t.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{t.room || "—"}</td>
                  <td>{t.moveIn}</td>
                  <td>
                    {t.balance > 0 ? (
                      <span style={{ color: "var(--rust)", fontWeight: 600 }}>
                        {peso(t.balance)}
                      </span>
                    ) : (
                      peso(0)
                    )}
                  </td>
                  <td>
                    <StatusPill status={t.shown} />
                  </td>
                  <td>
                    <button
                      className="btn small secondary"
                      onClick={() => navigate(`/admin/tenants/${t.id}`)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty">No tenants match</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- tenant detail ---------------- */

export function TenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const can = usePerms();
  const toast = useToast();
  const { openModal } = useModal();
  const [busy, setBusy] = useState(false);

  const tenant = useApi(`/tenants/${id}`);
  const invs = useApi(can("billing") ? `/invoices?tenant=${id}` : null);
  const tix = useApi(can("maintenance") ? `/tickets?tenant=${id}` : null);

  if (tenant.loading && !tenant.data) return <Loading />;
  if (tenant.error)
    return (
      <div className="empty">
        <h3>
          {tenant.status === 404 || tenant.status === 400
            ? "Tenant not found"
            : "Couldn't load this tenant"}
        </h3>
        <p>{tenant.error}</p>
        <button
          className="btn secondary small"
          onClick={() => navigate("/admin/tenants")}
        >
          Back to tenants
        </button>
      </div>
    );

  const t = tenant.data;
  const invoices = invs.data || [];
  const tickets = tix.data || [];
  const status =
    invs.data && (t.status === "active" || t.status === "overdue")
      ? invoices.some((i) => i.status === "overdue")
        ? "overdue"
        : "active"
      : t.status;

  const refreshAll = () => {
    tenant.reload();
    invs.reload();
    tix.reload();
  };

  const run = async (action, message) => {
    setBusy(true);
    try {
      await action();
      toast(message);
      refreshAll();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openEditTenantModal = () =>
    openModal({
      title: "Edit tenant",
      Body: EditTenantModal,
      bodyProps: { tenant: t, onDone: refreshAll },
      submitLabel: "Save",
    });

  const toggleActive = () => {
    if (t.status === "inactive")
      return run(
        () => api.post(`/tenants/${t.id}/reactivate`),
        `${t.name} reactivated`,
      );
    if (
      !window.confirm(
        `Deactivate ${t.name}? They will lose access and their room will be freed.`,
      )
    )
      return;
    run(() => api.post(`/tenants/${t.id}/deactivate`), `${t.name} deactivated`);
  };

  const completeMoveOut = () =>
    run(async () => {
      try {
        await api.post(`/tenants/${t.id}/move-out/complete`, {});
      } catch (err) {
        if (
          err.status === 409 &&
          /unpaid/i.test(err.message) &&
          window.confirm(`${err.message}\n\nComplete the move-out anyway?`)
        ) {
          await api.post(`/tenants/${t.id}/move-out/complete`, { force: true });
        } else {
          throw err;
        }
      }
    }, "Move-out completed. The room is available again.");

  const declineMoveOut = () =>
    run(
      () => api.post(`/tenants/${t.id}/move-out/decline`),
      "Move-out request declined",
    );

  return (
    <>
      <button
        className="linklike"
        style={{ marginBottom: 14 }}
        onClick={() => navigate("/admin/tenants")}
      >
        ← Back to tenants
      </button>
      <div className="pageHead">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            className="avatar-sm"
            style={{ width: 48, height: 48, fontSize: 16 }}
          >
            {initials(t.name)}
          </div>
          <div>
            <h1>{t.name}</h1>
            <p>
              {t.room || "No room assigned"} · <StatusPill status={status} />
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn secondary"
            onClick={openEditTenantModal}
            disabled={busy}
          >
            Edit
          </button>
          <button className="btn danger" onClick={toggleActive} disabled={busy}>
            {t.status === "inactive" ? "Reactivate" : "Deactivate"}
          </button>
        </div>
      </div>

      {t.status === "move-out-pending" ? (
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
            <strong>Move-out requested for {t.moveOut?.date || "—"}</strong>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>
              {t.moveOut?.reason || "No reason given"}
              {t.moveOut?.notes ? ` · “${t.moveOut.notes}”` : ""}
            </div>
          </div>
          <button
            className="btn secondary small"
            onClick={declineMoveOut}
            disabled={busy}
          >
            Decline
          </button>
          <button
            className="btn brass small"
            onClick={completeMoveOut}
            disabled={busy}
          >
            Complete move-out
          </button>
        </div>
      ) : null}

      <div className="grid grid-2">
        <div className="card card-pad">
          <h3 style={{ marginBottom: 12 }}>Contact information</h3>
          <p>
            <strong>Email:</strong> {t.email}
          </p>
          <p>
            <strong>Phone:</strong> {t.phone || "—"}
          </p>
          <p>
            <strong>Emergency contact:</strong> {t.emergency || "—"}
          </p>
          <p>
            <strong>Move-in date:</strong> {t.moveIn}
          </p>
          <p>
            <strong>Outstanding balance:</strong> {peso(t.balance)}
          </p>
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 12 }}>Recent invoices</h3>
          {!can("billing") ? (
            <p style={{ color: "var(--slate)" }}>
              You don&apos;t have access to billing.
            </p>
          ) : invoices.length ? (
            invoices.slice(0, 6).map((i) => (
              <div className="checklist-item" key={i.id}>
                <span style={{ flex: 1 }}>
                  {i.period} — {peso(i.amount)}
                </span>
                <StatusPill status={i.status} />
              </div>
            ))
          ) : (
            <p style={{ color: "var(--slate)" }}>None</p>
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Maintenance history</h3>
        {!can("maintenance") ? (
          <p style={{ color: "var(--slate)" }}>
            You don&apos;t have access to maintenance.
          </p>
        ) : tickets.length ? (
          tickets.map((tk) => (
            <div className="checklist-item" key={tk.id}>
              <span style={{ flex: 1 }}>{tk.title}</span>
              <StatusPill status={tk.status} />
            </div>
          ))
        ) : (
          <p style={{ color: "var(--slate)" }}>None</p>
        )}
      </div>
    </>
  );
}

/* ---------------- rooms ---------------- */

export function Rooms() {
  const { openModal } = useModal();
  const [params, setFilter] = useFilters();
  const st = params.get("status") || "";
  const { data, loading, error, reload } = useApi(
    `/rooms${st ? `?status=${st}` : ""}`,
  );

  const openRoomModal = (room) =>
    openModal({
      title: room ? "Edit room" : "Add room",
      Body: RoomModal,
      bodyProps: { room, onDone: reload },
      submitLabel: "Save room",
    });

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const rooms = data || [];

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>Room management</h1>
          <p>
            {rooms.length} rooms{st ? ` · ${st}` : " total"}
          </p>
        </div>
        <button className="btn brass" onClick={() => openRoomModal(null)}>
          + Add room
        </button>
      </div>
      <div className="toolbar">
        <select
          value={st}
          onChange={(e) => setFilter("status", e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="occupied">Occupied</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Type</th>
              <th>Price</th>
              <th>Tenant</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rooms.length ? (
              rooms.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div className="tag-room">
                        {r.id.split("-")[1] || r.id}
                      </div>
                      <span style={{ fontWeight: 600 }}>{r.id}</span>
                    </div>
                  </td>
                  <td>
                    {r.type} · {r.beds} bed{r.beds > 1 ? "s" : ""} · Floor{" "}
                    {r.floor}
                  </td>
                  <td>{peso(r.price)}</td>
                  <td>{r.tenantName || "—"}</td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td>
                    <button
                      className="btn small secondary"
                      onClick={() => openRoomModal(r)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty">No rooms match</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- billing ---------------- */

export function AdminBilling() {
  const toast = useToast();
  const { openModal } = useModal();
  const [params, setFilter] = useFilters();
  const st = params.get("status") || "";
  const list = useApi(`/invoices${st ? `?status=${st}` : ""}`);
  const sum = useApi("/invoices/summary");
  const [exporting, setExporting] = useState(false);
  const [generating, setGenerating] = useState(false);

  const reloadAll = () => {
    list.reload();
    sum.reload();
  };

  const markPaid = (invoice) =>
    openModal({
      title: "Record payment",
      Body: MarkPaidModal,
      bodyProps: { invoice, onDone: reloadAll },
      submitLabel: "Mark as paid",
    });

  const exportCsv = async () => {
    setExporting(true);
    try {
      await download(
        `/reports/invoices.csv${st ? `?status=${st}` : ""}`,
        `invoices${st ? `-${st}` : ""}.csv`,
      );
    } catch (err) {
      toast(err.message);
    } finally {
      setExporting(false);
    }
  };

  const openGenerateInvoiceModal = () =>
    openModal({
      title: "Generate invoice",
      Body: GenerateInvoiceModal,
      bodyProps: { onDone: reloadAll },
      submitLabel: "Generate invoice",
    });

  if ((list.loading && !list.data) || (sum.loading && !sum.data))
    return <Loading />;
  if (list.error || sum.error)
    return <LoadError error={list.error || sum.error} onRetry={reloadAll} />;
  const invoices = list.data || [];
  const s = sum.data;

  const autoGenerate = async () => {
    setGenerating(true);
    try {
      const preview = await api.post("/invoices/auto-generate", {
        dryRun: true,
      });
      if (!preview.created) return toast("Everything is already invoiced");
      if (!window.confirm(`Create ${preview.created} invoice(s)?`)) return;
      const done = await api.post("/invoices/auto-generate", {});
      toast(`${done.created} invoice(s) created`);
      reloadAll();
    } catch (err) {
      toast(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const waiveFee = async (invoice) => {
    if (
      !window.confirm(
        `Waive the ${peso(invoice.lateFee)} late fee on ${invoice.id}?`,
      )
    )
      return;
    try {
      await api.post(`/invoices/${invoice.id}/waive-late-fee`);
      toast("Late fee waived");
      reloadAll();
    } catch (err) {
      toast(err.message);
    }
  };

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>Billing &amp; payments</h1>
          <p>Track invoices, payments and overdue accounts.</p>
        </div>
        <div>
          <button
            className="btn secondary"
            onClick={autoGenerate}
            disabled={generating}
          >
            Generate monthly invoices
          </button>
          <button className="btn brass" onClick={openGenerateInvoiceModal}>
            + Generate invoice
          </button>
        </div>
      </div>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card kpi">
          <span className="eyebrow">Total collected</span>
          <div className="val">{peso(s.collected)}</div>
        </div>
        <div className="card kpi">
          <span className="eyebrow">Overdue</span>
          <div className="val" style={{ color: "var(--rust)" }}>
            {peso(s.overdueTotal)}
          </div>
        </div>
        <div className="card kpi">
          <span className="eyebrow">Unpaid invoices</span>
          <div className="val">{s.unpaidCount}</div>
        </div>
      </div>
      <div className="toolbar">
        <select
          value={st}
          onChange={(e) => setFilter("status", e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="overdue">Overdue</option>
        </select>
        <div className="spacer" />
        <button
          className="btn small secondary"
          onClick={exportCsv}
          disabled={exporting}
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Tenant</th>
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
                  <td>{i.tenantName || "—"}</td>
                  <td>
                    {i.period}
                    {i.kind === "maintenance" ? (
                      <span className="tag-mini">Repair</span>
                    ) : null}
                  </td>
                  <td>
                    {peso(i.amount)}
                    {i.lateFee > 0 ? (
                      <div style={{ fontSize: 12, color: "var(--rust)" }}>
                        {peso(i.baseAmount)} + {peso(i.lateFee)} late fee
                      </div>
                    ) : null}
                  </td>
                  <td>{i.due}</td>
                  <td>
                    <StatusPill status={i.status} />
                  </td>
                  <td>
                    {i.status !== "paid" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn small brass"
                          onClick={() => markPaid(i)}
                        >
                          Mark paid
                        </button>
                        {i.lateFee > 0 ? (
                          <button
                            className="btn small secondary"
                            onClick={() => waiveFee(i)}
                          >
                            Waive fee
                          </button>
                        ) : null}
                      </div>
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
                <td colSpan={7}>
                  <div className="empty">No invoices match</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- maintenance ---------------- */

export function AdminMaintenance() {
  const can = usePerms();
  const toast = useToast();
  const { openModal } = useModal();
  const [params, setFilter] = useFilters();
  const st = params.get("status") || "";
  const list = useApi(`/tickets${st ? `?status=${st}` : ""}`);
  const assignees = useApi("/tickets/assignees");
  const [busyId, setBusyId] = useState(null);

  const patch = async (id, body, message) => {
    setBusyId(id);
    try {
      await api.patch(`/tickets/${id}`, body);
      toast(message);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusyId(null);
      list.reload();
    }
  };

  const viewTicket = (tk) =>
    openModal({
      title: tk.title,
      Body: ViewTicketModal,
      bodyProps: { ticket: tk, onDone: list.reload, canCharge: can("billing") },
      submitLabel: "Save notes",
    });

  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <LoadError error={list.error} onRetry={list.reload} />;
  const tickets = list.data || [];

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>Maintenance management</h1>
          <p>
            {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
            {st ? ` · ${st}` : ""}
          </p>
        </div>
      </div>
      <div className="toolbar">
        <select
          value={st}
          onChange={(e) => setFilter("status", e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in-progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Room / Tenant</th>
              <th>Priority</th>
              <th>Assigned</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tickets.length ? (
              tickets.map((tk) => (
                <tr key={tk.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{tk.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--slate)" }}>
                      {tk.id} · {tk.category} · {tk.created}
                      {tk.charge
                        ? ` · charge ${peso(tk.charge.amount)} (${tk.charge.status})`
                        : ""}
                    </div>
                  </td>
                  <td>
                    {tk.room} · {tk.tenantName || "—"}
                  </td>
                  <td>
                    <StatusPill status={tk.priority} />
                  </td>
                  <td>
                    <select
                      value={tk.assigned || ""}
                      disabled={busyId === tk.id}
                      onChange={(e) =>
                        patch(
                          tk.id,
                          { assigned: e.target.value },
                          "Ticket updated",
                        )
                      }
                    >
                      <option value="">Unassigned</option>
                      {(assignees.data || []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={tk.status}
                      disabled={busyId === tk.id}
                      onChange={(e) =>
                        patch(
                          tk.id,
                          { status: e.target.value },
                          "Status updated",
                        )
                      }
                    >
                      <option value="open">Open</option>
                      <option value="in-progress">In progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn small secondary"
                      onClick={() => viewTicket(tk)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty">No tickets match</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- reservations ---------------- */

export function Reservations() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setFilter] = useFilters();
  const st = params.get("status") || "pending";
  const list = useApi(`/reservations${st === "all" ? "" : `?status=${st}`}`);
  const [busyId, setBusyId] = useState(null);

  const act = async (r, action, message) => {
    setBusyId(r.id);
    try {
      await api.post(`/reservations/${r.id}/${action}`);
      toast(message);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusyId(null);
      list.reload();
    }
  };

  const approve = (r) => {
    if (
      r.moveInStatus !== "approved" &&
      !window.confirm(
        `${r.tenantName}'s move-in form hasn't been approved yet. Approve the reservation anyway?`,
      )
    )
      return;
    act(r, "approve", `${r.tenantName} moved into ${r.room}`);
  };

  const decline = (r) => {
    if (
      !window.confirm(
        `Decline ${r.tenantName}'s reservation for ${r.room}? The room will be released.`,
      )
    )
      return;
    act(r, "decline", "Reservation declined and room released");
  };

  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <LoadError error={list.error} onRetry={list.reload} />;
  const rows = list.data || [];

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>Reservations</h1>
          <p>
            Approving a reservation moves the tenant into the room. Confirm the
            deposit first.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <select
          value={st}
          onChange={(e) => setFilter("status", e.target.value)}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
          <option value="all">All</option>
        </select>
        <div className="spacer" />
        <span style={{ color: "var(--slate)", fontSize: 12.5 }}>
          {rows.length} results
        </span>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Room</th>
              <th>Move-in</th>
              <th>Move-in form</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.tenant ? (
                      <button
                        className="linklike"
                        onClick={() => navigate(`/admin/tenants/${r.tenant}`)}
                      >
                        {r.tenantName || "—"}
                      </button>
                    ) : (
                      <span style={{ color: "var(--slate)" }}>
                        Deleted tenant
                      </span>
                    )}
                    <div style={{ fontSize: 11.5, color: "var(--slate)" }}>
                      {r.id}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.room}</div>
                    {r.requests ? (
                      <div style={{ fontSize: 11.5, color: "var(--slate)" }}>
                        “{r.requests}”
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {r.moveInDate}
                    <div style={{ fontSize: 11.5, color: "var(--slate)" }}>
                      {r.lease} lease
                    </div>
                  </td>
                  <td>
                    {r.moveInStatus ? (
                      <StatusPill status={r.moveInStatus} />
                    ) : (
                      <span style={{ color: "var(--slate)", fontSize: 12 }}>
                        Not submitted
                      </span>
                    )}
                  </td>
                  <td>
                    <StatusPill status={r.status} />
                    {r.status === "pending" ? (
                      <div style={{ fontSize: 11.5, color: "var(--slate)" }}>
                        Hold ends {fmtDateTime(r.holdUntil)}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {r.status === "pending" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn small secondary"
                          onClick={() => decline(r)}
                          disabled={busyId === r.id}
                        >
                          Decline
                        </button>
                        <button
                          className="btn small brass"
                          onClick={() => approve(r)}
                          disabled={busyId === r.id}
                        >
                          {busyId === r.id ? "Saving…" : "Approve"}
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty">No reservations here</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- move-in form review ---------------- */

export function MoveInReviews() {
  const navigate = useNavigate();
  const toast = useToast();
  const { openModal } = useModal();
  const [params, setFilter] = useFilters();
  const st = params.get("status") || "submitted";
  const list = useApi(`/move-in${st === "all" ? "" : `?status=${st}`}`);
  const [busyId, setBusyId] = useState(null);

  const approve = async (f) => {
    setBusyId(f.id);
    try {
      await api.post(`/move-in/${f.id}/review`, { decision: "approved" });
      toast(`${f.tenantName}'s move-in form approved`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusyId(null);
      list.reload();
    }
  };

  const reject = (f) =>
    openModal({
      title: `Send back · ${f.tenantName}`,
      Body: RejectFormModal,
      bodyProps: { form: f, onDone: list.reload },
      submitLabel: "Send back",
    });

  // The ID file needs the login token, so it is fetched and opened as a blob
  const viewId = async (f) => {
    const win = window.open("", "_blank");
    if (!win) return toast("Allow pop-ups for this site to view the ID");
    try {
      const url = URL.createObjectURL(
        await fetchBlob(`/move-in/${f.id}/id-file`),
      );
      win.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    } catch (err) {
      win.close();
      toast(err.message);
    }
  };

  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <LoadError error={list.error} onRetry={list.reload} />;
  const forms = list.data || [];

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>Move-in forms</h1>
          <p>
            Check each tenant&apos;s details and ID, then approve or send the
            form back.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <select
          value={st}
          onChange={(e) => setFilter("status", e.target.value)}
        >
          <option value="submitted">Awaiting review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Sent back</option>
          <option value="all">All</option>
        </select>
        <div className="spacer" />
        <span style={{ color: "var(--slate)", fontSize: 12.5 }}>
          {forms.length} results
        </span>
      </div>

      {forms.length ? (
        forms.map((f) => (
          <div
            className="card card-pad"
            style={{ marginBottom: 16 }}
            key={f.id}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <div className="avatar-sm">{initials(f.tenantName || "?")}</div>
              <div style={{ flex: 1, minWidth: 180 }}>
                {f.tenant ? (
                  <button
                    className="linklike"
                    style={{ fontWeight: 600 }}
                    onClick={() => navigate(`/admin/tenants/${f.tenant}`)}
                  >
                    {f.tenantName}
                  </button>
                ) : (
                  <span style={{ fontWeight: 600, color: "var(--slate)" }}>
                    Deleted tenant
                  </span>
                )}
                <div style={{ fontSize: 11.5, color: "var(--slate)" }}>
                  Updated {fmtDateTime(f.updatedAt)}
                </div>
              </div>
              <StatusPill status={f.status} />
            </div>
            <div className="grid grid-2">
              <div>
                <p>
                  <strong>Legal name:</strong> {f.legalName}
                </p>
                <p>
                  <strong>Date of birth:</strong> {f.dob}
                </p>
                <p>
                  <strong>Email:</strong> {f.email || "—"}
                </p>
                <p>
                  <strong>Phone:</strong> {f.phone || "—"}
                </p>
              </div>
              <div>
                <p>
                  <strong>Government ID:</strong> {f.govId}
                </p>
                <p>
                  <strong>Emergency contact:</strong> {f.emergencyName}
                  {f.emergencyRelationship
                    ? ` (${f.emergencyRelationship})`
                    : ""}{" "}
                  · {f.emergencyPhone}
                </p>
              </div>
            </div>
            {f.status === "rejected" && f.reviewNote ? (
              <p style={{ marginTop: 8, fontSize: 13 }}>
                <strong>Note sent to tenant:</strong> {f.reviewNote}
              </p>
            ) : null}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              {f.hasId ? (
                <button
                  className="btn small secondary"
                  onClick={() => viewId(f)}
                >
                  View ID
                </button>
              ) : null}
              {f.status === "submitted" ? (
                <>
                  <button
                    className="btn small secondary"
                    onClick={() => reject(f)}
                    disabled={busyId === f.id}
                  >
                    Send back
                  </button>
                  <button
                    className="btn small brass"
                    onClick={() => approve(f)}
                    disabled={busyId === f.id}
                  >
                    {busyId === f.id ? "Saving…" : "Approve"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))
      ) : (
        <div className="empty">
          <h3>Nothing here</h3>
          <p>No forms match this filter.</p>
        </div>
      )}
    </>
  );
}

/* ---------------- reports ---------------- */

export function Reports() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi("/reports/summary");
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await download("/reports/invoices.csv", "invoices.csv");
    } catch (err) {
      toast(err.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;

  const { rooms, occupancyRate, revenueByFloor, totalCollected } = data;
  const maxRev = Math.max(...revenueByFloor.map((r) => r.revenue), 1);

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Management</span>
          <h1>Reports</h1>
          <p>Occupancy and revenue snapshots.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn secondary"
            onClick={exportCsv}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Export invoices CSV"}
          </button>
          <button className="btn brass" onClick={() => window.print()}>
            Print / PDF
          </button>
        </div>
      </div>
      <div className="grid grid-2">
        <div className="card card-pad">
          <h3 style={{ marginBottom: 14 }}>Occupancy report</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: "50%",
                background: `conic-gradient(var(--brass) 0 ${occupancyRate}%, var(--line) ${occupancyRate}% 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: "50%",
                  background: "var(--paper-raised)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--serif)",
                  fontWeight: 600,
                  fontSize: 18,
                  WebkitPrintColorAdjust: "exact",
                  printColorAdjust: "exact",
                }}
              >
                {occupancyRate}%
              </div>
            </div>
            <div>
              {["occupied", "reserved", "available", "maintenance"].map((s) => (
                <p key={s}>
                  <StatusPill status={s} /> {rooms[s]} room
                  {rooms[s] === 1 ? "" : "s"}
                </p>
              ))}
            </div>
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 4 }}>Monthly rent by floor</h3>
          <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 14 }}>
            Based on the monthly rates of occupied rooms.
          </p>
          {revenueByFloor.map((r) => (
            <div style={{ marginBottom: 12 }} key={r.floor}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12.5,
                  marginBottom: 5,
                }}
              >
                <span>Floor {r.floor}</span>
                <span style={{ color: "var(--slate)" }}>{peso(r.revenue)}</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${(r.revenue / maxRev) * 100}%` }}
                />
              </div>
            </div>
          ))}
          <div className="divider" />
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>
            Total collected to date:{" "}
            <strong style={{ color: "var(--ink)" }}>
              {peso(totalCollected)}
            </strong>
          </p>
        </div>
      </div>
    </>
  );
}

/* ---------------- staff ---------------- */

export function Staff() {
  const { user, refresh } = useAuth();
  const { openModal } = useModal();
  const { data, loading, error, reload } = useApi("/staff");

  // if you edit your own account, refresh your session so the sidebar matches
  const done = () => {
    reload();
    refresh();
  };

  const openAddStaffModal = () =>
    openModal({
      title: "Add staff member",
      Body: AddStaffModal,
      bodyProps: { onDone: done },
      submitLabel: "Add staff",
    });
  const openEditStaffModal = (s) =>
    openModal({
      title: `Edit ${s.name}`,
      Body: EditStaffModal,
      bodyProps: { staff: s, onDone: done },
      submitLabel: "Save",
    });

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const staff = data || [];

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Management</span>
          <h1>Staff &amp; user management</h1>
          <p>{staff.length} accounts</p>
        </div>
        <button className="btn brass" onClick={openAddStaffModal}>
          + Add staff
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Username</th>
              <th>Permissions</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div className="avatar-sm">{initials(s.name)}</div>
                    {s.name}
                    {s.id === user.id ? (
                      <span style={{ color: "var(--slate)", fontSize: 11.5 }}>
                        (you)
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>{s.role}</td>
                <td>{s.username}</td>
                <td>
                  {s.perms.length ? (
                    s.perms.map((p) => (
                      <span
                        className="pill neutral"
                        style={{ margin: 2 }}
                        key={p}
                      >
                        {p}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "var(--slate)", fontSize: 12 }}>
                      None
                    </span>
                  )}
                </td>
                <td>
                  <button
                    className="btn small secondary"
                    onClick={() => openEditStaffModal(s)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- settings ---------------- */

function SettingsForm({ initial }) {
  const toast = useToast();
  const [f, setF] = useState({
    propertyName: initial.propertyName,
    address: initial.address,
  });
  const [bill, setBill] = useState({
    autoInvoice: !!initial.autoInvoice,
    billingDueDay: String(initial.billingDueDay ?? 5),
    invoiceLeadDays: String(initial.invoiceLeadDays ?? 7),
  });
  const [cycleLabel, setCycleLabel] = useState(initial.billingCycle);
  const [t, setT] = useState({ ...initial.notifTemplates });
  const [ch, setCh] = useState({
    email: !!initial.notifChannels?.email,
    sms: !!initial.notifChannels?.sms,
  });
  const ready = initial.channelStatus || {};
  const [busy, setBusy] = useState(null);

  const [late, setLate] = useState({
    lateFeeEnabled: !!initial.lateFeeEnabled,
    lateFeeFlat: String(initial.lateFeeFlat ?? 200),
    lateFeeWeeklyPct: String(initial.lateFeeWeeklyPct ?? 1),
    lateFeeGraceDays: String(initial.lateFeeGraceDays ?? 0),
    lateFeeCap: String(initial.lateFeeCap ?? 0),
  });
  const [lateLabel, setLateLabel] = useState(initial.lateFee);

  const previewFees = async () => {
    setBusy("preview");
    try {
      const r = await api.post("/settings/late-fees/preview");
      toast(
        r.invoices.length
          ? `${r.invoices.length} overdue invoice(s) would be charged ₱${r.added.toLocaleString()} in late fees`
          : "No overdue invoices would be charged",
      );
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(null);
    }
  };

  const save = async (which, body, message) => {
    setBusy(which);
    try {
      const res = await api.put("/settings", body);
      toast(message);
      return res;
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(null);
    }
  };

  const setField = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setTpl = (k) => (e) => setT((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="grid grid-2">
      <div className="card card-pad">
        <h3 style={{ marginBottom: 14 }}>Property information</h3>
        <div className="field">
          <label>Property name</label>
          <input value={f.propertyName} onChange={setField("propertyName")} />
        </div>
        <div className="field">
          <label>Address</label>
          <input value={f.address} onChange={setField("address")} />
        </div>
        <button
          className="btn brass"
          onClick={() => save("property", f, "Property settings saved")}
          disabled={busy === "property"}
        >
          {busy === "property" ? "Saving…" : "Save changes"}
        </button>
      </div>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 6 }}>Automatic invoicing</h3>
        <p style={{ color: "var(--slate)", fontSize: 12, marginBottom: 6 }}>
          Creates each tenant&apos;s monthly rent invoice from their room&apos;s
          price. A tenant who moves in mid-month is charged a prorated first
          invoice. Formula: price × days remaining ÷ days in month
        </p>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={bill.autoInvoice}
            onChange={(e) =>
              setBill((s) => ({ ...s, autoInvoice: e.target.checked }))
            }
          />
          <span>
            <span className="label">Create invoices automatically</span>
            <span className="sub" style={{ display: "block" }}>
              When on, anyone not yet billed for the current cycle is invoiced
              right away. Preview first with &quot;Generate monthly
              invoices&quot; on the Billing page.
            </span>
          </span>
        </label>
        <div className="field">
          <label>Rent due on day of the month (1–31)</label>
          <input
            type="number"
            min="1"
            max="31"
            value={bill.billingDueDay}
            onChange={(e) =>
              setBill((s) => ({ ...s, billingDueDay: e.target.value }))
            }
          />
        </div>
        <div className="field">
          <label>Send invoice this many days before the due date</label>
          <input
            type="number"
            min="0"
            max="28"
            value={bill.invoiceLeadDays}
            onChange={(e) =>
              setBill((s) => ({ ...s, invoiceLeadDays: e.target.value }))
            }
          />
        </div>
        <p style={{ color: "var(--slate)", fontSize: 12, marginBottom: 14 }}>
          Billing cycle: {cycleLabel}
        </p>
        <button
          className="btn brass"
          disabled={busy === "billing"}
          onClick={async () => {
            const res = await save(
              "billing",
              {
                autoInvoice: bill.autoInvoice,
                billingDueDay: Number(bill.billingDueDay),
                invoiceLeadDays: Number(bill.invoiceLeadDays),
              },
              "Billing settings saved",
            );
            if (res) setCycleLabel(res.billingCycle);
          }}
        >
          {busy === "billing" ? "Saving…" : "Save billing settings"}
        </button>
      </div>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 6 }}>Late fees</h3>
        <p style={{ color: "var(--slate)", fontSize: 12, marginBottom: 6 }}>
          A flat fee once an invoice is late, then a percentage of the rent for
          every full week after that. Rent invoices only.
        </p>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={late.lateFeeEnabled}
            onChange={(e) =>
              setLate((s) => ({ ...s, lateFeeEnabled: e.target.checked }))
            }
          />
          <span>
            <span className="label">Charge late fees</span>
            <span className="sub" style={{ display: "block" }}>
              When on, every overdue rent invoice is charged within the hour.
              Use Preview first.
            </span>
          </span>
        </label>
        <div className="field">
          <label>Flat fee (₱)</label>
          <input
            type="number"
            min="0"
            value={late.lateFeeFlat}
            onChange={(e) =>
              setLate((s) => ({ ...s, lateFeeFlat: e.target.value }))
            }
          />
        </div>
        <div className="field">
          <label>Extra per full week late (% of rent)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={late.lateFeeWeeklyPct}
            onChange={(e) =>
              setLate((s) => ({ ...s, lateFeeWeeklyPct: e.target.value }))
            }
          />
        </div>
        <div className="field">
          <label>Grace days before any fee</label>
          <input
            type="number"
            min="0"
            max="30"
            value={late.lateFeeGraceDays}
            onChange={(e) =>
              setLate((s) => ({ ...s, lateFeeGraceDays: e.target.value }))
            }
          />
        </div>
        <div className="field">
          <label>Maximum fee per invoice (₱, 0 = no limit)</label>
          <input
            type="number"
            min="0"
            value={late.lateFeeCap}
            onChange={(e) =>
              setLate((s) => ({ ...s, lateFeeCap: e.target.value }))
            }
          />
        </div>
        <p style={{ color: "var(--slate)", fontSize: 12, marginBottom: 14 }}>
          Policy: {lateLabel}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn secondary"
            onClick={previewFees}
            disabled={busy === "preview"}
          >
            {busy === "preview" ? "Checking…" : "Preview"}
          </button>
          <button
            className="btn brass"
            disabled={busy === "late"}
            onClick={async () => {
              const res = await save(
                "late",
                {
                  lateFeeEnabled: late.lateFeeEnabled,
                  lateFeeFlat: Number(late.lateFeeFlat),
                  lateFeeWeeklyPct: Number(late.lateFeeWeeklyPct),
                  lateFeeGraceDays: Number(late.lateFeeGraceDays),
                  lateFeeCap: Number(late.lateFeeCap),
                },
                "Late fee settings saved",
              );
              if (res) setLateLabel(res.lateFee);
            }}
          >
            {busy === "late" ? "Saving…" : "Save late fee settings"}
          </button>
        </div>
      </div>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 6 }}>Notification templates</h3>
        <p style={{ color: "var(--slate)", fontSize: 12, marginBottom: 14 }}>
          Used for the in-app bell and for email / SMS when those are switched
          on. You can use {"{name}"}, {"{period}"}, {"{amount}"}, {"{due}"},{" "}
          {"{title}"} and {"{status}"}.
        </p>
        <div className="field">
          <label>Invoice notice</label>
          <textarea value={t.invoice} onChange={setTpl("invoice")} />
        </div>
        <div className="field">
          <label>Overdue notice</label>
          <textarea value={t.overdue} onChange={setTpl("overdue")} />
        </div>
        <div className="field">
          <label>Ticket status update</label>
          <textarea value={t.ticket} onChange={setTpl("ticket")} />
        </div>
        <button
          className="btn secondary"
          onClick={() =>
            save("templates", { notifTemplates: t }, "Templates saved")
          }
          disabled={busy === "templates"}
        >
          {busy === "templates" ? "Saving…" : "Save templates"}
        </button>
      </div>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 6 }}>Notification Email Toggle</h3>
        <p style={{ color: "var(--slate)", fontSize: 12, marginBottom: 6 }}>
          The in-app bell is always on. Switch on email send each notice to the
          tenant&apos;s email address.
        </p>
        {[
          [
            "email",
            "Email",
            "Sends to the tenant's email address.",
            "Add the SMTP_* settings to .env",
          ],
          [
            "sms",
            "SMS",
            "Sends a text to the tenant's phone number.",
            "Add SEMAPHORE_API_KEY to .env",
          ],
        ].map(([key, label, sub, fix]) => (
          <label className="switch-row" key={key}>
            <input
              type="checkbox"
              checked={ch[key]}
              onChange={(e) =>
                setCh((s) => ({ ...s, [key]: e.target.checked }))
              }
            />
            <span>
              <span className="label">{label}</span>
              <span className="sub" style={{ display: "block" }}>
                {sub}
              </span>
              {ch[key] && !ready[key] ? (
                <span
                  className="sub"
                  style={{ display: "block", color: "var(--rust)" }}
                >
                  Switched on, but not set up yet, so nothing is sent. {fix},
                  then restart the server.
                </span>
              ) : null}
            </span>
          </label>
        ))}
        <button
          className="btn secondary"
          style={{ marginTop: 14 }}
          onClick={() =>
            save(
              "channels",
              { notifChannels: ch },
              "Notification channels saved",
            )
          }
          disabled={busy === "channels"}
        >
          {busy === "channels" ? "Saving…" : "Save channels"}
        </button>
      </div>
    </div>
  );
}

export function Settings() {
  const { data, loading, error, reload } = useApi("/settings");
  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Management</span>
          <h1>Settings</h1>
          <p>Property configuration and templates.</p>
        </div>
      </div>
      <SettingsForm initial={data} />
    </>
  );
}
