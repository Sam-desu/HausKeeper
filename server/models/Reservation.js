import mongoose from 'mongoose';

export const LEASES = ['6 months', '12 months', '24 months'];
export const HOLD_HOURS = 48;

const reservationSchema = new mongoose.Schema(
  {
    _id: String, // e.g. "RS-0001"
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    room: { type: String, required: true },
    moveInDate: { type: String, required: true },
    lease: { type: String, enum: LEASES, default: '12 months' },
    requests: { type: String, default: '', maxlength: 500 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'declined', 'cancelled', 'expired'],
      default: 'pending',
    },
    holdUntil: { type: Date, default: () => new Date(Date.now() + HOLD_HOURS * 3600 * 1000) },
    decidedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        const v = ret.tenant;
        if (v && typeof v === 'object' && v.name !== undefined) {
          ret.tenantName = v.name;
          ret.tenant = v.id ?? v._id;
        }
        return ret;
      },
    },
  }
);

export default mongoose.model('Reservation', reservationSchema);