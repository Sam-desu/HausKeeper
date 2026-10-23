import Room from '../models/Room.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// The ONLY place that links a tenant to a room. Mutates tenant.room but does NOT save it.
export async function setTenantRoom(tenant, roomId) {
  const next = roomId || null;
  if (next === (tenant.room ?? null)) return; // nothing to do

  if (next) {
    // claim the new room BEFORE releasing the old one, in a single atomic update
    const claimed = await Room.findOneAndUpdate(
      {
        _id: next,
        $or: [{ status: 'available' }, { status: 'reserved', tenant: tenant._id }],
      },
      { status: 'occupied', tenant: tenant._id }
    );
    if (!claimed) {
      const exists = await Room.exists({ _id: next });
      throw new HttpError(exists ? 409 : 404, exists ? `Room ${next} is not available` : `Room ${next} not found`);
    }
  }

  if (tenant.room) {
    await Room.updateOne({ _id: tenant.room, tenant: tenant._id }, { tenant: null, status: 'available' });
  }
  tenant.room = next;
}