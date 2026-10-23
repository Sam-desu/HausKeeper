import mongoose from 'mongoose';

const str = (extra = {}) => ({ type: String, trim: true, maxlength: 120, ...extra });

const moveInSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    legalName: str({ required: true }),
    dob: { type: String, required: true },
    email: str({ lowercase: true, default: '' }),
    phone: str({ default: '' }),
    govId: str({ required: true }), // government ID type and number
    emergencyName: str({ required: true }),
    emergencyRelationship: str({ default: '' }),
    emergencyPhone: str({ required: true }),
    agreedAt: Date,
    idFile: { name: String, mime: String }, // stored filename: never sent to the browser
    status: { type: String, enum: ['submitted', 'approved', 'rejected'], default: 'submitted' },
    reviewNote: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        ret.hasId = !!ret.idFile?.name; // the browser only learns THAT an ID exists
        delete ret.idFile;
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

export default mongoose.model('MoveIn', moveInSchema);