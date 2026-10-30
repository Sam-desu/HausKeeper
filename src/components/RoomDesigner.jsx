import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Stage, Layer, Rect, Group, Text, Shape } from "react-konva";
import { useNavigate } from "react-router-dom";
import { useApi } from "../useApi.js";
import { api } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import "./roomDesigner.css";

/* ------------------------------------------------------------------ */
/*  Catalog: edit these lists to add items, floors or room sizes.      */
/*  1 grid cell = 50 cm.                                               */
/*  layer: 0 = floor covering, 1 = furniture, 2 = sits on/near things  */
/* ------------------------------------------------------------------ */

const CELL = 48; // px per grid cell at scale 1
const MAX_ITEMS = 60;
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

const CATS = {
  appliance: { label: "Appliances", fill: "#dde6f0", stroke: "#6f86a3" },
  furniture: { label: "Furniture", fill: "#f1e4cc", stroke: "#a8864f" },
  decor: { label: "Decor", fill: "#dcebd8", stroke: "#6b9566" },
};

export const CATALOG = [
  { type: "router", label: "Wi-Fi router", icon: "📶", cat: "appliance", w: 1, h: 1, layer: 2 },
  { type: "tv", label: "TV", icon: "📺", cat: "appliance", w: 2, h: 1, layer: 2 },
  { type: "aircon", label: "Aircon", icon: "❄️", cat: "appliance", w: 2, h: 1, layer: 2 },
  { type: "fan", label: "Electric fan", icon: "🌀", cat: "appliance", w: 1, h: 1, layer: 2 },
  { type: "fridge", label: "Mini fridge", icon: "🧊", cat: "appliance", w: 1, h: 1, layer: 1 },
  { type: "lamp", label: "Lamp", icon: "💡", cat: "appliance", w: 1, h: 1, layer: 2 },
  { type: "bed-single", label: "Single bed", icon: "🛏️", cat: "furniture", w: 2, h: 4, layer: 1 },
  { type: "bed-double", label: "Double bed", icon: "🛏️", cat: "furniture", w: 3, h: 4, layer: 1 },
  { type: "desk", label: "Desk", icon: "💻", cat: "furniture", w: 3, h: 1, layer: 1 },
  { type: "chair", label: "Chair", icon: "🪑", cat: "furniture", w: 1, h: 1, layer: 2 },
  { type: "wardrobe", label: "Wardrobe", icon: "👔", cat: "furniture", w: 2, h: 1, layer: 1 },
  { type: "shelf", label: "Bookshelf", icon: "📚", cat: "furniture", w: 2, h: 1, layer: 1 },
  { type: "sofa", label: "Sofa", icon: "🛋️", cat: "furniture", w: 4, h: 2, layer: 1 },
  { type: "table", label: "Table", icon: "🍽️", cat: "furniture", w: 2, h: 2, layer: 1 },
  { type: "rug", label: "Rug", icon: "🧶", cat: "decor", w: 4, h: 3, layer: 0 },
  { type: "plant", label: "Plant", icon: "🪴", cat: "decor", w: 1, h: 1, layer: 2 },
];
const BY_TYPE = Object.fromEntries(CATALOG.map((c) => [c.type, c]));

export const FLOORS = [
  { id: "oak", label: "Oak planks", kind: "planks", a: "#d9bb8e", b: "#cfae7e", line: "#b3925c" },
  { id: "walnut", label: "Walnut planks", kind: "planks", a: "#8b5f3d", b: "#7e5436", line: "#5a3a22" },
  { id: "tile", label: "Ceramic tile", kind: "checker", step: 1, a: "#ece9e2", b: "#e0ddd4", line: "#c8c3b6" },
  { id: "concrete", label: "Polished concrete", kind: "checker", step: 3, a: "#c6c6c2", b: "#bfbfbb", line: "#a9a9a5" },
  { id: "carpet", label: "Carpet", kind: "checker", step: 1, a: "#8d9aaa", b: "#8896a7", line: null },
];
const FLOOR_BY_ID = Object.fromEntries(FLOORS.map((f) => [f.id, f]));

const EMPTY = { cols: 10, rows: 8, floor: "oak", items: [] };

/* ---------------- geometry helpers ---------------- */

const footprint = (it) => {
  const d = BY_TYPE[it.type];
  return it.rot === 90 ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
};

