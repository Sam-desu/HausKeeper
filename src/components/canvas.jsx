import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Text, Circle } from 'react-konva';
import { peso } from '../data.js';
import { api } from '../api.js';
import { useApi } from '../useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { StatusPill, Loading, LoadError } from './Common.jsx';

// Logical size of the floor plan. The canvas scales to fit the screen, but saved
// coordinates always refer to this 1200 x 800 space.
const W = 1200;
const H = 800;
const GRID = 40;

const STATUS_STYLE = {
  available: { fill: 'rgba(60, 200, 100, 0.55)', label: 'Available' },
  reserved: { fill: 'rgba(240, 170, 40, 0.6)', label: 'Reserved' },
  occupied: { fill: 'rgba(235, 80, 80, 0.55)', label: 'Occupied' },
  maintenance: { fill: 'rgba(150, 150, 150, 0.6)', label: 'Maintenance' },
};

const snap = (v, max) => Math.min(max, Math.max(0, Math.round(v / GRID) * GRID));

// Centre of a polygon's bounding box, used to place the room label
function center(points) {
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/* ---------------- data loading ---------------- */

export default function AdminMap() {
  const { user } = useAuth();
  const canEdit = !!user.perms?.includes('rooms');

  const map = useApi('/map');
  // staff with the rooms permission also need the full room list: to offer rooms that
  // have no outline yet, and to show who lives in each room
  const all = useApi(canEdit ? '/rooms' : null);

  if ((map.loading && !map.data) || (canEdit && all.loading && !all.data)) return <Loading />;
  if (map.error || all.error)
    return (
      <LoadError
        title="Couldn't load the map"
        error={map.error || all.error}
        onRetry={() => {
          map.reload();
          all.reload();
        }}
      />
    );

  if (!map.data.floors.length)
    return (
      <div className="empty">
        <h3>No rooms yet</h3>
        <p>Add rooms first, then come back to draw them on the map.</p>
      </div>
    );

  return (
    <MapEditor
      floors={map.data.floors}
      mapped={map.data.rooms}
      allRooms={all.data}
      canEdit={canEdit}
      onChanged={() => {
        map.reload();
        all.reload();
      }}
    />
  );
}

/* ---------------- the editor ---------------- */

function MapEditor({ floors, mapped, allRooms, canEdit, onChanged }) {
  const toast = useToast();
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(W);
  const [floor, setFloor] = useState(floors[0]);
  const [selectedId, setSelectedId] = useState(null);
  const [pickId, setPickId] = useState('');
  const [drawing, setDrawing] = useState(null); // { roomId, points: [x1, y1, ...] }
  const [hover, setHover] = useState(null); // snapped pointer position while drawing
  const [saving, setSaving] = useState(false);

  // scale the plan to the width of its container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = width / W;

  // Esc cancels drawing
  useEffect(() => {
    if (!drawing) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setDrawing(null);
        setHover(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawing]);

  const floorRooms = mapped.filter((r) => r.floor === floor);
  const unmapped = (allRooms || []).filter((r) => r.floor === floor && !r.plan?.length);
  const selected = selectedId ? (allRooms || []).find((r) => r.id === selectedId) ?? mapped.find((r) => r.id === selectedId) : null;
  const pickValue = unmapped.some((r) => r.id === pickId) ? pickId : unmapped[0]?.id || '';

  const gridLines = useMemo(() => {
    const lines = [];
    for (let x = 0; x <= W; x += GRID)
      lines.push(<Line key={`v${x}`} points={[x, 0, x, H]} stroke="#e3e3e3" strokeWidth={1} strokeScaleEnabled={false} />);
    for (let y = 0; y <= H; y += GRID)
      lines.push(<Line key={`h${y}`} points={[0, y, W, y]} stroke="#e3e3e3" strokeWidth={1} strokeScaleEnabled={false} />);
    return lines;
  }, []);

  /* ----- drawing ----- */

  const startDrawing = (roomId) => {
    setSelectedId(null);
    setHover(null);
    setDrawing({ roomId, points: [] });
  };

  const cancelDrawing = () => {
    setDrawing(null);
    setHover(null);
  };

  const finish = async () => {
    if (!drawing || drawing.points.length < 6) return toast('A room needs at least 3 corners');
    setSaving(true);
    try {
      await api.put(`/map/${encodeURIComponent(drawing.roomId)}`, { points: drawing.points });
      toast(`Outline saved for ${drawing.roomId}`);
      setSelectedId(drawing.roomId);
      setDrawing(null);
      setHover(null);
      onChanged();
    } catch (err) {
      toast(err.message); // e.g. "The outline crosses itself": keep the points so they can be fixed
    } finally {
      setSaving(false);
    }
  };

  const pointerPos = (e) => {
    const p = e.target.getStage().getRelativePointerPosition();
    return p ? [snap(p.x, W), snap(p.y, H)] : null;
  };

  const onStageClick = (e) => {
    if (!drawing) {
      if (e.target === e.target.getStage()) setSelectedId(null); // clicked empty space
      return;
    }
    const p = pointerPos(e);
    if (!p) return;
    const pts = drawing.points;
    const n = pts.length / 2;
    if (n >= 3 && p[0] === pts[0] && p[1] === pts[1]) return finish(); // clicked the first corner: close the shape
    if (n >= 1 && p[0] === pts[pts.length - 2] && p[1] === pts[pts.length - 1]) return; // same corner twice
    setDrawing({ ...drawing, points: [...pts, ...p] });
  };

  const onStageMove = (e) => {
    if (drawing && drawing.points.length) setHover(pointerPos(e));
  };

  const undoPoint = () => setDrawing((d) => ({ ...d, points: d.points.slice(0, -2) }));

  const removeOutline = async (room) => {
    if (!window.confirm(`Remove ${room.id} from the map? The room itself is not deleted.`)) return;
    setSaving(true);
    try {
      await api.del(`/map/${encodeURIComponent(room.id)}`);
      toast(`${room.id} removed from the map`);
      setSelectedId(null);
      onChanged();
    } catch (err) {
      toast(err.message);
    } finally {
      setSaving(false);
    }
  };

  /* ----- render ----- */

  const pts = drawing?.points || [];
  const nPts = pts.length / 2;

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">Management</span>
          <h1>Floor plan</h1>
          <p>{canEdit ? 'Draw each room’s outline. Colours follow the room’s live status.' : 'Room outlines coloured by their live status.'}</p>
        </div>
      </div>

      <div className="toolbar">
        {floors.map((f) => (
          <button
            key={f}
            className={`btn small ${f === floor ? 'brass' : 'secondary'}`}
            disabled={!!drawing}
            onClick={() => {
              setFloor(f);
              setSelectedId(null);
            }}
          >
            Floor {f}
          </button>
        ))}
        <div className="spacer" />
        {Object.entries(STATUS_STYLE).map(([key, s]) => (
          <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--slate)' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: s.fill, border: '1px solid #3338' }} />
            {s.label}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* canvas */}
        <div className="card" style={{ flex: '1 1 480px', minWidth: 0, padding: 8 }}>
          <div ref={wrapRef} style={{ width: '100%' }}>
            <Stage
              width={width}
              height={H * scale}
              scaleX={scale}
              scaleY={scale}
              onClick={onStageClick}
              onTap={onStageClick}
              onMouseMove={onStageMove}
              onTouchMove={onStageMove}
              style={{ background: '#f8f9fa', borderRadius: 6, cursor: drawing ? 'crosshair' : 'default' }}
            >
              <Layer listening={false}>{gridLines}</Layer>

              <Layer>
                {floorRooms.map((r) => {
                  const [cx, cy] = center(r.plan);
                  const isSel = r.id === selectedId;
                  const redrawing = drawing?.roomId === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <Line
                        points={r.plan}
                        closed
                        fill={(STATUS_STYLE[r.status] || STATUS_STYLE.available).fill}
                        stroke={isSel ? '#b8862b' : '#333'}
                        strokeWidth={isSel ? 4 : 2}
                        strokeScaleEnabled={false}
                        opacity={redrawing ? 0.25 : 1}
                        listening={!drawing}
                        onClick={() => setSelectedId(r.id)}
                        onTap={() => setSelectedId(r.id)}
                        onMouseEnter={(e) => (e.target.getStage().container().style.cursor = 'pointer')}
                        onMouseLeave={(e) => (e.target.getStage().container().style.cursor = drawing ? 'crosshair' : 'default')}
                      />
                      <Text
                        text={r.id}
                        x={cx - 40}
                        y={cy - 8}
                        width={80}
                        align="center"
                        fontSize={15}
                        fontStyle="bold"
                        fill="#222"
                        listening={false}
                      />
                    </React.Fragment>
                  );
                })}

                {/* the outline being drawn */}
                {drawing && nPts >= 1 ? (
                  <>
                    {nPts >= 2 ? (
                      <Line
                        points={hover ? [...pts, ...hover] : pts}
                        closed
                        fill="rgba(0, 123, 255, 0.15)"
                        listening={false}
                      />
                    ) : null}
                    <Line points={pts} stroke="#007bff" strokeWidth={3} strokeScaleEnabled={false} listening={false} />
                    {hover ? (
                      <Line
                        points={[pts[pts.length - 2], pts[pts.length - 1], hover[0], hover[1]]}
                        stroke="#007bff"
                        strokeWidth={2}
                        dash={[10, 5]}
                        strokeScaleEnabled={false}
                        listening={false}
                      />
                    ) : null}
                    {Array.from({ length: nPts }, (_, i) => (
                      <Circle
                        key={i}
                        x={pts[i * 2]}
                        y={pts[i * 2 + 1]}
                        radius={i === 0 && nPts >= 3 ? 10 : 6}
                        fill={i === 0 && nPts >= 3 ? '#1aa34a' : '#007bff'}
                        listening={false}
                      />
                    ))}
                  </>
                ) : null}
              </Layer>
            </Stage>
          </div>
          {!floorRooms.length && !drawing ? (
            <p style={{ color: 'var(--slate)', fontSize: 13, padding: '8px 10px 2px' }}>
              No rooms are drawn on floor {floor} yet.
              {canEdit ? ' Use the panel on the right to add one.' : ''}
            </p>
          ) : null}
        </div>

        {/* side panel */}
        <div className="card card-pad" style={{ flex: '0 1 300px', minWidth: 260 }}>
          {drawing ? (
            <>
              <h3 style={{ marginBottom: 8 }}>Drawing {drawing.roomId}</h3>
              <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 12 }}>
                Click grid points to place corners. Click the green first corner to close the shape, or press Save. Esc cancels.
              </p>
              <p style={{ fontSize: 12.5, marginBottom: 12 }}>
                <strong>{nPts}</strong> corner{nPts === 1 ? '' : 's'} placed{nPts < 3 ? ' (need at least 3)' : ''}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn brass small" onClick={finish} disabled={nPts < 3 || saving}>
                  {saving ? 'Saving…' : 'Save outline'}
                </button>
                <button className="btn secondary small" onClick={undoPoint} disabled={!nPts || saving}>
                  Undo point
                </button>
                <button className="btn secondary small" onClick={cancelDrawing} disabled={saving}>
                  Cancel
                </button>
              </div>
            </>
          ) : selected ? (
            <>
              <span className="eyebrow">
                {selected.type} · Floor {selected.floor}
              </span>
              <h3 style={{ margin: '4px 0 10px' }}>{selected.id}</h3>
              <StatusPill status={selected.status} />
              <p style={{ fontSize: 13, marginTop: 12 }}>
                <strong>Rate:</strong> {peso(selected.price)} / month
              </p>
              <p style={{ fontSize: 13 }}>
                <strong>Beds:</strong> {selected.beds}
              </p>
              {canEdit ? (
                <p style={{ fontSize: 13 }}>
                  <strong>Tenant:</strong> {selected.tenantName || '—'}
                </p>
              ) : null}
              {selected.amenities?.length ? (
                <p style={{ fontSize: 13, color: 'var(--slate)' }}>{selected.amenities.join(' · ')}</p>
              ) : null}
              {canEdit ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button className="btn secondary small" onClick={() => startDrawing(selected.id)}>
                    Redraw outline
                  </button>
                  <button className="btn danger small" onClick={() => removeOutline(selected)} disabled={saving}>
                    Remove from map
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <p style={{ color: 'var(--slate)', fontSize: 13 }}>Click a room on the plan to see its details.</p>
          )}

          {canEdit && !drawing ? (
            <>
              <div className="divider" />
              <h3 style={{ fontSize: 14, marginBottom: 8 }}>Add a room to floor {floor}</h3>
              {unmapped.length ? (
                <>
                  <div className="field">
                    <label>Room without an outline</label>
                    <select value={pickValue} onChange={(e) => setPickId(e.target.value)}>
                      {unmapped.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id} · {r.type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn brass small" onClick={() => startDrawing(pickValue)} disabled={!pickValue}>
                    Start drawing
                  </button>
                </>
              ) : (
                <p style={{ color: 'var(--slate)', fontSize: 13 }}>
                  Every room on this floor is already on the map. To map another room, add it first on the Rooms page.
                </p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}