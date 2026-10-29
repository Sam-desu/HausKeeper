import mongoose from 'mongoose';

// One row per chat message. A tenant's conversation is simply all rows with that tenant id,
// so every tenant has their own history and every staff account sees the same thread.
const supportMessageSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    from: { type: String, enum: ['tenant', 'staff'], required: true },
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null }, // who replied (staff messages only)
    staffName: { type: String, default: '' },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    // "read by the other side": tenant messages are read once ANY staff opens the thread,
    // staff messages are read once the tenant opens their chat.
    read: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

supportMessageSchema.index({ tenant: 1, createdAt: 1 });

export default mongoose.model('SupportMessage', supportMessageSchema);