const clampPos = (it, cols, rows) => {
  const { w, h } = footprint(it);
  return {
    x: Math.max(0, Math.min(it.x, cols - w)),
    y: Math.max(0, Math.min(it.y, rows - h)),
  };
};

const overlaps = (a, b) => {
  const A = footprint(a);
  const B = footprint(b);
  return a.x < b.x + B.w && b.x < a.x + A.w && a.y < b.y + B.h && b.y < a.y + A.h;
};

// rugs never clash; small objects may sit on furniture; same-layer items can't share cells
const conflicts = (a, b) => {
  const layer = BY_TYPE[a.type].layer;
  return layer > 0 && layer === BY_TYPE[b.type].layer && overlaps(a, b);
};

function firstFree(item, l) {
  const { w, h } = footprint(item);
  for (let y = 0; y <= l.rows - h; y++)
    for (let x = 0; x <= l.cols - w; x++)
      if (!l.items.some((o) => conflicts({ ...item, x, y }, o))) return { x, y };
  return { x: 0, y: 0 };
}

const newId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// make whatever came from the API safe to render (unknown types, bad sizes, out-of-bounds items)
function sanitize(raw) {
  if (!raw) return EMPTY;
  const cols = Math.max(6, Math.min(20, Math.round(raw.cols) || EMPTY.cols));
  const rows = Math.max(6, Math.min(20, Math.round(raw.rows) || EMPTY.rows));
  const items = (raw.items || [])
    .filter((i) => BY_TYPE[i.type])
    .slice(0, MAX_ITEMS)
    .map((i) => {
      const it = { id: i.id || newId(), type: i.type, rot: i.rot === 90 ? 90 : 0, x: i.x | 0, y: i.y | 0 };
      return { ...it, ...clampPos(it, cols, rows) };
    });
  return { cols, rows, floor: FLOOR_BY_ID[raw.floor] ? raw.floor : EMPTY.floor, items };
}

/* ---------------- undo / redo ---------------- */

function reducer(s, a) {
  switch (a.type) {
    case "edit": {
      const next = a.fn(s.present);
      if (next === s.present) return s;
      return { past: [...s.past.slice(-49), s.present], present: next, future: [] };
    }
    case "undo":
      if (!s.past.length) return s;
      return { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] };
    case "redo":
      if (!s.future.length) return s;
      return { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) };
    default:
      return s;
  }
}

/* ---------------- canvas drawing ---------------- */

// plain rect fills only, so this stays one cheap Konva shape however big the room is
const box = (ctx, x, y, w, h, color) => {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fill();
};

function drawFloor(ctx, f, cols, rows) {
  const W = cols * CELL;
  const H = rows * CELL;
  if (f.kind === "planks") {
    const ph = CELL / 2;
    const len = CELL * 3;
    for (let r = 0; r * ph < H; r++) {
      const y = r * ph;
      box(ctx, 0, y, W, ph, r % 2 ? f.b : f.a);
      box(ctx, 0, y, W, 1, f.line);
      for (let x = ((r * 53) % len) - len; x < W; x += len) if (x > 0) box(ctx, x, y, 1, ph);
    }
    return;
  }
  const s = f.step * CELL;
  for (let r = 0; r * s < H; r++)
    for (let c = 0; c * s < W; c++) {
      box(ctx, c * s, r * s, s, s, (r + c) % 2 ? f.b : f.a);
      if (f.line) {
        box(ctx, c * s, r * s, s, 1, f.line);
        box(ctx, c * s, r * s, 1, s, f.line);
      }
    }
}

function drawGrid(ctx, cols, rows) {
  ctx.beginPath();
  for (let x = 1; x < cols; x++) {
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, rows * CELL);
  }
  for (let y = 1; y < rows; y++) {
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(cols * CELL, y * CELL);
  }
  ctx.strokeStyle = "rgba(20,20,20,0.16)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

