import mongoose from 'mongoose';

// A hallway (or corridor, lobby, stairwell...) drawn on a floor plan. Unlike a room it has no
// tenant or status; it is just an outline with a name.
const hallwaySchema = new mongoose.Schema(
  {
    floor: { type: Number, required: true, min: 0 },
    name: { type: String, trim: true, maxlength: 40, default: 'Hallway' },
    // Outline as a flat list [x1, y1, x2, y2, ...]
    plan: { type: [Number], required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export default mongoose.model('Hallway', hallwaySchema);
