import mongoose from 'mongoose';
import { todayManila } from '../utils/dates.js';

const ticketSchema = new mongoose.Schema(
  {
    _id: String, // e.g. "MT-505"
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    room: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Plumbing', 'Electrical', 'Carpentry', 'Utilities', 'Other'],
      default: 'Other',
    },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['open', 'in-progress', 'resolved'], default: 'open' },
    assigned: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
    created: { type: String, default: todayManila },
    notes: { type: String, default: '' },
  },
  {
    timestamps: true,
    toJSON: {
      // When tenant/assigned are populated, flatten them into id + name,
      // so the frontend gets `tenant`, `tenantName`, `assigned`, `assignedName`.
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        for (const [field, nameField] of [['tenant', 'tenantName'], ['assigned', 'assignedName']]) {
          const v = ret[field];
          if (v && typeof v === 'object' && v.name !== undefined) {
            ret[nameField] = v.name;
            ret[field] = v.id ?? v._id;
          }
        }
        return ret;
      },
    },
  }
);

export default mongoose.model('Ticket', ticketSchema);