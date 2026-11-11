// Calendario de pagos: vista del mes (con fines de semana y feriados) y vista del año.
import { getState } from '../store.js';
import { monthEvents } from '../calc.js';
import {
  money, esc, capitalize, monthName, currentMonth, addMonths, today, dayLabel,
} from '../format.js';
import {
  monthGrid, holidayName, isWeekend, incomeOccurrences, incomeIcon, countsInBudget, movedReason,
} from '../schedule.js';
import { ICONS, openSheet } from '../ui.js';
import { openIncomeOverride, fmtPayDate, openIncomeForm } from './incomes.js';
import { openPayFixed } from './plan.js';
import { openPayCard, openPayLoan } from './debts.js';
import { openPayItem } from './money.js';

const KIND_ICON = { income: '💵', fixed: '📅', loan: '🏦', card: '💳', project: '🧾' };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

export default function calendar(el, params) {
  const view = params.v === 'ano' ? 'ano' : 'mes';
  const mk = /^\d{4}-\d{2}$/.test(params.m || '') ? params.m : currentMonth();
  const year = /^\d{4}$/.test(params.y || '') ? Number(params.y) : Number(mk.slice(0, 4));

  el.innerHTML = `
    <header class="topbar">
      <a class="icon-btn" href="#/plan" aria-label="Volver">${ICONS.back}</a>
      <h1 style="font-size:19px">Calendario de pagos</h1>
      <span style="width:44px"></span>
    </header>
    <div class="seg" style="margin-bottom:14px">
      <button type="button" data-v="mes" aria-pressed="${view === 'mes'}">Mes</button>
      <button type="button" data-v="ano" aria-pressed="${view === 'ano'}">Año</button>
    </div>
    <div id="cal-body"></div>
  `;

  const body = el.querySelector('#cal-body');
  if (view === 'mes') renderMonth(body, mk);
  else renderYear(body, year);

  el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
    location.hash = b.dataset.v === 'ano' ? `#/calendario?v=ano&y=${mk.slice(0, 4)}` : `#/calendario?v=mes&m=${mk}`;
  }));
}

// ---------- Vista del mes ----------

function renderMonth(body, mk) {
  const s = getState();
  const events = monthEvents(s, mk);
  const byDay = new Map();
  for (const ev of events) {
    if (!byDay.has(ev.date)) byDay.set(ev.date, []);
    byDay.get(ev.date).push(ev);
  }
  const t = today();
  const cells = monthGrid(mk);
  const holidays = cells.filter((d) => d && holidayName(d));
  const incomeTotal = incomeOccurrences(s, mk).filter((o) => countsInBudget(o.income)).reduce((a, o) => a + o.amount, 0);

  body.innerHTML = `
    <div class="month-nav">
      <a class="icon-btn" href="#/calendario?v=mes&m=${addMonths(mk, -1)}" aria-label="Mes anterior">${ICONS.left}</a>
      <strong>${capitalize(monthName(mk))}</strong>
      <a class="icon-btn" href="#/calendario?v=mes&m=${addMonths(mk, 1)}" aria-label="Mes siguiente">${ICONS.right}</a>
    </div>

    <section class="card" style="padding:12px">
      <div class="cal-grid cal-head">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">
        ${cells.map((d) => {
    if (!d) return '<span class="cal-cell empty"></span>';
    const evs = byDay.get(d) || [];
    const cls = [
      'cal-cell',
      isWeekend(d) ? 'weekend' : '',
      holidayName(d) ? 'holiday' : '',
      d === t ? 'today' : '',
      evs.some((e) => e.kind === 'income') ? 'has-income' : '',
    ].join(' ');
    const dots = evs.slice(0, 3).map((e) => `<i class="dot k-${e.kind}"></i>`).join('');
    return `<button type="button" class="${cls}" data-day="${d}" aria-label="${esc(dayLabel(d))}${evs.length ? `, ${evs.length} movimientos` : ''}">
            <b>${Number(d.slice(8, 10))}</b><span class="dots">${dots}</span></button>`;
  }).join('')}
      </div>
      <div class="cal-legend small muted">
        <span><i class="dot k-income"></i> Ingreso</span><span><i class="dot k-fixed"></i> Pago</span>
        <span><i class="sq weekend"></i> Fin de semana</span><span><i class="sq holiday"></i> Feriado</span>
      </div>
    </section>

    ${holidays.length ? `<div class="small muted" style="margin:-4px 4px 12px">Feriados: ${holidays.map((d) => `${Number(d.slice(8, 10))} (${esc(holidayName(d))})`).join(' · ')}</div>` : ''}

    <div class="section-label" style="display:flex;justify-content:space-between">
      <span>Este mes</span><span class="num">Ingresos ${money(incomeTotal)}</span></div>
    <section class="card">
      ${events.length ? `<ul class="rows">${events.map((ev) => eventRow(ev)).join('')}</ul>` : '<div class="empty">No hay ingresos ni pagos este mes.</div>'}
    </section>
  `;

  body.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => openDay(b.dataset.day, byDay.get(b.dataset.day) || [], mk)));
  bindEventRows(body, mk);
}

