import mongoose from 'mongoose';

// One row per person per event, so each person has their own read/unread state.
const notificationSchema = new mongoose.Schema(
  {
    recipientType: { type: String, enum: ['tenant', 'staff'], required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, default: 'info' }, // invoice | payment | overdue | ticket | charge
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: '', maxlength: 1000 },
    link: { type: String, default: '' }, // in-app route to open when clicked
    read: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.recipient;
        delete ret.recipientType;
        return ret;
      },
    },
  }
);

notificationSchema.index({ recipientType: 1, recipient: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
