// Calendario: feriados del Perú, días hábiles y fechas de cobro de cada ingreso.
import { pad, toISO, parseISO, dateInMonth } from './format.js';

// ---------- Feriados nacionales del Perú ----------

const FIXED_HOLIDAYS = {
  '01-01': 'Año Nuevo',
  '05-01': 'Día del Trabajo',
  '06-07': 'Batalla de Arica y Día de la Bandera',
  '06-29': 'San Pedro y San Pablo',
  '07-23': 'Día de la Fuerza Aérea',
  '07-28': 'Fiestas Patrias',
  '07-29': 'Fiestas Patrias',
  '08-06': 'Batalla de Junín',
  '08-30': 'Santa Rosa de Lima',
  '10-08': 'Combate de Angamos',
  '11-01': 'Todos los Santos',
  '12-08': 'Inmaculada Concepción',
  '12-09': 'Batalla de Ayacucho',
  '12-25': 'Navidad',
};

// Domingo de Pascua (algoritmo gregoriano anónimo).
function easter(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

const holidayCache = new Map();
function holidaysOf(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const map = new Map();
  for (const [md, name] of Object.entries(FIXED_HOLIDAYS)) map.set(`${year}-${md}`, name);
  const e = easter(year);
  const thu = new Date(e); thu.setDate(e.getDate() - 3);
  const fri = new Date(e); fri.setDate(e.getDate() - 2);
  map.set(toISO(thu), 'Jueves Santo');
  map.set(toISO(fri), 'Viernes Santo');
  holidayCache.set(year, map);
  return map;
}

export function holidayName(iso) {
  return holidaysOf(Number(iso.slice(0, 4))).get(iso) || null;
}

export function weekday(iso) {
  return parseISO(iso).getDay(); // 0 = domingo
}

export function isWeekend(iso) {
  const d = weekday(iso);
  return d === 0 || d === 6;
}

export function isBusinessDay(iso) {
  return !isWeekend(iso) && !holidayName(iso);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export function weekdayShort(iso) {
  return WD[weekday(iso)];
}

// Qué hacer si la fecha cae sábado, domingo o feriado.
export const RULES = {
  nearest: 'Día hábil más cercano (sábado → viernes, domingo → lunes)',
  before: 'Adelantar al día hábil anterior',
  after: 'Pasar al siguiente día hábil',
  none: 'Mantener la fecha',
};

export function adjustDate(iso, rule = 'nearest') {
  if (rule === 'none' || isBusinessDay(iso)) return iso;
  const month = iso.slice(0, 7);
  // Día hábil más próximo en una dirección, sin salir del mes (null si no hay).
  const walk = (dir) => {
    let d = iso;
    for (let i = 0; i < 10; i++) {
      d = addDays(d, dir);
      if (d.slice(0, 7) !== month) return null;
      if (isBusinessDay(d)) return { d, dist: i + 1 };
    }
    return null;
  };
  const back = walk(-1);
  const fwd = walk(1);
  if (rule === 'before') return (back || fwd).d;
  if (rule === 'after') return (fwd || back).d;
  // Más cercano (sábado → viernes, domingo → lunes); si empatan, el anterior.
  if (!back) return fwd.d;
  if (!fwd) return back.d;
  return fwd.dist < back.dist ? fwd.d : back.d;
}

// ---------- Ingresos programados ----------

export const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const INCOME_KINDS = {
  quincena: { label: 'Quincena', icon: '💵', day: 13, months: ALL_MONTHS, counts: true },
  finmes: { label: 'Fin de mes', icon: '💵', day: 28, months: ALL_MONTHS, counts: true },
  grati: { label: 'Gratificación', icon: '🎁', day: 10, months: [7, 12], counts: true },
  cts: { label: 'CTS', icon: '🏦', day: 15, months: [5, 11], counts: false },
  aguinaldo: { label: 'Aguinaldo', icon: '🎄', day: 11, months: [12], counts: true },
  otro: { label: 'Otro', icon: '💰', day: 30, months: ALL_MONTHS, counts: true },
};

export function incomeIcon(income) {
  return (INCOME_KINDS[income.kind] || INCOME_KINDS.otro).icon;
}

export function incomeMonths(income) {
  return Array.isArray(income.months) && income.months.length ? income.months : ALL_MONTHS;
}

export function countsInBudget(income) {
  return income.counts !== false;
}

// Fecha y monto de un ingreso en el mes `mk` (YYYY-MM), o null si ese mes no hay pago.
export function incomeOccurrence(income, mk) {
  const month = Number(mk.slice(5, 7));
  if (!incomeMonths(income).includes(month)) return null;
  const ov = income.overrides?.[mk] || {};
  if (ov.skip) return null;
  const nominal = dateInMonth(mk, income.day);
  const auto = adjustDate(nominal, income.rule || 'nearest');
  return {
    income,
    mk,
    nominal,
    auto,
    date: ov.date || auto,
    amount: ov.amount != null && ov.amount !== '' ? Number(ov.amount) : Number(income.amount) || 0,
    tentative: !!ov.tentative,
    manual: !!ov.date,
    moved: !ov.date && auto !== nominal,
  };
}

export function incomeOccurrences(state, mk) {
  return state.incomes
    .map((i) => incomeOccurrence(i, mk))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Por qué se movió la fecha automática, en palabras.
export function movedReason(occ) {
  if (!occ.moved) return '';
  const h = holidayName(occ.nominal);
  const why = h ? `es feriado (${h})` : `cae ${weekday(occ.nominal) === 0 ? 'domingo' : 'sábado'}`;
  return `El ${Number(occ.nominal.slice(8, 10))} ${why}`;
}

export function monthGrid(mk) {
  // Semanas de lunes a domingo con las fechas ISO (null fuera del mes).
  const [y, m] = mk.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${mk}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
