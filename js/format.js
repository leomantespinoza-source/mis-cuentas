// Utilidades de formato: dinero, fechas y escape de HTML.

const moneyFmt = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const moneyShortFmt = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function money(n) {
  return moneyFmt.format(round2(n || 0));
}

export function moneyShort(n) {
  return moneyShortFmt.format(Math.round(n || 0));
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function parseAmount(str) {
  if (typeof str === 'number') return round2(str);
  const clean = String(str || '').replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? round2(n) : 0;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// ---------- Fechas (siempre en hora local, formato YYYY-MM-DD) ----------

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today() {
  return toISO(new Date());
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function monthKey(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}

export function currentMonth() {
  return monthKey(today());
}

export function daysInMonth(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function addMonths(mk, delta) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function monthName(mk) {
  const [y, m] = mk.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthNameShort(mk) {
  const [, m] = mk.split('-').map(Number);
  return MONTHS[m - 1];
}

export function dayLabel(dateStr) {
  const t = today();
  if (dateStr === t) return 'Hoy';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (dateStr === toISO(y)) return 'Ayer';
  const d = parseISO(dateStr);
  return `${capitalize(WEEKDAYS[d.getDay()])} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function shortDate(dateStr) {
  const d = parseISO(dateStr);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Fecha concreta del día `day` en el mes `mk`, ajustada si el mes es más corto.
export function dateInMonth(mk, day) {
  const d = Math.min(Math.max(1, Number(day) || 1), daysInMonth(mk));
  return `${mk}-${pad(d)}`;
}

// Diferencia en días entre dos fechas ISO (b - a).
export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
