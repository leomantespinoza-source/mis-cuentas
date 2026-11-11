// Cálculos del mes: cuánto entra, cuánto está comprometido y cuánto puedes gastar.
import {
  monthKey, currentMonth, daysInMonth, dateInMonth, today, addMonths, round2, daysBetween,
} from './format.js';
import { incomeOccurrences, countsInBudget } from './schedule.js';

// Parte que me corresponde de un movimiento (si es compartido, solo mi %).
export function myShare(tx) {
  return tx.shared ? round2((tx.amount * tx.myPct) / 100) : tx.amount;
}

export function txsOfMonth(state, mk) {
  return state.txs.filter((t) => monthKey(t.date) === mk);
}

// ---------- Tarjetas ----------

export function cardBalance(state, card) {
  let bal = Number(card.startBalance) || 0;
  for (const t of state.txs) {
    if (t.method === card.id && ['expense', 'fixed', 'project'].includes(t.type)) bal += t.amount;
    if (t.type === 'cardpay' && t.refId === card.id) bal -= t.amount;
  }
  return round2(bal);
}

export function cardSpentThisCycle(state, card, mk = currentMonth()) {
  return round2(state.txs
    .filter((t) => t.method === card.id && monthKey(t.date) === mk && ['expense', 'fixed', 'project'].includes(t.type))
    .reduce((s, t) => s + t.amount, 0));
}

// Reserva mensual para bajar deuda acumulada de la tarjeta (aparte de compras nuevas).
function cardReserve(state, card) {
  const plan = Number(card.planMonthly) || 0;
  if (!plan) return 0;
  const bal = cardBalance(state, card);
  return bal > 0 ? Math.min(plan, bal) : 0;
}

// ---------- Préstamos ----------

export function loanStatus(state, loan, mk = currentMonth()) {
  const pays = state.txs.filter((t) => t.type === 'loanpay' && t.refId === loan.id);
  const paidCount = pays.length;
  const remaining = Math.max(0, (Number(loan.installments) || 0) - paidCount);
  const paidThisMonth = pays.find((t) => monthKey(t.date) === mk) || null;
  const remainingAmount = round2(remaining * (Number(loan.payment) || 0));
  let endMonth = null;
  if (remaining > 0) endMonth = addMonths(currentMonth(), paidThisMonth ? remaining : remaining - 1);
  return { paidCount, remaining, paidThisMonth, remainingAmount, endMonth, done: remaining === 0 };
}

// ---------- Proyectos (pagos grandes programados) ----------

export function projectItemPaid(state, projectId, itemId) {
  return state.txs.find((t) => t.type === 'project' && t.refId === projectId && t.itemId === itemId) || null;
}

export function pendingProjectItems(state) {
  const out = [];
  for (const p of state.projects) {
    for (const it of p.items || []) {
      if (!projectItemPaid(state, p.id, it.id)) out.push({ project: p, item: it });
    }
  }
  return out.sort((a, b) => a.item.date.localeCompare(b.item.date));
}

