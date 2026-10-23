import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const PERMISSIONS = ['tenants', 'rooms', 'billing', 'maintenance', 'staff', 'settings'];

const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, default: '' }, // job title, e.g. "Front Desk Staff"
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    perms: { type: [String], enum: PERMISSIONS, default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
  }
);

staffSchema.pre('save', async function () {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

staffSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

export default mongoose.model('Staff', staffSchema);