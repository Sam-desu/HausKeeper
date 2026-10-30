import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { Loading, LoadError } from './Common.jsx';
import { LayoutPreview } from './RoomDesigner.jsx';

const when = (iso) =>
  new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// Admin side: pictures of the rooms tenants have designed (read only). Opens at /admin/room-layouts?tenant=<id>.
export function AdminRoomLayouts() {
  const [params, setParams] = useSearchParams();
  const list = useApi('/room-layouts');
  const selected = params.get('tenant') || list.data?.[0]?.tenant || null;
  const detail = useApi(selected ? `/room-layouts/tenant/${selected}` : null);

  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <LoadError error={list.error} onRetry={list.reload} />;

  const rows = list.data || [];
  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>Room layouts</h1>
          <p>Pictures of how tenants have arranged their rooms. A layout appears here when the tenant saves it in the Room Designer.</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <h3>No layouts yet</h3>
          <p>When a tenant saves a design of their room, it will show up here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <div className="card" style={{ overflow: 'hidden' }}>
            {rows.map((r) => (
              <button
                key={r.tenant}
                onClick={() => setParams({ tenant: r.tenant }, { replace: true })}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 0,
                  borderBottom: '1px solid var(--line-soft)', cursor: 'pointer', fontFamily: 'var(--sans)',
                  color: 'var(--ink)', background: r.tenant === selected ? 'var(--brass-tint)' : 'transparent',
                }}
              >
                <strong style={{ fontSize: 'var(--t-sm)' }}>{r.tenantName}</strong>
                <div style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-soft)', marginTop: 2 }}>
                  Room {r.room} · {r.items} item{r.items === 1 ? '' : 's'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--slate)', marginTop: 2 }}>Saved {when(r.updatedAt)}</div>
              </button>
            ))}
          </div>

          <div className="card card-pad">
            {detail.loading && !detail.data ? (
              <Loading />
            ) : detail.error ? (
              <LoadError error={detail.error} onRetry={detail.reload} />
            ) : detail.data ? (
              <>
                <h3 style={{ marginBottom: 2 }}>
                  {detail.data.tenant.name} · Room {detail.data.tenant.room}
                  {detail.data.tenant.roomType ? ` (${detail.data.tenant.roomType})` : ''}
                </h3>
                <p style={{ margin: '0 0 14px', fontSize: 'var(--t-xs)', color: 'var(--slate-dark)' }}>
                  Last saved {when(detail.data.updatedAt)}
                </p>
                <LayoutPreview layout={detail.data.layout} filename={`room-${detail.data.tenant.room}-${detail.data.tenant.name.split(' ')[0].toLowerCase()}`} />
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
