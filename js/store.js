// Estado de la app y persistencia local (los datos viven solo en este dispositivo).
import { uid, today, round2 } from './format.js';

const KEY = 'finanzas.v1';

export const DEFAULT_CATEGORIES = [
  { id: 'super', name: 'Supermercado', icon: '🛒' },
  { id: 'comida', name: 'Restaurantes y delivery', icon: '🍔' },
  { id: 'antojos', name: 'Antojos y café', icon: '☕' },
  { id: 'transporte', name: 'Transporte', icon: '🚌' },
  { id: 'vivienda', name: 'Vivienda', icon: '🏠' },
  { id: 'servicios', name: 'Servicios', icon: '💡' },
  { id: 'celular', name: 'Celular e internet', icon: '📱' },
  { id: 'salud', name: 'Salud', icon: '💊' },
  { id: 'educacion', name: 'Educación', icon: '📚' },
  { id: 'ocio', name: 'Salidas y ocio', icon: '🎉' },
  { id: 'suscripciones', name: 'Suscripciones', icon: '📺' },
  { id: 'ropa', name: 'Ropa', icon: '👕' },
  { id: 'cuidado', name: 'Cuidado personal', icon: '🧴' },
  { id: 'hogar', name: 'Hogar', icon: '🛋️' },
  { id: 'familia', name: 'Familia', icon: '👨‍👩‍👧' },
  { id: 'regalos', name: 'Regalos', icon: '🎁' },
  { id: 'mascotas', name: 'Mascotas', icon: '🐾' },
  { id: 'otros', name: 'Otros', icon: '📦' },
];

function emptyState() {
  return {
    version: 1,
    settings: {
      name: '',
      partnerName: 'Pareja',
      defaultSharedPct: 50,
      savingsMonthly: 0,
      lastMethod: 'cash',
      setupDismissed: false,
      lastBackupAt: 0,
      backupSnoozeUntil: 0,
    },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    incomes: [],   // {id, name, amount, day}
    fixed: [],     // {id, name, amount, day, categoryId, shared, myPct}
    cards: [],     // {id, name, closingDay, dueDay, limit, startBalance, planMonthly}
    loans: [],     // {id, name, payment, dueDay, installments, startDate}
    txs: [],       // ver addTx()
  };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('No se pudo leer el almacenamiento', e);
    return emptyState();
  }
}

function migrate(data) {
  const base = emptyState();
  return {
    ...base,
    ...data,
    settings: { ...base.settings, ...(data.settings || {}) },
    categories: data.categories?.length ? data.categories : base.categories,
  };
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('No se pudo guardar', e);
    alert('No se pudo guardar en este dispositivo. Exporta un respaldo desde Ajustes.');
  }
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit() {
  persist();
  listeners.forEach((fn) => fn(state));
}

// ---------- Ajustes ----------

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  commit();
}

// ---------- Colecciones genéricas (incomes, fixed, cards, loans, categories) ----------

export function upsert(collection, item) {
  const list = state[collection];
  if (item.id) {
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = { ...list[i], ...item };
    else list.push(item);
  } else {
    list.push({ ...item, id: uid() });
  }
  commit();
}

export function remove(collection, id) {
  state[collection] = state[collection].filter((x) => x.id !== id);
  commit();
}

export function findById(collection, id) {
  return state[collection].find((x) => x.id === id);
}

// ---------- Movimientos ----------
// tx = {
//   id, date, createdAt,
//   type: 'expense' | 'income' | 'fixed' | 'cardpay' | 'loanpay' | 'settle',
//   amount,            // monto total
//   categoryId,        // gastos
//   note,
//   method,            // 'cash' (efectivo/débito) o id de tarjeta
//   shared, myPct, paidBy: 'me' | 'partner',  // gastos compartidos
//   refId,             // fijo / tarjeta / préstamo asociado
//   direction,         // settle: 'in' (me pagaron) | 'out' (pagué yo)
// }

export function addTx(tx) {
  const clean = {
    id: tx.id || uid(),
    createdAt: tx.createdAt || Date.now(),
    date: tx.date || today(),
    type: tx.type || 'expense',
    amount: round2(tx.amount),
    categoryId: tx.categoryId || null,
    note: (tx.note || '').trim(),
    method: tx.method || 'cash',
    shared: !!tx.shared,
    myPct: tx.shared ? Number(tx.myPct ?? 50) : 100,
    paidBy: tx.shared ? (tx.paidBy || 'me') : 'me',
    refId: tx.refId || null,
    direction: tx.direction || null,
  };
  // Si lo pagó la otra persona, no sale de mi efectivo ni de mi tarjeta.
  if (clean.paidBy === 'partner') clean.method = 'partner';

  const i = state.txs.findIndex((x) => x.id === clean.id);
  if (i >= 0) state.txs[i] = clean;
  else state.txs.push(clean);

  if (['expense', 'fixed'].includes(clean.type) && clean.paidBy === 'me') {
    state.settings.lastMethod = clean.method;
  }
  commit();
  return clean;
}

export function removeTx(id) {
  state.txs = state.txs.filter((x) => x.id !== id);
  commit();
}

// ---------- Respaldo ----------

export function exportJSON() {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !Array.isArray(data.txs)) {
    throw new Error('El archivo no parece un respaldo de esta app.');
  }
  state = migrate(data);
  commit();
}

export function resetAll() {
  state = emptyState();
  commit();
}
