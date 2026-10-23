import { Router } from 'express';
import Room from '../models/Room.js';
import Invoice from '../models/Invoice.js';
import Ticket from '../models/Ticket.js';
import Tenant from '../models/Tenant.js';
import { requireStaff } from '../middleware/auth.js';
import { invoiceSummary } from '../services/billing.js';
import { todayManila } from '../utils/dates.js';

const router = Router();

// Per-floor room counts and potential monthly revenue (sum of occupied rooms' prices)
const floorStats = () =>
  Room.aggregate([
    {
      $group: {
        _id: '$floor',
        total: { $sum: 1 },
        occupied: { $sum: { $cond: [{ $eq: ['$status', 'occupied'] }, 1, 0] } },
        revenue: { $sum: { $cond: [{ $eq: ['$status', 'occupied'] }, '$price', 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

const tenantNames = async (ids) => {
  const rows = await Tenant.find({ _id: { $in: ids } }).select('name');
  return new Map(rows.map((t) => [String(t._id), t.name]));
};

// GET /api/reports/dashboard: any staff; sections are omitted if they lack the permission
router.get('/dashboard', requireStaff(), async (req, res) => {
  const perms = req.user.perms;
  const floors = await floorStats();
  const total = floors.reduce((s, f) => s + f.total, 0);
  const occupied = floors.reduce((s, f) => s + f.occupied, 0);

  const out = {
    occupancy: {
      total,
      occupied,
      rate: total ? Math.round((occupied / total) * 100) : 0,
      byFloor: floors.map((f) => ({ floor: f._id, total: f.total, occupied: f.occupied })),
    },
    billing: null,
    tickets: null,
  };

  if (perms.includes('billing')) {
    const sum = await invoiceSummary();
    const overdue = await Invoice.find({ status: 'unpaid', due: { $lt: todayManila() } })
      .sort({ due: 1 })
      .limit(3);
    const names = await tenantNames(overdue.map((i) => i.tenant));
    out.billing = {
      collected: sum.collected,
      overdueTotal: sum.overdueTotal,
      overdueCount: sum.overdueCount,
      attention: overdue.map((i) => ({
        id: i._id,
        room: i.room,
        period: i.period,
        amount: i.amount,
        tenantName: names.get(String(i.tenant)) || '—',
      })),
    };
  }

  if (perms.includes('maintenance')) {
    const unresolved = { status: { $ne: 'resolved' } };
    const [open, high, attention] = await Promise.all([
      Ticket.countDocuments(unresolved),
      Ticket.countDocuments({ ...unresolved, priority: 'high' }),
      Ticket.find({ ...unresolved, priority: 'high' }).sort({ created: 1 }).limit(2),
    ]);
    out.tickets = {
      open,
      highPriority: high,
      attention: attention.map((t) => ({ id: t._id, title: t.title, room: t.room, category: t.category })),
    };
  }

  res.json(out);
});

// GET /api/reports/summary: Reports page (needs "billing")
router.get('/summary', requireStaff('billing'), async (_req, res) => {
  const [floors, statusRows, sum] = await Promise.all([
    floorStats(),
    Room.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    invoiceSummary(),
  ]);
  const by = Object.fromEntries(statusRows.map((r) => [r._id, r.n]));
    const rooms = {
    occupied: by.occupied || 0,
    reserved: by.reserved || 0,
    available: by.available || 0,
    maintenance: by.maintenance || 0,
  };
  rooms.total = rooms.occupied + rooms.reserved + rooms.available + rooms.maintenance;

  res.json({
    rooms,
    occupancyRate: rooms.total ? Math.round((rooms.occupied / rooms.total) * 100) : 0,
    revenueByFloor: floors.map((f) => ({ floor: f._id, revenue: f.revenue })),
    totalCollected: sum.collected,
  });
});

// CSV cell: quote when needed, and neutralise spreadsheet formulas (=, +, -, @)
const cell = (v) => {
  if (typeof v === 'number') return String(v);
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// GET /api/reports/invoices.csv?status=paid|unpaid|overdue
router.get('/invoices.csv', requireStaff('billing'), async (req, res) => {
  const invoices = (await Invoice.find().sort({ due: -1, _id: -1 })).map((i) => i.toJSON());
  const names = await tenantNames([...new Set(invoices.map((i) => String(i.tenant)))]);
  const rows = invoices.filter((i) => !req.query.status || i.status === req.query.status);

  const lines = [
    ['Invoice', 'Tenant', 'Room', 'Period', 'Amount', 'Due', 'Status', 'Paid on'],
    ...rows.map((i) => [i.id, names.get(String(i.tenant)) || '', i.room, i.period, i.amount, i.due, i.status, i.paidOn || '']),
  ].map((r) => r.map(cell).join(','));

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="invoices-${todayManila()}.csv"`,
  });
  res.send('\uFEFF' + lines.join('\r\n')); // BOM so Excel reads ₱ and accents correctly
});

export default router;