import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false }, // never returned by default
    phone: { type: String, default: "" },
    room: { type: String, ref: "Room", default: null }, // room number, e.g. "R-101"
    status: {
      type: String,
      enum: ["active", "overdue", "move-out-pending", "inactive"],
      default: "active",
    },
    moveIn: {
      type: String,
      default: () => new Date().toISOString().slice(0, 10),
    },
    emergency: { type: String, default: "" },
    moveOut: {
      date: String,
      reason: String,
      notes: String,
      requestedAt: Date,
    },
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
  },
);

tenantSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

tenantSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

export default mongoose.model("Tenant", tenantSchema);
