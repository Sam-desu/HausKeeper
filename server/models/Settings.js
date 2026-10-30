import mongoose from 'mongoose';

const text = (def, max = 200) => ({ type: String, default: def, trim: true, maxlength: max });

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'main' }, // singleton: there is only ever one document
    propertyName: text('HausKeeper — Marikina Residence Hall'),
    address: text('24 Aster St., Marikina City'),
    billingCycle: text('Monthly, due on the 5th'),
    lateFee: text('₱200 flat + 1%/week after due date'),
    autoInvoice: { type: Boolean, default: false },            // off until the admin turns it on
    billingDueDay: { type: Number, default: 5, min: 1, max: 31 },
    invoiceLeadDays: { type: Number, default: 7, min: 0, max: 28 }, // send this many days before the due date
    // In-app notifications are always on. Email and SMS are switched here (and need credentials in .env).
    notifChannels: {
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
    },
    notifTemplates: {
      invoice: text('Hi {name}, your invoice for {period} (₱{amount}) is ready. Due {due}.', 1000),
      overdue: text('Hi {name}, your payment of ₱{amount} is now overdue. Please settle to avoid late fees.', 1000),
      ticket: text('Hi {name}, your maintenance request "{title}" is now {status}.', 1000),
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

const Settings = mongoose.model('Settings', settingsSchema);

// Creates the document with defaults the first time it's needed, so no seed is required
export async function getSettings() {
  return (await Settings.findById('main')) || (await Settings.create({ _id: 'main' }));
}

export default Settings;