function eventRow(ev) {
  let sub;
  if (ev.kind === 'income') {
    const o = ev.occ;
    const tags = [];
    if (o.tentative) tags.push('<span class="pill warn">Por confirmar *</span>');
    if (o.manual) tags.push('<span class="pill">Fecha elegida por ti</span>');
    else if (o.moved) tags.push(`<span class="pill ok">${esc(movedReason(o))}</span>`);
    if (!countsInBudget(o.income)) tags.push('<span class="pill">No suma al presupuesto</span>');
    sub = tags.join(' ') || 'Toca para cambiar la fecha de este mes';
  } else if (ev.paid) {
    sub = '<span class="pill ok">Pagado</span>';
  } else {
    const h = holidayName(ev.date);
    sub = isWeekend(ev.date) || h ? `<span class="pill warn">Cae ${h ? 'feriado' : 'fin de semana'}</span>` : 'Pendiente';
  }
  return `
    <li class="row tappable" data-ev="${ev.kind}" data-id="${esc(ev.id)}">
      <div class="row-icon">${ev.kind === 'income' ? incomeIcon(ev.occ.income) : KIND_ICON[ev.kind]}</div>
      <div class="row-main"><div class="row-title">${esc(ev.name)}</div><div class="row-sub" style="white-space:normal">${sub}</div></div>
      <div class="row-end"><div class="small muted">${fmtPayDate(ev.date)}</div>
        ${ev.amount != null ? `<div class="row-amount ${ev.kind === 'income' ? 'in' : ''}">${ev.kind === 'income' ? '+' : '−'}${money(ev.amount)}</div>` : ''}</div>
    </li>`;
}

function bindEventRows(root, mk) {
  root.querySelectorAll('[data-ev]').forEach((r) => r.addEventListener('click', () => {
    const { ev, id } = r.dataset;
    if (ev === 'income') openIncomeOverride(id, mk);
    if (ev === 'fixed') openPayFixed(id);
    if (ev === 'loan') openPayLoan(id);
    if (ev === 'card') openPayCard(id);
    if (ev === 'project') { const [p, i] = id.split('|'); openPayItem(p, i); }
  }));
}

function openDay(d, evs, mk) {
  const h = holidayName(d);
  let note = '';
  if (h) note = `Feriado: ${esc(h)}`;
  else if (isWeekend(d)) note = 'Fin de semana';
  openSheet({
    title: capitalize(dayLabel(d)),
    html: `
      ${note ? `<p class="muted" style="margin-top:0">${note}</p>` : ''}
      ${evs.length ? `<section class="card" style="padding:8px 16px"><ul class="rows">${evs.map((ev) => eventRow(ev)).join('')}</ul></section>`
    : '<div class="empty">Nada programado este día.</div>'}`,
    onMount(sheet) { bindEventRows(sheet, mk); },
  });
}

// ---------- Vista del año ----------

function renderYear(body, year) {
  const s = getState();
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  body.innerHTML = `
    <div class="month-nav">
      <a class="icon-btn" href="#/calendario?v=ano&y=${year - 1}" aria-label="Año anterior">${ICONS.left}</a>
      <strong>${year}</strong>
      <a class="icon-btn" href="#/calendario?v=ano&y=${year + 1}" aria-label="Año siguiente">${ICONS.right}</a>
    </div>
    ${s.incomes.length ? `
      <p class="muted small" style="margin:0 4px 12px">Así caen tus pagos en ${year}. La app ya movió los que caen fin de semana o feriado.
        Toca una fecha para cambiarla, marcarla por confirmar (*) o indicar que ese mes no hay pago.</p>
      ${months.map((mk) => yearMonthCard(s, mk)).join('')}`
    : `<section class="card empty">Primero agrega tus ingresos (quincena, fin de mes, gratificación…).
        <div style="margin-top:12px"><button class="btn primary" data-add-income>+ Agregar ingreso</button></div></section>`}
  `;

  body.querySelector('[data-add-income]')?.addEventListener('click', () => openIncomeForm());
  body.querySelectorAll('[data-occ]').forEach((b) => b.addEventListener('click', () => openIncomeOverride(b.dataset.id, b.dataset.occ)));
}

function yearMonthCard(s, mk) {
  const occs = incomeOccurrences(s, mk);
  const total = occs.filter((o) => countsInBudget(o.income)).reduce((a, o) => a + o.amount, 0);
  const isNow = mk === currentMonth();
  return `
    <section class="card year-month ${isNow ? 'now' : ''}">
      <div class="year-month-head">
        <a href="#/calendario?v=mes&m=${mk}"><b>${capitalize(MONTHS[Number(mk.slice(5, 7)) - 1])}</b></a>
        <span class="num small muted">${money(total)}</span>
      </div>
      <div class="year-chips">
        ${occs.length ? occs.map((o) => `
          <button type="button" class="date-chip big ${o.tentative ? 'tentative' : ''} ${o.manual ? 'manual' : ''} ${o.moved ? 'moved' : ''}"
            data-occ="${mk}" data-id="${esc(o.income.id)}" title="${esc(movedReason(o))}">
            <span class="chip-name">${esc(o.income.name)}</span>
            <span class="chip-date">${fmtPayDate(o.date)}${o.tentative ? ' *' : ''}</span>
          </button>`).join('') : '<span class="small muted">Sin ingresos programados</span>'}
      </div>
    </section>`;
}
