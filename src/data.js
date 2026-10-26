export const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH');

export const initials = (name) => name.split(' ').map((s) => s[0]).join('');

export const METHOD_LABELS = {
  gcash: 'GCash',
  paymaya: 'Maya',
  card: 'Card',
  cash: 'Cash',
  bank: 'Bank transfer',
  other: 'Other',
};