const Item = React.memo(function Item({ item, cols, rows, selected, clash, brass, onSelect, onMove, readOnly }) {
  const d = BY_TYPE[item.type];
  const cat = CATS[d.cat];
  const { w, h } = footprint(item);
  const W = w * CELL;
  const H = h * CELL;
  const snapTo = (px, size, max) => Math.max(0, Math.min(Math.round(px / CELL), max - size));
  const cursor = (e, c) => {
    e.target.getStage().container().style.cursor = c;
  };

  return (
    <Group
      x={item.x * CELL}
      y={item.y * CELL}
      draggable={!readOnly}
      listening={!readOnly}
      onMouseDown={() => onSelect(item.id)}
      onTouchStart={() => onSelect(item.id)}
      onMouseEnter={(e) => cursor(e, "grab")}
      onMouseLeave={(e) => cursor(e, "default")}
      onDragMove={(e) =>
        e.target.position({
          x: snapTo(e.target.x(), w, cols) * CELL,
          y: snapTo(e.target.y(), h, rows) * CELL,
        })
      }
      onDragEnd={(e) => onMove(item.id, Math.round(e.target.x() / CELL), Math.round(e.target.y() / CELL))}
    >
      <Rect
        x={1.5}
        y={1.5}
        width={W - 3}
        height={H - 3}
        cornerRadius={6}
        fill={cat.fill}
        opacity={d.layer === 0 ? 0.88 : 1}
        stroke={clash ? "#c0392b" : selected ? brass : cat.stroke}
        strokeWidth={clash || selected ? 3 : 1.5}
        shadowColor={selected ? brass : "#000"}
        shadowBlur={selected ? 12 : d.layer === 0 ? 0 : 4}
        shadowOpacity={selected ? 0.55 : 0.18}
        shadowOffsetY={selected ? 0 : 2}
      />
      {d.layer === 0 ? (
        <Rect x={7} y={7} width={W - 14} height={H - 14} cornerRadius={3} stroke={cat.stroke} dash={[6, 5]} listening={false} />
      ) : null}
      <Text
        width={W}
        height={H}
        text={d.icon}
        align="center"
        verticalAlign="middle"
        fontSize={Math.max(18, Math.min(30, Math.min(W, H) * 0.5))}
        fontFamily={EMOJI_FONT}
        listening={false}
      />
    </Group>
  );
});

/* ---------------- read-only picture of a saved layout (used on the admin side) ---------------- */

export function LayoutPreview({ layout, filename = "room-layout" }) {
  const layoutData = useMemo(() => sanitize(layout), [layout]);
  const { cols, rows, items } = layoutData;
  const floor = FLOOR_BY_ID[layoutData.floor];
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const [boxW, setBoxW] = useState(640);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setBoxW(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const worldW = cols * CELL;
  const worldH = rows * CELL;
  const scale = Math.min(1.3, Math.max(0.3, boxW / worldW));
  const drawOrder = useMemo(() => [...items].sort((a, b) => BY_TYPE[a.type].layer - BY_TYPE[b.type].layer), [items]);

  const counts = useMemo(() => {
    const c = {};
    items.forEach((i) => { c[i.type] = (c[i.type] || 0) + 1; });
    return Object.entries(c).map(([type, n]) => `${n} × ${BY_TYPE[type].label}`);
  }, [items]);

  const save = () => {
    const a = document.createElement("a");
    a.href = stageRef.current.toDataURL({ pixelRatio: 2 / scale });
    a.download = `${filename}.png`;
    a.click();
  };

  return (
    <div>
      <div ref={wrapRef} style={{ width: "100%" }}>
        <Stage ref={stageRef} width={worldW * scale} height={worldH * scale} scaleX={scale} scaleY={scale}>
          <Layer listening={false}>
            <Shape sceneFunc={(ctx) => drawFloor(ctx, floor, cols, rows)} />
            <Rect width={worldW} height={worldH} stroke="#45464a" strokeWidth={10} />
          </Layer>
          <Layer listening={false}>
            {drawOrder.map((it) => (
              <Item key={it.id} item={it} cols={cols} rows={rows} brass="#b08a3e" readOnly />
            ))}
          </Layer>
        </Stage>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", marginTop: 12, flexWrap: "wrap" }}>
        <small style={{ color: "var(--slate-dark)" }}>
          {items.length ? counts.join(" · ") : "The tenant saved an empty room."}
          {` · ${cols * 0.5} × ${rows * 0.5} m · ${floor.label}`}
        </small>
        <button className="btn secondary small" onClick={save}>Download picture</button>
      </div>
    </div>
  );
}

/* ---------------- page wrapper (loads the saved layout) ---------------- */

export function RoomDesigner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasRoom = !!user?.room;
  // no room → don't even ask the server for a layout
  const { data, loading, error, status, reload } = useApi(hasRoom ? "/room-layouts/mine" : null);

  // the designer is only for tenants who have rented a room (the server enforces this too)
  if (!hasRoom || status === 403)
    return (
      <div className="empty">
        <h3>Rent a room to use the Room Designer</h3>
        <p>
          You can arrange furniture and appliances once a room is assigned to you. Browse the available rooms and
          reserve one, and the designer unlocks as soon as the staff approve it.
        </p>
        <button className="btn brass" onClick={() => navigate("/tenant/rooms")}>
          Find a room
        </button>
      </div>
    );
  if (loading && !data)
    return (
      <div className="empty">
        <p>Loading…</p>
      </div>
    );
  if (error)
    return (
      <div className="empty">
        <h3>Couldn&apos;t load your room layout</h3>
        <p>{error}</p>
        <button className="btn secondary small" onClick={reload}>
          Try again
        </button>
      </div>
    );
  // the server decides the room size from the type of room the tenant rented
  const room = data.room;
  return <Designer room={room} initial={sanitize({ ...(data.layout || {}), cols: room.cols, rows: room.rows })} />;
}

