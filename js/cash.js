// Caja: cuánto dinero tienes hoy y cómo se mueve en los próximos días.
// Parte de los saldos que anotaste, suma lo que registraste después y proyecta
// ingresos y pagos programados (préstamos, fijos, tarjetas, proyectos).
import {
  today, toISO, monthKey, addMonths, round2, dateInMonth,
} from './format.js';
import { incomeOccurrences, addDays } from './schedule.js';
import { loanStatus, cardBalance, pendingProjectItems } from './calc.js';

export const HORIZON_DAYS = 30;

export function hasAccounts(state) {
  return state.accounts.length > 0;
}

function balancesDate(state) {
  const t = state.settings.balancesUpdatedAt;
  return t ? toISO(new Date(t)) : null;
}

// Efecto en tu caja de un movimiento ya registrado.
function cashEffect(tx) {
  switch (tx.type) {
    case 'expense':
    case 'fixed':
    case 'project':
      return tx.paidBy === 'me' && tx.method === 'cash' ? -tx.amount : 0;
    case 'income':
      return tx.amount;
    case 'loanpay':
    case 'cardpay':
      return -tx.amount;
    case 'settle':
      return tx.direction === 'in' ? tx.amount : -tx.amount;
    default:
      return 0;
  }
}

// Dinero disponible ahora: saldos anotados + movimientos registrados después.
export function currentCash(state) {
  const base = state.accounts.filter((a) => a.cash !== false).reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const since = state.settings.balancesUpdatedAt || 0;
  const delta = state.txs.filter((t) => (t.createdAt || 0) > since).reduce((s, t) => s + cashEffect(t), 0);
  return round2(base + delta);
}

// Movimientos futuros dentro del horizonte (los vencidos sin pagar cuentan como hoy).
export function upcomingCashEvents(state, todayStr = today(), days = HORIZON_DAYS) {
  const end = addDays(todayStr, days - 1);
  const snap = balancesDate(state);
  const events = [];
  const clamp = (d) => (d < todayStr ? todayStr : d);
  const mk0 = monthKey(todayStr);
  const months = [addMonths(mk0, -1), mk0, addMonths(mk0, 1), addMonths(mk0, 2)];

  // Ingresos que llegan a tu cuenta, posteriores a la fecha de tus saldos.
  for (const mk of months) {
    for (const o of incomeOccurrences(state, mk)) {
      if (o.income.cash === false) continue;
      if (o.date < todayStr || o.date > end) continue;
      if (snap === todayStr && o.date === todayStr) continue; // ya incluido al anotar el saldo hoy
      events.push({ date: o.date, amount: o.amount, name: o.income.name, kind: 'income', tentative: o.tentative });
    }
  }

  // Cuotas de préstamos (sin pagar en su mes).
  for (const l of state.loans) {
    let remaining = loanStatus(state, l).remaining;
    for (const mk of months) {
      if (remaining <= 0) break;
      const st = loanStatus(state, l, mk);
      if (st.paidThisMonth) continue;
      const due = dateInMonth(mk, l.dueDay);
      if (due > end) continue;
      if (mk < mk0 && due < todayStr) continue; // meses anteriores: se asume resuelto
      events.push({ date: clamp(due), amount: -Number(l.payment), name: l.name, kind: 'loan', overdue: due < todayStr });
      remaining -= 1;
    }
  }

  // Gastos fijos pendientes (tu parte).
  for (const f of state.fixed) {
    for (const mk of [mk0, addMonths(mk0, 1)]) {
      const paid = state.txs.some((t) => t.type === 'fixed' && t.refId === f.id && monthKey(t.date) === mk);
      if (paid) continue;
      const due = dateInMonth(mk, f.day);
      if (due > end) continue;
      const amount = f.shared ? (f.amount * (f.myPct ?? 50)) / 100 : Number(f.amount);
      events.push({ date: clamp(due), amount: -round2(amount), name: f.name, kind: 'fixed', overdue: due < todayStr });
    }
  }

  // Tarjetas: compras del mes + pago extra planeado (estimado).
  for (const c of state.cards) {
    const bal = cardBalance(state, c);
    if (bal <= 0) continue;
    let due = dateInMonth(mk0, c.dueDay);
    if (due < todayStr) due = dateInMonth(addMonths(mk0, 1), c.dueDay);
    if (due > end) continue;
    const spent = state.txs
      .filter((t) => t.method === c.id && (t.type === 'expense' || t.type === 'fixed' || t.type === 'project') && monthKey(t.date) === monthKey(addDays(due, -25)))
      .reduce((s, t) => s + t.amount, 0);
    const amount = Math.min(bal, spent + (Number(c.planMonthly) || 0));
    if (amount > 0) events.push({ date: due, amount: -round2(amount), name: `Tarjeta ${c.name} (estimado)`, kind: 'card' });
  }

  // Proyectos (ej. Matrimonio).
  for (const { project, item } of pendingProjectItems(state)) {
    if (item.date > end) continue;
    events.push({
      date: clamp(item.date), amount: -Number(item.amount), name: `${project.icon || '📌'} ${item.name}`,
      kind: 'project', projectId: project.id, itemId: item.id, overdue: item.date < todayStr,
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

// Proyección día a día y cuánto puedes gastar por día sin quedarte en rojo.
export function cashProjection(state, todayStr = today(), days = HORIZON_DAYS) {
  const start = currentCash(state);
  const events = upcomingCashEvents(state, todayStr, days);
  const byDay = new Map();
  for (const e of events) byDay.set(e.date, (byDay.get(e.date) || 0) + e.amount);

  let bal = start;
  let safeDaily = Infinity;
  let low = { date: todayStr, balance: start };
  let bindingDate = todayStr;
  let firstNegative = null;
  const timeline = [];
  for (let k = 1; k <= days; k++) {
    const d = addDays(todayStr, k - 1);
    bal = round2(bal + (byDay.get(d) || 0));
    timeline.push({ date: d, balance: bal });
    if (bal < low.balance) low = { date: d, balance: bal };
    if (bal < 0 && !firstNegative) firstNegative = d;
    const ratio = bal / k;
    if (ratio < safeDaily) { safeDaily = ratio; bindingDate = d; }
  }

  // Saldo corrido para mostrar en la lista.
  let run = start;
  const rows = events.map((e) => { run = round2(run + e.amount); return { ...e, after: run }; });

  return {
    start,
    events: rows,
    timeline,
    end: bal,
    low,
    firstNegative,
    safeDaily: round2(Math.max(0, safeDaily)),
    bindingDate,
    days,
  };
}
