import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    rot: { type: Number, enum: [0, 90], default: 0 },
  },
  { _id: false }
);

// One saved layout per tenant
const RoomLayoutSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    room: String,
    cols: { type: Number, default: 10 },
    rows: { type: Number, default: 8 },
    floor: { type: String, default: 'oak' },
    items: [ItemSchema],
  },
  { timestamps: true }
);

export default mongoose.models.RoomLayout || mongoose.model('RoomLayout', RoomLayoutSchema);
