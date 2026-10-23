import { Router } from 'express';
import mongoose from 'mongoose';
import Ticket from '../models/Ticket.js';
import Tenant from '../models/Tenant.js';
import Staff from '../models/Staff.js';
import { nextSeq } from '../models/Counter.js';
import { requireStaff, requireTenant } from '../middleware/auth.js';
import Invoice from '../models/Invoice.js';
import { HttpError } from '../services/housing.js';
import { notifyTenant, notifyStaff, notifyStaffMember, peso } from '../services/notify.js';
import { isDateStr, todayManila } from '../utils/dates.js';

const router = Router();

const withNames = (q) => q.populate('tenant', 'name').populate('assigned', 'name');
const STATUSES = ['open', 'in-progress', 'resolved'];

// Adds `charge: { invoice, amount, status }` to tickets that have a repair charge. Takes a doc or an array.
async function withCharges(result) {
  const list = Array.isArray(result) ? result : [result];
  const invoices = await Invoice.find({ ticket: { $in: list.map((t) => t._id) } }).select('amount status due');
  const byTicket = new Map(invoices.map((i) => [i.ticket, i.toJSON()]));
  const out = list.map((t) => {
    const json = t.toJSON();
    const inv = byTicket.get(t._id);
    if (inv) json.charge = { invoice: inv.id, amount: inv.amount, status: inv.status };
    return json;
  });
  return Array.isArray(result) ? out : out[0];
}
const load = async (query) => withCharges(await withNames(query));

/* ---------- tenant (self-service), defined before '/:id' ---------- */

// GET /api/tickets/mine
router.get('/mine', requireTenant, async (req, res) => {
  res.json(await load(Ticket.find({ tenant: req.user.id }).sort({ created: -1, _id: -1 })));
});

// POST /api/tickets   body: { title, category, priority, notes }
router.post('/', requireTenant, async (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) throw new HttpError(400, 'Please give the request a title');

  const tenant = await Tenant.findById(req.user.id);
  if (!tenant) throw new HttpError(404, 'Account not found');
  if (!tenant.room) throw new HttpError(400, 'You need an assigned room before filing a request');

  const seq = await nextSeq('ticket');
  const ticket = await Ticket.create({
    _id: 'MT-' + (500 + seq),
    tenant: tenant._id,
    room: tenant.room,
    title,
    category: req.body.category,
    priority: req.body.priority,
    notes: req.body.notes || '',
  });
  notifyStaff('maintenance', {
    type: 'ticket',
    title: `New request ${ticket.id}`,
    message: `${tenant.name} (Room ${tenant.room}): ${title}`,
    link: '/admin/maintenance',
  });
  res.status(201).json(await load(Ticket.findById(ticket._id)));
});

/* ---------- staff (needs "maintenance" permission) ---------- */

// GET /api/tickets/assignees: staff who can be assigned tickets
router.get('/assignees', requireStaff('maintenance'), async (_req, res) => {
  const staff = await Staff.find({ perms: 'maintenance' }).sort({ name: 1 });
  res.json(staff.map((s) => ({ id: s.id, name: s.name })));
});

// GET /api/tickets?status=open
router.get('/', requireStaff('maintenance'), async (req, res) => {
  const filter = STATUSES.includes(req.query.status) ? { status: req.query.status } : {};
  if (req.query.tenant) filter.tenant = req.query.tenant;
  res.json(await load(Ticket.find(filter).sort({ created: -1, _id: -1 })));
});

router.get('/:id', requireStaff('maintenance'), async (req, res) => {
  const ticket = await withNames(Ticket.findById(req.params.id));
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  res.json(await withCharges(ticket));
});

// PATCH /api/tickets/:id   body: any of { assigned, status, notes }
router.patch('/:id', requireStaff('maintenance'), async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) throw new HttpError(404, 'Ticket not found');

  const { assigned, status, notes } = req.body;
  const prevStatus = ticket.status;
  const prevAssigned = String(ticket.assigned || '');

  if (status !== undefined) {
    if (!STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');
    ticket.status = status;
  }

  if (assigned !== undefined) {
    if (!assigned) {
      ticket.assigned = null;
    } else {
      if (!mongoose.isValidObjectId(assigned)) throw new HttpError(400, 'Invalid staff member');
      if (!(await Staff.exists({ _id: assigned, perms: 'maintenance' })))
        throw new HttpError(404, 'That staff member cannot be assigned tickets');
      ticket.assigned = assigned;
      // assigning an open ticket starts the work (unless status was set explicitly)
      if (status === undefined && ticket.status === 'open') ticket.status = 'in-progress';
    }
  }

  if (notes !== undefined) ticket.notes = String(notes);

  await ticket.save();

  if (ticket.status !== prevStatus)
    notifyTenant(ticket.tenant, {
      type: 'ticket',
      title: `Request ${ticket.id} is now ${ticket.status.replace('-', ' ')}`,
      template: 'ticket',
      vars: { title: ticket.title, status: ticket.status.replace('-', ' ') },
      link: '/tenant/maintenance',
    });
  if (ticket.assigned && String(ticket.assigned) !== prevAssigned)
    notifyStaffMember(ticket.assigned, {
      type: 'ticket',
      title: `Ticket ${ticket.id} assigned to you`,
      message: `Room ${ticket.room}: ${ticket.title}`,
      link: '/admin/maintenance',
    });

  res.json(await load(Ticket.findById(ticket._id)));
});

// POST /api/tickets/:id/charge   body: { amount, description?, due? }
// Bills the tenant for a repair. It becomes a normal invoice, so it is paid the same way as rent.
// Needs the "billing" permission because it creates a charge.
router.post('/:id/charge', requireStaff('billing'), async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  if (await Invoice.exists({ ticket: ticket._id }))
    throw new HttpError(409, 'This ticket already has a repair charge');

  const amount = Number(req.body.amount);
  if (!(amount > 0)) throw new HttpError(400, 'Amount must be greater than zero');
  const description = String(req.body.description || '').trim().slice(0, 300);

  const defaultDue = new Date(todayManila() + 'T00:00:00Z');
  defaultDue.setUTCDate(defaultDue.getUTCDate() + 7);
  const due = req.body.due || defaultDue.toISOString().slice(0, 10);
  if (!isDateStr(due)) throw new HttpError(400, 'Enter a valid due date');

  const tenant = await Tenant.findById(ticket.tenant);
  if (!tenant) throw new HttpError(404, 'Tenant not found');

  const seq = await nextSeq('invoice');
  const invoice = await Invoice.create({
    _id: 'INV-' + (2200 + seq),
    tenant: tenant._id,
    room: ticket.room,
    period: `Repair: ${ticket.title}`.slice(0, 80),
    amount,
    due,
    kind: 'maintenance',
    ticket: ticket._id,
    description,
  });

  notifyTenant(tenant._id, {
    type: 'charge',
    title: `Repair charge ${invoice.id}`,
    message: `A repair charge of ₱${peso(amount)} was added for "${ticket.title}"${description ? `: ${description}` : ''}. Due ${due}.`,
    link: '/tenant/billing',
  });
  res.status(201).json(invoice);
});

export default router;