/* ---------------- the editor ---------------- */

function Designer({ initial, room }) {
  const { user } = useAuth();
  const toast = useToast();
  const [{ present: layout, past, future }, dispatch] = useReducer(reducer, initial, (l) => ({
    past: [],
    present: l,
    future: [],
  }));
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const [selectedId, setSelectedId] = useState(null);
  const [showGrid, setShowGrid] = useState(true);
  const [dropping, setDropping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [boxW, setBoxW] = useState(640);
  const stageRef = useRef(null);
  const wrapRef = useRef(null);
  const keyRef = useRef(null);

  const brass = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue("--brass").trim() || "#b08a3e",
    []
  );

  const { cols, rows, items } = layout;
  const floor = FLOOR_BY_ID[layout.floor];
  const worldW = cols * CELL;
  const worldH = rows * CELL;
  const scale = Math.min(1.3, Math.max(0.3, boxW / worldW));
  const selected = items.find((i) => i.id === selectedId) || null;
  const dirty = JSON.stringify(layout) !== savedJson;

  const clash = useMemo(() => {
    const s = new Set();
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++)
        if (conflicts(items[i], items[j])) {
          s.add(items[i].id);
          s.add(items[j].id);
        }
    return s;
  }, [items]);

  const drawOrder = useMemo(
    () => [...items].sort((a, b) => BY_TYPE[a.type].layer - BY_TYPE[b.type].layer),
    [items]
  );

  /* fit the stage to its container */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setBoxW(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* warn before leaving with unsaved work */
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ---- actions ---- */

  const edit = useCallback((fn) => dispatch({ type: "edit", fn }), []);

  const addItem = (type, at) => {
    if (items.length >= MAX_ITEMS) return toast(`A room can hold up to ${MAX_ITEMS} items`);
    const id = newId();
    edit((l) => {
      const base = { id, type, rot: 0 };
      const pos = at ? clampPos({ ...base, ...at }, l.cols, l.rows) : firstFree(base, l);
      return { ...l, items: [...l.items, { ...base, ...pos }] };
    });
    setSelectedId(id);
  };

  const moveItem = useCallback(
    (id, x, y) =>
      edit((l) => {
        const it = l.items.find((i) => i.id === id);
        if (!it) return l;
        const pos = clampPos({ ...it, x, y }, l.cols, l.rows);
        if (pos.x === it.x && pos.y === it.y) return l;
        return { ...l, items: l.items.map((i) => (i.id === id ? { ...i, ...pos } : i)) };
      }),
    [edit]
  );

  const rotate = () =>
    selected &&
    edit((l) => ({
      ...l,
      items: l.items.map((i) => {
        if (i.id !== selected.id) return i;
        const r = { ...i, rot: i.rot === 90 ? 0 : 90 };
        return { ...r, ...clampPos(r, l.cols, l.rows) };
      }),
    }));

  const duplicate = () => {
    if (!selected) return;
    if (items.length >= MAX_ITEMS) return toast(`A room can hold up to ${MAX_ITEMS} items`);
    const id = newId();
    edit((l) => {
      const copy = { ...selected, id, x: selected.x + 1, y: selected.y + 1 };
      return { ...l, items: [...l.items, { ...copy, ...clampPos(copy, l.cols, l.rows) }] };
    });
    setSelectedId(id);
  };

  const remove = () => {
    if (!selected) return;
    edit((l) => ({ ...l, items: l.items.filter((i) => i.id !== selected.id) }));
    setSelectedId(null);
  };

  const clearAll = () => {
    if (!items.length || !window.confirm("Remove every item from the room?")) return;
    edit((l) => ({ ...l, items: [] }));
    setSelectedId(null);
  };

  const setFloor = (id) => edit((l) => (l.floor === id ? l : { ...l, floor: id }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/room-layouts/mine", layout);
      setSavedJson(JSON.stringify(layout));
      toast("Room layout saved");
    } catch (err) {
      toast(err.message);
    } finally {
      setSaving(false);
    }
  };

  const exportPng = () => {
    setSelectedId(null); // keep the selection glow out of the picture
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = stageRef.current.toDataURL({ pixelRatio: 2 / scale });
      a.download = `room-${user.room || "layout"}.png`;
      a.click();
    }, 60);
  };

  /* ---- drag from palette onto the stage ---- */

  const onDrop = (e) => {
    e.preventDefault();
    setDropping(false);
    const type = e.dataTransfer.getData("text/plain");
    const d = BY_TYPE[type];
    if (!d) return;
    const stage = stageRef.current;
    stage.setPointersPositions(e);
    const p = stage.getPointerPosition();
    addItem(type, {
      x: Math.round(p.x / scale / CELL - d.w / 2),
      y: Math.round(p.y / scale / CELL - d.h / 2),
    });
  };

  /* ---- keyboard shortcuts (latest closure kept in a ref) ---- */

  keyRef.current = (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && (k === "y" || (k === "z" && e.shiftKey))) {
      e.preventDefault();
      dispatch({ type: "redo" });
    } else if (mod && k === "z") {
      e.preventDefault();
      dispatch({ type: "undo" });
    } else if (!selected) {
      return;
    } else if (mod && k === "d") {
      e.preventDefault();
      duplicate();
    } else if (k === "delete" || k === "backspace") {
      e.preventDefault();
      remove();
    } else if (k === "r" && !mod) {
      rotate();
    } else if (k.startsWith("arrow")) {
      e.preventDefault();
      const dx = k === "arrowright" ? 1 : k === "arrowleft" ? -1 : 0;
      const dy = k === "arrowdown" ? 1 : k === "arrowup" ? -1 : 0;
      moveItem(selected.id, selected.x + dx, selected.y + dy);
    } else if (k === "escape") {
      setSelectedId(null);
    }
  };
  useEffect(() => {
    const handler = (e) => keyRef.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const fp = selected ? footprint(selected) : null;

  return (
    <>
      <div className="pageHead">
        <div>
          <span className="eyebrow">{`Room ${room.id}${room.type ? ` · ${room.type}` : ""}`}</span>
          <h1>Room designer</h1>
          <p>
            Your {room.type ? `${room.type.toLowerCase()} ` : ""}room is {room.cols / 2} × {room.rows / 2} m. The
            designer is sized to match it, so drag furniture and appliances onto the grid to plan how it will be set up.
          </p>
        </div>
        <div className="rd-head-actions">
          {dirty ? <span className="rd-unsaved">Unsaved changes</span> : null}
          <button className="btn secondary small" onClick={() => dispatch({ type: "undo" })} disabled={!past.length}>
            Undo
          </button>
          <button className="btn secondary small" onClick={() => dispatch({ type: "redo" })} disabled={!future.length}>
            Redo
          </button>
          <button className="btn brass" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save layout"}
          </button>
        </div>
      </div>

      <div className="rd-layout">
        <aside className="card card-pad rd-palette" aria-label="Item palette">
          <p className="rd-hint">Drag an item onto the room, or tap it to add.</p>
          {Object.entries(CATS).map(([key, cat]) => (
            <div className="rd-group" key={key}>
              <h4>{cat.label}</h4>
              <div className="rd-items">
                {CATALOG.filter((c) => c.cat === key).map((c) => (
                  <button
                    key={c.type}
                    type="button"
                    className="rd-chip"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.type);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addItem(c.type)}
                    title={`${c.label}, ${c.w / 2} × ${c.h / 2} m`}
                  >
                    <span className="rd-chip-icon" aria-hidden="true">
                      {c.icon}
                    </span>
                    <span className="rd-chip-label">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>

        <section className="card rd-canvas">
          <div className="rd-bar">
            <div className="rd-ctl">
              <span className="rd-ctl-label" id="rd-floor-label">
                Floor
              </span>
              <div className="rd-swatches" role="radiogroup" aria-labelledby="rd-floor-label">
                {FLOORS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={layout.floor === f.id}
                    aria-label={f.label}
                    title={f.label}
                    className={`rd-swatch ${layout.floor === f.id ? "is-on" : ""}`}
                    style={{ background: swatchBg(f) }}
                    onClick={() => setFloor(f.id)}
                  />
                ))}
              </div>
              <span className="rd-floor-name">{floor.label}</span>
            </div>
            <div className="rd-ctl">
              <span className="rd-ctl-label">Room size</span>
              <span className="rd-floor-name">
                {room.type ? `${room.type} · ` : ""}
                {cols / 2} × {rows / 2} m (fixed)
              </span>
            </div>
            <label className="rd-check">
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
              Show grid
            </label>
          </div>

          <div className="rd-board" ref={wrapRef}>
            <div
              className={`rd-stage ${dropping ? "is-drop" : ""}`}
              style={{ width: worldW * scale, height: worldH * scale }}
              onDragOver={(e) => {
                e.preventDefault();
                setDropping(true);
              }}
              onDragLeave={() => setDropping(false)}
              onDrop={onDrop}
            >
              <Stage
                ref={stageRef}
                width={worldW * scale}
                height={worldH * scale}
                scaleX={scale}
                scaleY={scale}
                onMouseDown={(e) => e.target === e.target.getStage() && setSelectedId(null)}
                onTouchStart={(e) => e.target === e.target.getStage() && setSelectedId(null)}
              >
                <Layer listening={false}>
                  <Shape sceneFunc={(ctx) => drawFloor(ctx, floor, cols, rows)} />
                  {showGrid ? <Shape sceneFunc={(ctx) => drawGrid(ctx, cols, rows)} /> : null}
                  <Rect width={worldW} height={worldH} stroke="#45464a" strokeWidth={10} />
                </Layer>
                <Layer>
                  {drawOrder.map((it) => (
                    <Item
                      key={it.id}
                      item={it}
                      cols={cols}
                      rows={rows}
                      brass={brass}
                      selected={it.id === selectedId}
                      clash={clash.has(it.id)}
                      onSelect={setSelectedId}
                      onMove={moveItem}
                    />
                  ))}
                </Layer>
              </Stage>
              {!items.length ? (
                <div className="rd-empty">
                  <span>Your room is empty. Drag something in from the left.</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rd-foot">
            <div className="rd-sel" aria-live="polite">
              {selected ? (
                <>
                  <strong>{BY_TYPE[selected.type].label}</strong>
                  <span>
                    {fp.w / 2} × {fp.h / 2} m
                  </span>
                </>
              ) : (
                <span>Select an item to rotate, duplicate or remove it.</span>
              )}
              {clash.size ? <span className="rd-warn">{clash.size} items overlap</span> : null}
            </div>
            <div className="rd-actions">
              <button className="btn secondary small" onClick={rotate} disabled={!selected} title="Shortcut: R">
                Rotate
              </button>
              <button className="btn secondary small" onClick={duplicate} disabled={!selected} title="Shortcut: Ctrl+D">
                Duplicate
              </button>
              <button className="btn secondary small" onClick={remove} disabled={!selected} title="Shortcut: Delete">
                Remove
              </button>
              <span className="rd-sep" />
              <button className="btn secondary small" onClick={exportPng}>
                Download image
              </button>
              <button className="btn secondary small" onClick={clearAll} disabled={!items.length}>
                Clear room
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function swatchBg(f) {
  if (f.kind === "planks") return `repeating-linear-gradient(0deg, ${f.a} 0 7px, ${f.b} 7px 14px)`;
  return `conic-gradient(${f.a} 25%, ${f.b} 0 50%, ${f.a} 0 75%, ${f.b} 0) 0 0 / 14px 14px`;
}
