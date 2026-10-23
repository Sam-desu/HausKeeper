/* ============================================================
   HausKeeper — seed data + small pure helpers
   (Converted from the original in-memory mock DB. No browser
   storage is used; state lives in React state.)
=============================================================*/

export function seedDB() {
  return {
    rooms: [
      { id: 'R-101', floor: 1, type: 'Single', beds: 1, price: 6500, status: 'occupied', tenant: 'T-001', amenities: ['Window', 'Study desk', 'Shared bath'], notes: '' },
      { id: 'R-102', floor: 1, type: 'Single', beds: 1, price: 6500, status: 'available', tenant: null, amenities: ['Window', 'Study desk', 'Shared bath'], notes: '' },
      { id: 'R-103', floor: 1, type: 'Double', beds: 2, price: 5200, status: 'occupied', tenant: 'T-002', amenities: ['Balcony', 'Twin beds', 'Own bath'], notes: '' },
      { id: 'R-104', floor: 1, type: 'Double', beds: 2, price: 5200, status: 'maintenance', tenant: null, amenities: ['Balcony', 'Twin beds', 'Own bath'], notes: 'Leaking faucet — plumber booked' },
      { id: 'R-201', floor: 2, type: 'Single', beds: 1, price: 7000, status: 'occupied', tenant: 'T-003', amenities: ['Aircon', 'Study desk', 'Own bath'], notes: '' },
      { id: 'R-202', floor: 2, type: 'Suite', beds: 1, price: 9800, status: 'available', tenant: null, amenities: ['Aircon', 'Kitchenette', 'Own bath'], notes: '' },
      { id: 'R-203', floor: 2, type: 'Double', beds: 2, price: 5800, status: 'occupied', tenant: 'T-004', amenities: ['Aircon', 'Twin beds', 'Shared bath'], notes: '' },
      { id: 'R-204', floor: 2, type: 'Single', beds: 1, price: 6800, status: 'available', tenant: null, amenities: ['Window', 'Study desk', 'Own bath'], notes: '' },
      { id: 'R-301', floor: 3, type: 'Suite', beds: 1, price: 10500, status: 'occupied', tenant: 'T-005', amenities: ['Aircon', 'Kitchenette', 'Own bath', 'Balcony'], notes: '' },
      { id: 'R-302', floor: 3, type: 'Double', beds: 2, price: 5600, status: 'available', tenant: null, amenities: ['Window', 'Twin beds', 'Shared bath'], notes: '' },
    ],
    tenants: [
      { id: 'T-001', name: 'Carmela Calonzo', email: 'carmela.calonzo@gmail.com', password: 'carmela123', phone: '0917 555 0142', room: 'R-101', status: 'active', moveIn: '2025-03-01', balance: 0, emergency: 'Rosa Calonzo · 0917 555 0900' },
      { id: 'T-002', name: 'Adrian Crisostomo', email: 'adrian.crisostomo@gmail.com', password: 'adrian123', phone: '0917 555 0287', room: 'R-103', status: 'active', moveIn: '2025-05-14', balance: 5200, emergency: 'Liza Crisostomo · 0917 555 1188' },
      { id: 'T-003', name: 'John Samuel Dizon', email: 'john.dizon@gmail.com', password: 'john123', phone: '0917 555 0391', room: 'R-201', status: 'active', moveIn: '2024-11-20', balance: 0, emergency: 'Jun Dizon · 0917 555 0455' },
      { id: 'T-004', name: 'Krisha Guiterrez', email: 'krisha.guiterrez@gmail.com', password: 'krisha123', phone: '0917 555 0410', room: 'R-203', status: 'overdue', moveIn: '2025-01-09', balance: 11600, emergency: 'Nena Guiterrez · 0917 555 0212' },
      { id: 'T-005', name: 'Jonee Rose Santos', email: 'jonee.santos@gmail.com', password: 'jonee123', phone: '0917 555 0532', room: 'R-301', status: 'active', moveIn: '2025-06-02', balance: 0, emergency: 'Rico Santos · 0917 555 0781' },
    ],
    invoices: [
      { id: 'INV-2201', tenant: 'T-001', room: 'R-101', period: 'Aug 2026', amount: 6500, status: 'paid', due: '2026-08-05', paidOn: '2026-08-02' },
      { id: 'INV-2202', tenant: 'T-002', room: 'R-103', period: 'Aug 2026', amount: 5200, status: 'unpaid', due: '2026-08-05', paidOn: null },
      { id: 'INV-2203', tenant: 'T-003', room: 'R-201', period: 'Aug 2026', amount: 7000, status: 'paid', due: '2026-08-05', paidOn: '2026-08-01' },
      { id: 'INV-2204', tenant: 'T-004', room: 'R-203', period: 'Jul 2026', amount: 5800, status: 'overdue', due: '2026-07-05', paidOn: null },
      { id: 'INV-2205', tenant: 'T-004', room: 'R-203', period: 'Aug 2026', amount: 5800, status: 'overdue', due: '2026-08-05', paidOn: null },
      { id: 'INV-2206', tenant: 'T-005', room: 'R-301', period: 'Aug 2026', amount: 10500, status: 'paid', due: '2026-08-05', paidOn: '2026-08-03' },
    ],
    tickets: [
      { id: 'MT-501', tenant: 'T-002', room: 'R-103', title: 'Aircon not cooling', category: 'Electrical', priority: 'high', status: 'in-progress', assigned: 'S-002', created: '2026-08-01', notes: 'Technician visited, awaiting part.' },
      { id: 'MT-502', tenant: 'T-004', room: 'R-203', title: 'Broken window latch', category: 'Carpentry', priority: 'medium', status: 'open', assigned: null, created: '2026-08-04', notes: '' },
      { id: 'MT-503', tenant: 'T-001', room: 'R-101', title: 'Slow drain in sink', category: 'Plumbing', priority: 'low', status: 'resolved', assigned: 'S-001', created: '2026-07-20', notes: 'Cleared blockage.' },
      { id: 'MT-504', tenant: 'T-005', room: 'R-301', title: 'Wifi signal weak', category: 'Utilities', priority: 'medium', status: 'open', assigned: null, created: '2026-08-06', notes: '' },
    ],
    staff: [
      { id: 'S-001', name: 'Staff', role: 'Front Desk Staff', username: 'staff', password: 'staff123', perms: ['tenants', 'billing', 'maintenance'] },
      { id: 'S-002', name: 'Admin', role: 'Property Administrator', username: 'admin', password: 'admin123', perms: ['tenants', 'rooms', 'billing', 'maintenance', 'staff', 'settings'] },
    ],
    settings: {
      propertyName: 'HausKeeper — Marikina Residence Hall',
      address: '24 Aster St., Marikina City',
      billingCycle: 'Monthly, due on the 5th',
      lateFee: '₱200 flat + 1%/week after due date',
      notifTemplates: {
        invoice: 'Hi {name}, your invoice for {period} (₱{amount}) is ready. Due {due}.',
        overdue: 'Hi {name}, your payment of ₱{amount} is now overdue. Please settle to avoid late fees.',
        ticket: 'Hi {name}, your maintenance request "{title}" is now {status}.',
      },
    },
  };
}

