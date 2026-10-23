import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    // The room number IS the id (e.g. "R-101"), so the frontend keeps working unchanged
    _id: { type: String, required: true, trim: true },
    floor: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['Single', 'Double', 'Suite'], required: true },
    beds: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['available', 'reserved', 'occupied', 'maintenance'],
      default: 'available',
    },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
    amenities: { type: [String], default: [] },
    notes: { type: String, default: '' },
    // Floor-plan outline as a flat list [x1, y1, x2, y2, ...]; absent until drawn on the map
    plan: { type: [Number], default: undefined },
  },
  {
    timestamps: true,
    toJSON: {
      // Send `id` to the frontend instead of `_id`, and hide `__v`
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export default mongoose.model('Room', roomSchema);