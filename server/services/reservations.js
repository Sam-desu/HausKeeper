import Reservation from '../models/Reservation.js';
import Room from '../models/Room.js';

// Frees the room, but only if it is still held by that tenant
const releaseRoom = (r) =>
  Room.updateOne({ _id: r.room, status: 'reserved', tenant: r.tenant }, { status: 'available', tenant: null });

// Ends a PENDING reservation (cancelled / declined / expired) and frees its room.
// Returns the updated reservation, or null if it was no longer pending.
export async function closeReservation(r, status) {
  const updated = await Reservation.findOneAndUpdate(
    { _id: r._id, status: 'pending' },
    { status, decidedAt: new Date() },
    { new: true }
  );
  if (updated) await releaseRoom(updated);
  return updated;
}

// Expires every hold past its deadline. Runs on a timer AND before room/reservation reads.
export async function expireReservations() {
  const stale = await Reservation.find({ status: 'pending', holdUntil: { $lt: new Date() } });
  for (const r of stale) await closeReservation(r, 'expired');
}

// Used when a tenant is deactivated
export async function cancelPendingFor(tenantId) {
  const pending = await Reservation.find({ tenant: tenantId, status: 'pending' });
  for (const r of pending) await closeReservation(r, 'cancelled');
}