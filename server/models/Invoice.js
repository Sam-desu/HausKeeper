import mongoose from "mongoose";
import { todayManila } from "../utils/dates.js";

const invoiceSchema = new mongoose.Schema(
  {
    _id: String, // e.g. "INV-2207"
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    room: { type: String, required: true },
    period: { type: String, required: true, trim: true }, // e.g. "Sep 2026"
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["unpaid", "paid"], default: "unpaid" }, // "overdue" is never stored
    due: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    paidOn: { type: String, default: null },
    // "rent" = normal monthly invoice, "maintenance" = repair charge raised from a ticket
    kind: { type: String, enum: ["rent", "maintenance"], default: "rent" },
    ticket: { type: String, default: null }, // ticket id for maintenance charges (one charge per ticket)
    cycle: { type: String, default: null },
    description: { type: String, default: "", trim: true, maxlength: 300 },
    // how it was paid: gcash / paymaya / card (online) or cash / bank / other (recorded by staff)
    method: { type: String, default: null },
    checkoutSessions: { type: [String], default: [] }, // recent PayMongo checkout session ids
    overdueNotified: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.overdueNotified;
        delete ret.checkoutSessions;
        if (ret.status === "unpaid" && ret.due < todayManila())
          ret.status = "overdue";
        const v = ret.tenant;
        if (v && typeof v === "object" && v.name !== undefined) {
          ret.tenantName = v.name;
          ret.tenant = v.id ?? v._id;
        }
        return ret;
      },
    },
  },
);

// a ticket can only ever have one repair charge, even if two admins click at the same moment
invoiceSchema.index({ tenant: 1, cycle: 1 }, { unique: true, partialFilterExpression: { cycle: { $type: "string" } } });

export default mongoose.model("Invoice", invoiceSchema);