export const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH');
export const byId = (arr, id) => arr.find((x) => x.id === id);
export const initials = (name) => name.split(' ').map((s) => s[0]).join('');
export const today = () => new Date().toISOString().slice(0, 10);

export const TENANT_NAV = [
  { group: 'Home', items: [{ page: 'dashboard', label: 'Dashboard', tag: 'DB' }] },
  {
    group: 'Housing',
    items: [
      { page: 'room-picker', label: 'Find a room', tag: 'RM' },
      { page: 'move-in', label: 'Move-in form', tag: 'IN' },
      { page: 'move-out', label: 'Move-out request', tag: 'OUT' },
    ],
  },
  {
    group: 'Account',
    items: [
      { page: 'billing', label: 'Billing & payments', tag: '₱' },
      { page: 'maintenance', label: 'Maintenance requests', tag: 'FX' },
      { page: 'profile', label: 'Profile & settings', tag: 'ME' },
    ],
  },
];

export const ADMIN_NAV = [
  { group: 'Overview', items: [{ page: 'dashboard', label: 'Dashboard', tag: 'DB' }] },
  {
    group: 'Operations',
    items: [
      { page: 'tenants', label: 'Tenants', tag: 'TN' },
      { page: 'rooms', label: 'Rooms', tag: 'RM' },
      { page: 'billing', label: 'Billing & payments', tag: '₱' },
      { page: 'maintenance', label: 'Maintenance', tag: 'FX' }
    ],
  },
  {
    group: 'Management',
    items: [
      { page: 'reports', label: 'Reports', tag: 'RP' },
      { page: 'staff', label: 'Staff & users', tag: 'ST' },
      { page: 'settings', label: 'Settings', tag: 'CFG' },
      { page: 'map', label: 'Map (beta)', tag: 'MP'}
    ],
  },
];

// how an invoice was paid (the server stores the lowercase key)
export const METHOD_LABELS = {
  gcash: 'GCash',
  paymaya: 'Maya',
  card: 'Card',
  cash: 'Cash',
  bank: 'Bank transfer',
  other: 'Other',
};
