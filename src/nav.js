export const TENANT_NAV = [
  { group: 'Home', items: [{ to: '/tenant/dashboard', label: 'Dashboard', tag: 'DB' }] },
  {
    group: 'Housing',
    items: [
      { to: '/tenant/rooms', label: 'Find a room', tag: 'RM' },
      { to: '/tenant/move-in', label: 'Move-in form', tag: 'IN' },
      { to: '/tenant/move-out', label: 'Move-out request', tag: 'OUT' },
      { to: '/tenant/room-designer', label: 'Room Designer', tag: 'RD'}
    ],
  },
  {
    group: 'Account',
    items: [
      { to: '/tenant/billing', label: 'Billing & payments', tag: '₱' },
      { to: '/tenant/maintenance', label: 'Maintenance requests', tag: 'FX' },
      { to: '/tenant/support', label: 'Contact support', tag: 'SP' },
      { to: '/tenant/profile', label: 'Profile & settings', tag: 'ME' },
    ],
  },
];

export const ADMIN_NAV = [
  { group: 'Overview', items: [{ to: '/admin/dashboard', label: 'Dashboard', tag: 'DB' }] },
  {
    group: 'Operations',
    items: [
      { to: '/admin/tenants', label: 'Tenants', tag: 'TN', perm: 'tenants' },
      { to: '/admin/reservations', label: 'Reservations', tag: 'RS', perm: 'tenants' },
      { to: '/admin/move-ins', label: 'Move-in forms', tag: 'MI', perm: 'tenants' },
      { to: '/admin/rooms', label: 'Rooms', tag: 'RM', perm: 'rooms' },
      { to: '/admin/billing', label: 'Billing & payments', tag: '₱', perm: 'billing' },
      { to: '/admin/maintenance', label: 'Maintenance', tag: 'FX', perm: 'maintenance' },
      { to: '/admin/support', label: 'Support inbox', tag: 'SP' },
    ],
  },
  {
    group: 'Management',
    items: [
      { to: '/admin/reports', label: 'Reports', tag: 'RP', perm: 'billing' },
      { to: '/admin/staff', label: 'Staff & users', tag: 'ST', perm: 'staff' },
      { to: '/admin/settings', label: 'Settings', tag: 'CFG', perm: 'settings' },
      { to: '/admin/map', label: 'Map', tag: 'MP' },
    ],
  },
];