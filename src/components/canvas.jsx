import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Text, Circle, Rect } from 'react-konva';
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
const MAJOR_EVERY = 5; // every 5th grid line is drawn a little stronger

// Konva can't read CSS variables, so these mirror the theme tokens in style.css
const COLORS = {
  forest: '#1c4535',
  forestDark: '#102c20',
  brass: '#c8922e',
  brassDark: '#85600f',
  ink: '#1b2a23',
  paper: '#fcfdfa',
  gridMinor: '#e8ede3',
  gridMajor: '#d5ddd0',
  draw: '#1c4535',
  close: '#c8922e',
};

const STATUS_STYLE = {
  available: { fill: 'rgba(43, 122, 82, 0.28)', hoverFill: 'rgba(43, 122, 82, 0.42)', stroke: '#2b7a52', dot: '#2b7a52', label: 'Available' },
  reserved: { fill: 'rgba(200, 146, 46, 0.30)', hoverFill: 'rgba(200, 146, 46, 0.45)', stroke: '#a77715', dot: '#c8922e', label: 'Reserved' },
  occupied: { fill: 'rgba(179, 64, 42, 0.26)', hoverFill: 'rgba(179, 64, 42, 0.40)', stroke: '#b3402a', dot: '#b3402a', label: 'Occupied' },
  maintenance: { fill: 'rgba(125, 139, 128, 0.30)', hoverFill: 'rgba(125, 139, 128, 0.44)', stroke: '#6b786e', dot: '#7d8b80', label: 'Maintenance' },
};

const snap = (v, max) => Math.min(max, Math.max(0, Math.round(v / GRID) * GRID));