export function projectTotals(state, p) {
  const total = (p.items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const paid = (p.items || []).reduce((s, it) => {
    const tx = projectItemPaid(state, p.id, it.id);
    return s + (tx ? tx.amount : 0);
  }, 0);
  return { total: round2(total), paid: round2(paid), pending: round2(total - paid) };
}

// ---------- Compartidos ----------

// Positivo: la otra persona te debe. Negativo: tú le debes.
export function sharedBalance(state) {
  let bal = 0;
  for (const t of state.txs) {
    if ((t.type === 'expense' || t.type === 'fixed' || t.type === 'project') && t.shared) {
      if (t.paidBy === 'me') bal += (t.amount * (100 - t.myPct)) / 100;
      else bal -= (t.amount * t.myPct) / 100;
    }
    if (t.type === 'settle') bal += t.direction === 'in' ? -t.amount : t.amount;
  }
  return round2(bal);
}

// ---------- Resumen del mes ----------

export function monthSummary(state, mk = currentMonth(), todayStr = today()) {
  const txs = txsOfMonth(state, mk);
  const curMk = monthKey(todayStr);
  const isCurrent = mk === curMk;

  // Ingresos programados de este mes (quincena, fin de mes, gratificación…)
  const incomeItems = incomeOccurrences(state, mk);
  const incomePlanned = incomeItems.filter((o) => countsInBudget(o.income)).reduce((s, o) => s + o.amount, 0);
  const incomeExtra = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const income = round2(incomePlanned + incomeExtra);

  // Gastos fijos: si ya se pagó, cuenta lo real; si no, lo estimado.
  const fixedIds = new Set(state.fixed.map((f) => f.id));
  const fixedItems = state.fixed.map((f) => {
    const paidTx = txs.find((t) => t.type === 'fixed' && t.refId === f.id) || null;
    const estimate = f.shared ? (f.amount * (f.myPct ?? 50)) / 100 : Number(f.amount) || 0;
    const reserved = paidTx ? myShare(paidTx) : estimate;
    return { item: f, paidTx, estimate: round2(estimate), reserved: round2(reserved), dueDate: dateInMonth(mk, f.day) };
  });
  const orphanFixed = txs.filter((t) => t.type === 'fixed' && !fixedIds.has(t.refId))
    .reduce((s, t) => s + myShare(t), 0);
  const fixedTotal = round2(fixedItems.reduce((s, f) => s + f.reserved, 0) + orphanFixed);
  const fixedPaid = round2(fixedItems.filter((f) => f.paidTx).reduce((s, f) => s + f.reserved, 0) + orphanFixed);

  // Préstamos
  const loanItems = state.loans.map((l) => {
    const st = loanStatus(state, l, mk);
    const active = st.remaining > 0 || !!st.paidThisMonth;
    const reserved = st.paidThisMonth ? st.paidThisMonth.amount : (active ? Number(l.payment) || 0 : 0);
    return { item: l, ...st, reserved: round2(reserved), dueDate: dateInMonth(mk, l.dueDay) };
  });
  const loansTotal = round2(loanItems.reduce((s, l) => s + l.reserved, 0));

  // Tarjetas (reserva para bajar deuda acumulada)
  const cardsTotal = round2(state.cards.reduce((s, c) => s + cardReserve(state, c), 0));

  const savings = Number(state.settings.savingsMonthly) || 0;
  const committed = round2(fixedTotal + loansTotal + cardsTotal + savings);
  const variableBudget = round2(income - committed);

  // Gastos variables (mi parte)
  const expenses = txs.filter((t) => t.type === 'expense');
  const variableSpent = round2(expenses.reduce((s, t) => s + myShare(t), 0));
  const variableLeft = round2(variableBudget - variableSpent);

  // Días
  const dim = daysInMonth(mk);
  let day;
  if (isCurrent) day = Number(todayStr.slice(8, 10));
  else day = mk < curMk ? dim : 1;
  const daysLeft = isCurrent ? dim - day + 1 : (mk < curMk ? 0 : dim);

  const spentToday = isCurrent
    ? round2(expenses.filter((t) => t.date === todayStr).reduce((s, t) => s + myShare(t), 0))
    : 0;
  const dailyAllowance = daysLeft > 0 ? round2((variableBudget - (variableSpent - spentToday)) / daysLeft) : 0;
  const todayLeft = round2(dailyAllowance - spentToday);

  // Ritmo: cuánto "deberías" llevar gastado a estas alturas del mes.
  const expectedByNow = round2(Math.max(0, variableBudget) * ((day - 1) / dim));
  const pace = variableBudget > 0 ? variableSpent / Math.max(1, expectedByNow || variableBudget / dim) : 0;

  // ¿En qué se va el dinero? (gastos reales del mes, mi parte)
  const byCat = new Map();
  for (const t of txs) {
    if (t.type === 'expense' || t.type === 'fixed' || t.type === 'project') {
      const k = t.type === 'project' ? `proyecto:${t.refId}` : (t.categoryId || 'otros');
      byCat.set(k, (byCat.get(k) || 0) + myShare(t));
    }
    if (t.type === 'loanpay') byCat.set('__loans', (byCat.get('__loans') || 0) + t.amount);
  }
  const categories = [...byCat.entries()]
    .map(([id, total]) => ({ id, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
  const totalOut = round2(categories.reduce((s, c) => s + c.total, 0));

  return {
    mk, isCurrent, income, incomePlanned: round2(incomePlanned), incomeExtra: round2(incomeExtra), incomeItems,
    fixedItems, fixedTotal, fixedPaid, loanItems, loansTotal, cardsTotal, savings,
    committed, variableBudget, variableSpent, variableLeft,
    dim, day, daysLeft, spentToday, dailyAllowance, todayLeft, expectedByNow, pace,
    categories, totalOut, txs,
  };
}

// ---------- Próximos pagos ----------

export function upcomingPayments(state, todayStr = today(), horizon = 10) {
  const mk = monthKey(todayStr);
  const nextMk = addMonths(mk, 1);
  const s = monthSummary(state, mk, todayStr);
  const items = [];

  for (const f of s.fixedItems) {
    if (f.paidTx) continue;
    items.push({ kind: 'fixed', id: f.item.id, name: f.item.name, amount: f.item.amount, date: f.dueDate });
  }
  for (const l of s.loanItems) {
    if (l.done && !l.paidThisMonth) continue;
    if (l.paidThisMonth) {
      if (l.remaining > 0) items.push({ kind: 'loan', id: l.item.id, name: l.item.name, amount: l.item.payment, date: dateInMonth(nextMk, l.item.dueDay) });
    } else {
      items.push({ kind: 'loan', id: l.item.id, name: l.item.name, amount: l.item.payment, date: l.dueDate });
    }
  }
  for (const c of state.cards) {
    const bal = cardBalance(state, c);
    if (bal <= 0) continue;
    let due = dateInMonth(mk, c.dueDay);
    const paidRecently = state.txs.some((t) => t.type === 'cardpay' && t.refId === c.id && daysBetween(t.date, due) <= 25 && daysBetween(t.date, due) >= 0);
    if (due < todayStr || paidRecently) due = dateInMonth(nextMk, c.dueDay);
    items.push({ kind: 'card', id: c.id, name: `Tarjeta ${c.name}`, amount: bal, date: due });
  }
  // Pagos de proyectos: si varios vencen el mismo día, se agrupan en una sola fila.
  const groups = new Map();
  for (const { project, item } of pendingProjectItems(state)) {
    const k = `${project.id}|${item.date}`;
    if (!groups.has(k)) groups.set(k, { project, date: item.date, list: [] });
    groups.get(k).list.push(item);
  }
  for (const g of groups.values()) {
    const one = g.list.length === 1;
    items.push({
      kind: 'project',
      id: `${g.project.id}|${one ? g.list[0].id : '*'}`,
      name: `${g.project.icon || '📌'} ${one ? g.list[0].name : `${g.project.name} (${g.list.length} pagos)`}`,
      amount: round2(g.list.reduce((s, it) => s + Number(it.amount), 0)),
      date: g.date,
    });
  }

  return items
    .map((it) => ({ ...it, days: daysBetween(todayStr, it.date), overdue: it.date < todayStr }))
    .filter((it) => it.overdue || it.days <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Próximo ingreso desde hoy (mira este mes y los dos siguientes).
export function nextIncome(state, todayStr = today()) {
  const mk = monthKey(todayStr);
  for (const m of [mk, addMonths(mk, 1), addMonths(mk, 2)]) {
    const next = incomeOccurrences(state, m).find((o) => o.date >= todayStr);
    if (next) return { ...next, days: daysBetween(todayStr, next.date) };
  }
  return null;
}

// Todo lo que pasa en un mes, por fecha: ingresos y pagos (para el calendario).
export function monthEvents(state, mk) {
  const events = [];
  for (const o of incomeOccurrences(state, mk)) {
    events.push({ kind: 'income', date: o.date, name: o.income.name, amount: o.amount, occ: o, id: o.income.id });
  }
  const s = monthSummary(state, mk);
  for (const f of s.fixedItems) {
    events.push({ kind: 'fixed', date: f.paidTx ? f.paidTx.date : f.dueDate, name: f.item.name, amount: f.paidTx ? f.paidTx.amount : f.item.amount, paid: !!f.paidTx, id: f.item.id });
  }
  for (const l of s.loanItems) {
    if (l.done && !l.paidThisMonth) continue;
    events.push({ kind: 'loan', date: l.paidThisMonth ? l.paidThisMonth.date : l.dueDate, name: l.item.name, amount: l.item.payment, paid: !!l.paidThisMonth, id: l.item.id });
  }
  for (const c of state.cards) {
    if (cardBalance(state, c) <= 0) continue;
    events.push({ kind: 'card', date: dateInMonth(mk, c.dueDay), name: `Tarjeta ${c.name}`, amount: null, id: c.id });
  }
  for (const p of state.projects) {
    for (const it of p.items || []) {
      const tx = projectItemPaid(state, p.id, it.id);
      const date = tx ? tx.date : it.date;
      if (monthKey(date) !== mk) continue;
      events.push({ kind: 'project', date, name: `${p.icon || '📌'} ${it.name}`, amount: tx ? tx.amount : it.amount, paid: !!tx, id: `${p.id}|${it.id}` });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'income' ? -1 : 1));
}

export function totalDebt(state) {
  const cards = state.cards.reduce((s, c) => s + Math.max(0, cardBalance(state, c)), 0);
  const loans = state.loans.reduce((s, l) => s + loanStatus(state, l).remainingAmount, 0);
  return { cards: round2(cards), loans: round2(loans), total: round2(cards + loans) };
}
