// server/models/PasswordReset.js  (NEW FILE)
import mongoose from 'mongoose';

// One pending password-reset code per email address. Only a hash of the code is stored.
const passwordResetSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

// MongoDB removes the row by itself once expiresAt passes
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('PasswordReset', passwordResetSchema);
