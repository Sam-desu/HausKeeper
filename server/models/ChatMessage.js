import mongoose from 'mongoose';

// AI-assistant history. One row per message, owned by one tenant or one staff account,
// so the tenant bot and the admin bot each keep their own private conversation per person.
const chatMessageSchema = new mongoose.Schema(
  {
    ownerType: { type: String, enum: ['tenant', 'staff'], required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true, maxlength: 8000 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc, ret) => ({ id: ret._id, role: ret.role, text: ret.text, createdAt: ret.createdAt }),
    },
  }
);

chatMessageSchema.index({ ownerType: 1, owner: 1, createdAt: 1 });

export default mongoose.model('ChatMessage', chatMessageSchema);
