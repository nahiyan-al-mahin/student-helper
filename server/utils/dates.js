// Small date helpers. All dates are the server's local time,
// written as 'YYYY-MM-DD' and times as 'HH:MM'.
const pad = (n) => String(n).padStart(2, '0');

const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toDateStr(new Date());

// '2026-10-28' -> Date at local midnight
const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const addDays = (s, n) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
};

// 'HH:MM' or 'HH:MM:SS' on a given date -> Date
const atTime = (dateStr, time) => {
  const d = parseDate(dateStr);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

const isValidDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDate(s));

module.exports = { pad, toDateStr, today, parseDate, addDays, atTime, isValidDate };