// Centre of a polygon's bounding box, used to place the room label
function center(points) {
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/* ---------------- styles (scoped to this screen) ---------------- */

const css = `
.fp-layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 20px; align-items: start; }
.fp-main { min-width: 0; }
.fp-side { position: sticky; top: calc(var(--topbar-h) + 20px); display: flex; flex-direction: column; gap: 16px; }

/* top controls */
.fp-controls { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.fp-seg { display: inline-flex; padding: 4px; gap: 2px; background: var(--chrome); border: 1px solid var(--line); border-radius: var(--radius-sm); }
.fp-seg button {
  border: 0; background: transparent; color: var(--ink-soft); font-weight: 600; font-size: var(--t-sm);
  padding: 7px 16px; min-height: 36px; border-radius: 6px; transition: background .15s var(--ease), color .15s var(--ease);
}
.fp-seg button:hover:not(:disabled):not(.on) { background: rgba(255,255,255,.6); color: var(--ink); }
.fp-seg button.on { background: var(--forest); color: #f4f7ef; box-shadow: inset 0 -3px 0 var(--brass); }
.fp-seg button:disabled:not(.on) { opacity: .45; cursor: not-allowed; }

.fp-legend { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
.fp-chip {
  display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 99px;
  background: var(--paper-raised); border: 1px solid var(--line); font-size: var(--t-xs); font-weight: 600; color: var(--ink-soft);
}
.fp-chip i { width: 10px; height: 10px; border-radius: 50%; display: block; }
.fp-chip b { font-weight: 700; color: var(--ink); min-width: 1ch; text-align: center; }

/* canvas card */
.fp-canvas { padding: 0; overflow: hidden; }
.fp-canvas-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: 12px 16px; border-bottom: 1px solid var(--line-soft); background: var(--paper-soft);
}
.fp-canvas-title { font-family: var(--display); font-weight: 700; font-size: var(--t-sm); color: var(--forest); letter-spacing: -.01em; }
.fp-canvas-title span { font-family: var(--sans); font-weight: 500; color: var(--slate-dark); margin-left: 8px; font-size: var(--t-xs); }
.fp-mode {
  display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px; border-radius: 99px;
  background: var(--brass-tint); border: 1px solid rgba(200,146,46,.5); color: var(--brass-dark); font-size: var(--t-xs); font-weight: 700;
}
.fp-mode::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--brass); animation: fp-pulse 1.4s ease-in-out infinite; }
@keyframes fp-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.7); } }
.fp-stage { padding: 14px; background: #f3f6ef; }
.fp-stage > div { border-radius: 8px; overflow: hidden; border: 1px solid var(--line); box-shadow: var(--shadow-sm); background: ${COLORS.paper}; line-height: 0; }
.fp-note { margin: 0; padding: 12px 16px; border-top: 1px solid var(--line-soft); color: var(--slate-dark); font-size: var(--t-xs); }

/* side panels */
.fp-panel { padding: 0; overflow: hidden; }
.fp-panel + .fp-panel { margin-top: 0; }
.fp-panel-body { padding: 20px; }
.fp-panel-label { font-size: var(--t-xs); font-weight: 700; color: var(--slate-dark); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; display: block; }

.fp-plate {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px;
  background: var(--forest); color: #f4f7ef; border-bottom: 3px solid var(--brass);
}
.fp-plate small { display: block; color: #a9b8ad; font-size: var(--t-xs); font-weight: 600; margin-bottom: 2px; }
.fp-plate h3 { color: #fff; font-size: var(--t-xl); }
.fp-plate .fp-plate-mark {
  min-width: 44px; height: 44px; padding: 0 10px; display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-plate); box-shadow: inset 0 0 0 1.5px var(--brass); color: var(--brass);
  font-family: var(--display); font-weight: 700; background: var(--forest-dark);
}

.fp-rows { margin: 16px 0 0; display: grid; gap: 0; }
.fp-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line-soft); font-size: var(--t-sm); }
.fp-row:last-child { border-bottom: 0; }
.fp-row dt { color: var(--slate-dark); }
.fp-row dd { margin: 0; font-weight: 650; text-align: right; }
.fp-amenities { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.fp-amenities span { padding: 3px 10px; border-radius: 99px; background: var(--forest-tint); color: var(--forest); font-size: var(--t-xs); font-weight: 600; }
.fp-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px; }

.fp-empty { text-align: center; padding: 28px 20px; color: var(--slate-dark); font-size: var(--t-sm); }
.fp-empty svg { display: block; margin: 0 auto 10px; color: var(--slate); }

.fp-steps { list-style: none; margin: 0 0 16px; padding: 0; display: grid; gap: 10px; }
.fp-steps li { display: flex; gap: 12px; align-items: flex-start; font-size: var(--t-sm); color: var(--ink-soft); line-height: 1.4; }
.fp-steps .n {
  flex: 0 0 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--brass-tint); border: 1px solid rgba(200,146,46,.5); color: var(--brass-dark); font-size: 12px; font-weight: 700;
}
.fp-progress { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: var(--radius-sm); background: var(--paper-soft); border: 1px solid var(--line-soft); margin-bottom: 16px; }
.fp-progress .count { font-family: var(--display); font-size: var(--t-2xl); font-weight: 700; color: var(--forest); line-height: 1; }
.fp-progress .bar { flex: 1; height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
.fp-progress .bar i { display: block; height: 100%; background: var(--sage); transition: width .2s var(--ease); }
.fp-progress .bar i.warn { background: var(--brass); }
.fp-progress small { color: var(--slate-dark); font-size: var(--t-xs); }

.fp-select {
  width: 100%; padding: 10px 12px; min-height: 44px; border: 1px solid var(--line); border-radius: var(--radius-sm);
  background: var(--paper-raised); color: var(--ink); box-shadow: var(--shadow-sm);
}
.fp-select:focus { outline: none; border-color: var(--brass); box-shadow: var(--ring); }
.fp-field-label { display: block; font-size: var(--t-xs); font-weight: 700; color: var(--slate-dark); margin-bottom: 6px; }

.fp-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fp-stat { padding: 12px 14px; border-radius: var(--radius-sm); background: var(--paper-soft); border: 1px solid var(--line-soft); }
.fp-stat b { display: block; font-family: var(--display); font-size: var(--t-xl); color: var(--forest); line-height: 1.1; }
.fp-stat span { font-size: var(--t-xs); color: var(--slate-dark); font-weight: 600; }

@media (max-width: 1040px) {
  .fp-layout { grid-template-columns: 1fr; }
  .fp-side { position: static; }
  .fp-legend { margin-left: 0; }
}
`;

const Icon = ({ d, size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const cursorIcon = (
  <Icon d={<><path d="M5 3l14 7-6 2-2 6z" /><path d="M13 12l5 5" /></>} />
);

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
  const [hoverRoom, setHoverRoom] = useState(null); // room under the pointer
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

  const statusCounts = useMemo(() => {
    const c = { available: 0, reserved: 0, occupied: 0, maintenance: 0 };
    floorRooms.forEach((r) => {
      if (c[r.status] !== undefined) c[r.status] += 1;
    });
    return c;
  }, [floorRooms]);

  const gridLines = useMemo(() => {
    const lines = [];
    for (let x = 0; x <= W; x += GRID) {
      const major = (x / GRID) % MAJOR_EVERY === 0;
      lines.push(
        <Line key={`v${x}`} points={[x, 0, x, H]} stroke={major ? COLORS.gridMajor : COLORS.gridMinor} strokeWidth={1} strokeScaleEnabled={false} />
      );
    }
    for (let y = 0; y <= H; y += GRID) {
      const major = (y / GRID) % MAJOR_EVERY === 0;
      lines.push(
        <Line key={`h${y}`} points={[0, y, W, y]} stroke={major ? COLORS.gridMajor : COLORS.gridMinor} strokeWidth={1} strokeScaleEnabled={false} />
      );
    }
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
      if (e.target === e.target.getStage() || e.target.attrs.name === 'plan-bg') setSelectedId(null); // clicked empty space
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
    if (drawing) setHover(pointerPos(e));
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
  const canClose = nPts >= 3;
  const progress = Math.min(100, (nPts / 3) * 100);

  return (
    <>
      <style>{css}</style>

      <div className="pageHead">
        <div>
          <span className="eyebrow">Management</span>
          <h1>Floor plan</h1>
          <p>{canEdit ? 'Draw each room’s outline. Colours follow the room’s live status.' : 'Room outlines coloured by their live status.'}</p>
        </div>
      </div>

      <div className="fp-controls">
        <div className="fp-seg" role="tablist" aria-label="Floor">
          {floors.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={f === floor}
              className={f === floor ? 'on' : ''}
              disabled={!!drawing}
              onClick={() => {
                setFloor(f);
                setSelectedId(null);
              }}
            >
              Floor {f}
            </button>
          ))}
        </div>

        <div className="fp-legend">
          {Object.entries(STATUS_STYLE).map(([key, s]) => (
            <span key={key} className="fp-chip">
              <i style={{ background: s.dot }} />
              {s.label}
              <b>{statusCounts[key]}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="fp-layout">
        {/* canvas */}
        <div className="fp-main">
          <div className="card fp-canvas">
            <div className="fp-canvas-head">
              <div className="fp-canvas-title">
                Floor {floor}
                <span>
                  {floorRooms.length} room{floorRooms.length === 1 ? '' : 's'} mapped
                </span>
              </div>
              {drawing ? <span className="fp-mode">Drawing {drawing.roomId} · Esc to cancel</span> : null}
            </div>

            <div className="fp-stage">
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
                  style={{ cursor: drawing ? 'crosshair' : 'default' }}
                >
                  <Layer>
                    <Rect name="plan-bg" x={0} y={0} width={W} height={H} fill={COLORS.paper} />
                  </Layer>
                  <Layer listening={false}>{gridLines}</Layer>

                  <Layer>
                    {floorRooms.map((r) => {
                      const [cx, cy] = center(r.plan);
                      const st = STATUS_STYLE[r.status] || STATUS_STYLE.available;
                      const isSel = r.id === selectedId;
                      const isHover = r.id === hoverRoom && !drawing;
                      const redrawing = drawing?.roomId === r.id;
                      return (
                        <React.Fragment key={r.id}>
                          <Line
                            points={r.plan}
                            closed
                            lineJoin="round"
                            fill={isHover || isSel ? st.hoverFill : st.fill}
                            stroke={isSel ? COLORS.brass : st.stroke}
                            strokeWidth={isSel ? 4 : isHover ? 3 : 2}
                            strokeScaleEnabled={false}
                            shadowColor={isSel ? COLORS.brass : 'transparent'}
                            shadowBlur={isSel ? 14 : 0}
                            shadowOpacity={0.55}
                            shadowForStrokeEnabled={false}
                            opacity={redrawing ? 0.25 : 1}
                            listening={!drawing}
                            onClick={() => setSelectedId(r.id)}
                            onTap={() => setSelectedId(r.id)}
                            onMouseEnter={(e) => {
                              setHoverRoom(r.id);
                              e.target.getStage().container().style.cursor = 'pointer';
                            }}
                            onMouseLeave={(e) => {
                              setHoverRoom(null);
                              e.target.getStage().container().style.cursor = drawing ? 'crosshair' : 'default';
                            }}
                          />
                          <Text
                            text={r.id}
                            x={cx - 50}
                            y={r.type ? cy - 17 : cy - 9}
                            width={100}
                            align="center"
                            fontSize={17}
                            fontStyle="bold"
                            fontFamily="'Bricolage Grotesque', 'Public Sans', Arial, sans-serif"
                            fill={COLORS.ink}
                            listening={false}
                          />
                          {r.type ? (
                            <Text
                              text={String(r.type)}
                              x={cx - 50}
                              y={cy + 3}
                              width={100}
                              align="center"
                              fontSize={12}
                              fontFamily="'Public Sans', Arial, sans-serif"
                              fill="#46564d"
                              listening={false}
                            />
                          ) : null}
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
                            fill="rgba(28, 69, 53, 0.14)"
                            listening={false}
                          />
                        ) : null}
                        <Line
                          points={pts}
                          stroke={COLORS.draw}
                          strokeWidth={3}
                          lineJoin="round"
                          lineCap="round"
                          strokeScaleEnabled={false}
                          listening={false}
                        />
                        {hover ? (
                          <Line
                            points={[pts[pts.length - 2], pts[pts.length - 1], hover[0], hover[1]]}
                            stroke={COLORS.brass}
                            strokeWidth={2}
                            dash={[10, 6]}
                            strokeScaleEnabled={false}
                            listening={false}
                          />
                        ) : null}
                        {Array.from({ length: nPts }, (_, i) => {
                          const first = i === 0 && canClose;
                          return (
                            <React.Fragment key={i}>
                              {first ? <Circle x={pts[0]} y={pts[1]} radius={16} fill="rgba(200, 146, 46, 0.22)" listening={false} /> : null}
                              <Circle
                                x={pts[i * 2]}
                                y={pts[i * 2 + 1]}
                                radius={first ? 9 : 6}
                                fill={first ? COLORS.close : COLORS.draw}
                                stroke="#fff"
                                strokeWidth={2}
                                strokeScaleEnabled={false}
                                listening={false}
                              />
                            </React.Fragment>
                          );
                        })}
                      </>
                    ) : null}

                    {/* snap marker that follows the pointer while drawing */}
                    {drawing && hover ? (
                      <Circle
                        x={hover[0]}
                        y={hover[1]}
                        radius={9}
                        stroke={COLORS.brass}
                        strokeWidth={2}
                        strokeScaleEnabled={false}
                        listening={false}
                      />
                    ) : null}
                  </Layer>
                </Stage>
              </div>
            </div>

            {!floorRooms.length && !drawing ? (
              <p className="fp-note">
                No rooms are drawn on floor {floor} yet.
                {canEdit ? ' Use the panel on the right to add one.' : ''}
              </p>
            ) : null}
          </div>
        </div>

        {/* side panel */}
        <aside className="fp-side">
          <div className="card fp-panel">
            {drawing ? (
              <>
                <div className="fp-plate">
                  <div>
                    <small>Drawing outline</small>
                    <h3>{drawing.roomId}</h3>
                  </div>
                  <div className="fp-plate-mark">✎</div>
                </div>
                <div className="fp-panel-body">
                  <div className="fp-progress">
                    <span className="count">{nPts}</span>
                    <div style={{ flex: 1 }}>
                      <div className="bar">
                        <i className={canClose ? '' : 'warn'} style={{ width: `${progress}%` }} />
                      </div>
                      <small>
                        corner{nPts === 1 ? '' : 's'} placed{canClose ? ' · ready to save' : ' · need at least 3'}
                      </small>
                    </div>
                  </div>

                  <ol className="fp-steps">
                    <li>
                      <span className="n">1</span>Click grid points to place each corner.
                    </li>
                    <li>
                      <span className="n">2</span>Click the gold first corner to close the shape, or press Save.
                    </li>
                    <li>
                      <span className="n">3</span>Press Esc at any time to cancel.
                    </li>
                  </ol>

                  <div className="fp-actions" style={{ marginTop: 0 }}>
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
                </div>
              </>
            ) : selected ? (
              <>
                <div className="fp-plate">
                  <div>
                    <small>
                      {selected.type} · Floor {selected.floor}
                    </small>
                    <h3>{selected.id}</h3>
                  </div>
                  <StatusPill status={selected.status} />
                </div>
                <div className="fp-panel-body">
                  <dl className="fp-rows" style={{ marginTop: 0 }}>
                    <div className="fp-row">
                      <dt>Rate</dt>
                      <dd>{peso(selected.price)} / month</dd>
                    </div>
                    <div className="fp-row">
                      <dt>Beds</dt>
                      <dd>{selected.beds}</dd>
                    </div>
                    {canEdit ? (
                      <div className="fp-row">
                        <dt>Tenant</dt>
                        <dd>{selected.tenantName || '—'}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {selected.amenities?.length ? (
                    <div className="fp-amenities">
                      {selected.amenities.map((a) => (
                        <span key={a}>{a}</span>
                      ))}
                    </div>
                  ) : null}

                  {canEdit ? (
                    <div className="fp-actions">
                      <button className="btn secondary small" onClick={() => startDrawing(selected.id)}>
                        Redraw outline
                      </button>
                      <button className="btn danger small" onClick={() => removeOutline(selected)} disabled={saving}>
                        Remove from map
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="fp-empty">
                {cursorIcon}
                Click a room on the plan to see its details.
              </div>
            )}
          </div>

          {canEdit && !drawing ? (
            <div className="card fp-panel">
              <div className="fp-panel-body">
                <span className="fp-panel-label">Add a room to floor {floor}</span>
                {unmapped.length ? (
                  <>
                    <label className="fp-field-label" htmlFor="fp-pick">
                      Room without an outline
                    </label>
                    <select id="fp-pick" className="fp-select" value={pickValue} onChange={(e) => setPickId(e.target.value)}>
                      {unmapped.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id} · {r.type}
                        </option>
                      ))}
                    </select>
                    <div className="fp-actions">
                      <button className="btn brass small" onClick={() => startDrawing(pickValue)} disabled={!pickValue}>
                        Start drawing
                      </button>
                    </div>
                  </>
                ) : (
                  <p style={{ color: 'var(--slate-dark)', fontSize: 'var(--t-sm)', margin: 0 }}>
                    Every room on this floor is already on the map. To map another room, add it first on the Rooms page.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          <div className="card fp-panel">
            <div className="fp-panel-body">
              <span className="fp-panel-label">Floor {floor} at a glance</span>
              <div className="fp-stats">
                <div className="fp-stat">
                  <b>{floorRooms.length}</b>
                  <span>On the map</span>
                </div>
                <div className="fp-stat">
                  <b>{canEdit ? unmapped.length : statusCounts.available}</b>
                  <span>{canEdit ? 'Not yet drawn' : 'Available'}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}