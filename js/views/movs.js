// Movimientos del mes: lista por día, totales y gastos por categoría.
import { getState, addTx, removeTx } from '../store.js';
import { monthSummary, myShare } from '../calc.js';
import {
  money, monthName, currentMonth, addMonths, dayLabel, esc, capitalize, parseAmount, today,
} from '../format.js';
import {
  ICONS, txRow, txView, categoryBars, openSheet, toast,
} from '../ui.js';

export default function movs(el, params) {
  const s = getState();
  const mk = /^\d{4}-\d{2}$/.test(params.m || '') ? params.m : currentMonth();
  const m = monthSummary(s, mk);
  const view = params.v === 'cat' ? 'cat' : 'list';
  const isFuture = mk >= currentMonth();

  const txs = [...m.txs].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const byDay = new Map();
  for (const t of txs) {
    if (!byDay.has(t.date)) byDay.set(t.date, []);
    byDay.get(t.date).push(t);
  }

  const spent = m.totalOut;
  const income = m.income;

  el.innerHTML = `
    <header class="topbar"><h1>Movimientos</h1></header>

    <div class="month-nav">
      <a class="icon-btn" href="#/movimientos?m=${addMonths(mk, -1)}&v=${view}" aria-label="Mes anterior">${ICONS.left}</a>
      <strong>${capitalize(monthName(mk))}</strong>
      ${isFuture ? '<span style="width:44px"></span>' : `<a class="icon-btn" href="#/movimientos?m=${addMonths(mk, 1)}&v=${view}" aria-label="Mes siguiente">${ICONS.right}</a>`}
    </div>

    <div class="stats" style="margin-bottom:14px">
      <div class="stat"><div class="stat-label">Ingresos</div><div class="stat-value ok-text">${money(income)}</div></div>
      <div class="stat"><div class="stat-label">Gastos y cuotas</div><div class="stat-value">${money(spent)}</div></div>
    </div>

    <div class="seg" style="margin-bottom:14px">
      <button type="button" data-v="list" aria-pressed="${view === 'list'}">Por día</button>
      <button type="button" data-v="cat" aria-pressed="${view === 'cat'}">Por categoría</button>
    </div>

    ${view === 'cat'
    ? `<section class="card">${categoryBars(m.categories, m.totalOut)}</section>`
    : (byDay.size
      ? [...byDay.entries()].map(([date, list]) => {
        const dayTotal = list.filter((t) => ['expense', 'fixed', 'project'].includes(t.type)).reduce((a, t) => a + myShare(t), 0);
        return `
          <div class="day-group">
            <div class="day-head"><span>${esc(dayLabel(date))}</span><span class="num">${dayTotal ? '−' + money(dayTotal) : ''}</span></div>
            <section class="card" style="padding:8px 16px;margin:0"><ul class="rows">${list.map((t) => txRow(t)).join('')}</ul></section>
          </div>`;
      }).join('')
      : '<div class="card empty"><span class="big">🗓️</span>No hay movimientos en este mes.</div>')}
  `;

  el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
    location.hash = `#/movimientos?m=${mk}&v=${b.dataset.v}`;
  }));
  el.querySelectorAll('[data-tx]').forEach((row) => row.addEventListener('click', () => openTxDetail(row.dataset.tx)));
}

// Gastos e ingresos se editan en el formulario completo; pagos y liquidaciones en una hoja simple.
export function openTxDetail(id) {
  const tx = getState().txs.find((t) => t.id === id);
  if (!tx) return;
  if (tx.type === 'expense' || tx.type === 'income') {
    location.hash = `#/nuevo?id=${encodeURIComponent(id)}`;
    return;
  }
  const v = txView(tx);
  openSheet({
    title: v.title,
    html: `
      <form>
        <p class="muted" style="margin-top:0">${esc(v.sub)}</p>
        <label class="field"><span>Monto</span>
          <input class="input num" name="amount" inputmode="decimal" value="${tx.amount}" required data-noautofocus="1"></label>
        <label class="field"><span>Fecha</span>
          <input class="input" type="date" name="date" value="${esc(tx.date)}" max="${today()}" required></label>
        <div class="btn-row">
          <button type="button" class="btn danger" data-del>Eliminar</button>
          <button class="btn primary">Guardar</button>
        </div>
      </form>`,
    onMount(sheet, close) {
      sheet.querySelector('[data-del]').addEventListener('click', () => {
        if (!confirm('¿Eliminar este movimiento?')) return;
        removeTx(tx.id);
        close();
        toast('Movimiento eliminado');
      });
      sheet.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const amount = parseAmount(f.get('amount'));
        if (amount <= 0) return toast('Ingresa un monto válido');
        addTx({ ...tx, amount, date: f.get('date') });
        close();
        toast('Cambios guardados');
      });
    },
  });
}
