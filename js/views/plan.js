// Mi plan: ingresos, gastos fijos y ahorro → cuánto queda libre para el día a día.
import {
  getState, upsert, remove, findById, addTx, removeTx, updateSettings,
} from '../store.js';
import { monthSummary } from '../calc.js';
import {
  money, monthName, esc, capitalize, parseAmount, today, daysBetween,
} from '../format.js';
import {
  openSheet, toast, formValues, catInfo, shareFieldsHTML, bindShareFields,
} from '../ui.js';
import {
  incomeOccurrence, incomeIcon, incomeMonths, countsInBudget,
} from '../schedule.js';
import { openIncomeForm, openIncomeOverride, fmtPayDate } from './incomes.js';

const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

function incomeRow(i, mk) {
  const occ = incomeOccurrence(i, mk);
  const months = incomeMonths(i);
  const when = months.length === 12 ? 'Todos los meses' : months.map((x) => MONTH_SHORT[x - 1]).join(', ');
  const chip = occ
    ? `<button type="button" class="date-chip ${occ.tentative ? 'tentative' : ''} ${occ.manual ? 'manual' : ''}" data-occ="${mk}">
        ${fmtPayDate(occ.date)}${occ.tentative ? ' *' : ''}</button>`
    : '<span class="small muted">No llega este mes</span>';
  return `
    <li class="row tappable" data-income="${esc(i.id)}">
      <div class="row-icon">${incomeIcon(i)}</div>
      <div class="row-main"><div class="row-title">${esc(i.name)}</div>
        <div class="row-sub">${esc(when)}${countsInBudget(i) ? '' : ' · No suma al presupuesto'}</div></div>
      <div class="row-end"><div class="row-amount in">${money(occ ? occ.amount : i.amount)}</div>${chip}</div>
    </li>`;
}

export default function plan(el, params) {
  const s = getState();
  const m = monthSummary(s);
  const t = today();

  el.innerHTML = `
    <header class="topbar">
      <div><h1>Mi plan</h1><div class="sub">${capitalize(monthName(m.mk))}</div></div>
    </header>

    <section class="card formula">
      <h2 class="card-title">Así se reparte tu mes</h2>
      <div class="line"><span>💰 Ingresos</span><b class="num ok-text">${money(m.income)}</b></div>
      <div class="line"><span>📅 Gastos fijos</span><span class="num">−${money(m.fixedTotal)}</span></div>
      <div class="line"><span>🏦 Cuotas de préstamos</span><span class="num">−${money(m.loansTotal)}</span></div>
      ${m.cardsTotal ? `<div class="line"><span>💳 Pago extra a tarjetas</span><span class="num">−${money(m.cardsTotal)}</span></div>` : ''}
      <div class="line"><span>🐷 Ahorro</span><span class="num">−${money(m.savings)}</span></div>
      <div class="line total"><span>Libre para el día a día</span>
        <span class="num ${m.variableBudget < 0 ? 'danger-text' : ''}">${money(m.variableBudget)}</span></div>
      <div class="muted small" style="margin-top:6px">Esto es lo que tienes para comida, transporte, salidas y todo lo que no es fijo.
        ${m.variableBudget > 0 ? `Equivale a unos <b>${money(m.variableBudget / m.dim)}</b> por día.` : ''}</div>
    </section>

    ${m.variableBudget < 0 && m.income > 0 ? `
      <div class="notice danger"><span>🚨</span><div><b>Tus compromisos superan tus ingresos por ${money(-m.variableBudget)}</b>
        Esto explica la sensación de estar ahogado: el dinero se acaba antes de empezar el mes. Revisa qué fijos puedes bajar o cancelar,
        y en Deudas mira qué préstamo o tarjeta termina antes.</div></div>` : ''}

    <div class="section-label">Tus ingresos</div>
    <section class="card">
      ${s.incomes.length ? `<ul class="rows">${s.incomes.map((i) => incomeRow(i, m.mk)).join('')}</ul>
        <div class="muted small" style="margin-top:8px">Toca la fecha para cambiarla solo este mes; toca el nombre para editar el ingreso.</div>`
    : '<div class="empty">Agrega tu quincena, tu pago de fin de mes y extras como gratificación o CTS.</div>'}
      <div class="btn-row" style="margin-top:10px">
        <button class="btn sm" data-add-income>+ Ingreso</button>
        <a class="btn sm" href="#/nuevo?type=income">+ Ingreso extra</a>
      </div>
      <div class="btn-row" style="margin-top:10px">
        <a class="btn sm" href="#/calendario">📅 Calendario</a>
        <a class="btn sm" href="#/dinero">💰 Mi dinero</a>
      </div>
    </section>

    <div class="section-label">Gastos fijos</div>
    <section class="card">
      ${m.fixedItems.length ? `<ul class="rows">${m.fixedItems.map((fi) => {
    const f = fi.item;
    const c = catInfo(f.categoryId);
    let pill;
    if (fi.paidTx) pill = '<span class="pill ok">Pagado</span>';
    else if (fi.dueDate < t) pill = '<span class="pill danger">Vencido</span>';
    else if (daysBetween(t, fi.dueDate) <= 3) pill = '<span class="pill warn">Pronto</span>';
    else pill = '<span class="pill">Pendiente</span>';
    return `
        <li class="row tappable" data-fixed="${esc(f.id)}">
          <div class="row-icon">${c.icon}</div>
          <div class="row-main"><div class="row-title">${esc(f.name)}</div>
            <div class="row-sub">Día ${f.day}${f.shared ? ` · Compartido (tu parte ${f.myPct}%)` : ''}</div></div>
          <div class="row-end"><div class="row-amount">${money(fi.paidTx ? fi.paidTx.amount : f.amount)}</div>${pill}</div>
        </li>`;
  }).join('')}</ul>
        <div class="muted small" style="margin-top:8px">Pagado ${money(m.fixedPaid)} de ${money(m.fixedTotal)} (tu parte). Toca uno para marcarlo como pagado.</div>`
    : '<div class="empty">Alquiler, luz, agua, internet, celular, colegio, gimnasio, suscripciones… todo lo que pagas cada mes.</div>'}
      <button class="btn sm" style="margin-top:10px" data-add-fixed>+ Gasto fijo</button>
    </section>

    <div class="section-label" id="ahorro">Ahorro mensual</div>
    <section class="card">
      <form id="savings-form">
        <p class="muted small" style="margin-top:0">Lo que separas apenas cobras, antes de gastar. Aunque sea poco, sirve para armar un fondo
          para emergencias y no volver a endeudarte cuando pase algo inesperado.
          ${m.income > 0 ? `Una referencia común es empezar con el 5–10% de tus ingresos (${money(m.income * 0.05)}–${money(m.income * 0.1)}).` : ''}</p>
        <div style="display:flex;gap:10px">
          <input class="input num" name="savings" inputmode="decimal" placeholder="0.00" value="${s.settings.savingsMonthly || ''}" aria-label="Ahorro mensual" data-noautofocus="1">
          <button class="btn primary">Guardar</button>
        </div>
      </form>
    </section>
  `;

  el.querySelector('[data-add-income]').addEventListener('click', () => openIncomeForm());
  el.querySelector('[data-add-fixed]').addEventListener('click', () => openFixedForm());
  el.querySelectorAll('[data-income]').forEach((r) => r.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-occ]');
    if (chip) openIncomeOverride(r.dataset.income, chip.dataset.occ);
    else openIncomeForm(r.dataset.income);
  }));
  el.querySelectorAll('[data-fixed]').forEach((r) => r.addEventListener('click', () => openFixedActions(r.dataset.fixed)));
  el.querySelector('#savings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    updateSettings({ savingsMonthly: parseAmount(e.target.savings.value) });
    toast('Meta de ahorro guardada');
  });

  if (params.s === 'ahorro') setTimeout(() => el.querySelector('#ahorro').scrollIntoView({ behavior: 'smooth' }), 50);
}

// ---------- Gastos fijos ----------

function openFixedActions(id) {
  const f = findById('fixed', id);
  const m = monthSummary(getState());
  const fi = m.fixedItems.find((x) => x.item.id === id);
  if (!f || !fi) return;
  if (!fi.paidTx) { openPayFixed(id); return; }
  openSheet({
    title: f.name,
    html: `
      <p class="muted" style="margin-top:0">Pagado este mes: <b>${money(fi.paidTx.amount)}</b> el ${esc(fi.paidTx.date)}.</p>
      <div class="btn-row" style="flex-direction:column">
        <button class="btn block" data-undo>Desmarcar pago de este mes</button>
        <button class="btn block" data-edit>Editar gasto fijo</button>
      </div>`,
    onMount(sheet, close) {
      sheet.querySelector('[data-undo]').addEventListener('click', () => {
        removeTx(fi.paidTx.id); close(); toast('Pago desmarcado');
      });
      sheet.querySelector('[data-edit]').addEventListener('click', () => openFixedForm(id));
    },
  });
}

export function openPayFixed(id) {
  const s = getState();
  const f = findById('fixed', id);
  if (!f) return;
  // Parte del valor por defecto del gasto fijo, pero se puede cambiar solo para este mes.
  const st = { shared: !!f.shared, myPct: f.myPct ?? s.settings.defaultSharedPct ?? 50, paidBy: 'me' };
  openSheet({
    title: `Pagar: ${f.name}`,
    html: `
      <form>
        <label class="field"><span>Monto pagado</span>
          <input class="input num" name="amount" inputmode="decimal" value="${f.amount}" required data-noautofocus="1">
          <small>Si este mes vino distinto (ej. la luz), corrígelo aquí.</small></label>
        ${shareFieldsHTML(st, { title: 'Este mes, ¿de quién es?' })}
        <label class="field" data-method-field><span>¿Con qué pagaste?</span>
          <select class="input" name="method">
            <option value="cash">💵 Efectivo / débito</option>
            ${s.cards.map((c) => `<option value="${esc(c.id)}">💳 Tarjeta ${esc(c.name)}</option>`).join('')}
          </select></label>
        <label class="field"><span>Fecha</span>
          <input class="input" type="date" name="date" value="${today()}" max="${today()}" required></label>
        <div class="btn-row">
          <button type="button" class="btn" data-edit>Editar fijo</button>
          <button class="btn primary">Marcar pagado</button>
        </div>
      </form>`,
    onMount(sheet, close) {
      const form = sheet.querySelector('form');
      const methodField = sheet.querySelector('[data-method-field]');
      const syncMethod = () => methodField.classList.toggle('hidden', st.shared && st.paidBy === 'partner');
      const share = bindShareFields(sheet, st, { getAmount: () => parseAmount(form.amount.value), onChange: syncMethod });
      form.amount.addEventListener('input', share.refresh);
      syncMethod();
      sheet.querySelector('[data-edit]').addEventListener('click', () => openFixedForm(id));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(form);
        const amount = parseAmount(v.amount);
        if (amount <= 0) return toast('Ingresa un monto válido');
        addTx({
          type: 'fixed', refId: f.id, amount, categoryId: f.categoryId, date: v.date,
          method: v.method, shared: st.shared, myPct: st.myPct,
          paidBy: st.shared ? st.paidBy : 'me', note: f.name,
        });
        close();
        toast(`${f.name}: pagado ✓`);
      });
    },
  });
}

function openFixedForm(id) {
  const s = getState();
  const f = id ? findById('fixed', id) : null;
  const st = { shared: !!f?.shared, myPct: f?.myPct ?? s.settings.defaultSharedPct ?? 50, paidBy: 'me' };
  openSheet({
    title: f ? 'Editar gasto fijo' : 'Nuevo gasto fijo',
    html: `
      <form>
        <label class="field"><span>Nombre</span>
          <input class="input" name="name" required maxlength="40" placeholder="Ej: Alquiler, Luz, Netflix" value="${esc(f?.name || '')}"></label>
        <div class="field-row">
          <label class="field"><span>Monto aprox.</span>
            <input class="input num" name="amount" inputmode="decimal" required value="${f?.amount ?? ''}"></label>
          <label class="field"><span>Día de pago</span>
            <input class="input" name="day" type="number" min="1" max="31" required value="${f?.day ?? 1}"></label>
        </div>
        <label class="field"><span>Categoría</span>
          <select class="input" name="categoryId">
            ${s.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === (f?.categoryId || 'vivienda') ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}
          </select></label>
        ${shareFieldsHTML(st, { withPaidBy: false, title: 'Normalmente, ¿de quién es?' })}
        <small class="muted" style="display:block;margin:-4px 0 12px">Es lo que vendrá marcado cada mes; al pagarlo puedes cambiarlo solo para ese mes.</small>
        <div class="btn-row">
          ${f ? '<button type="button" class="btn danger" data-del>Eliminar</button>' : ''}
          <button class="btn primary">Guardar</button>
        </div>
      </form>`,
    onMount(sheet, close) {
      const form = sheet.querySelector('form');
      const share = bindShareFields(sheet, st, { getAmount: () => parseAmount(form.amount.value) });
      form.amount.addEventListener('input', share.refresh);
      sheet.querySelector('[data-del]')?.addEventListener('click', () => {
        if (!confirm('¿Eliminar este gasto fijo? Los pagos ya registrados se conservan.')) return;
        remove('fixed', f.id); close();
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(form);
        const amount = parseAmount(v.amount);
        if (amount <= 0) return toast('Ingresa un monto válido');
        upsert('fixed', {
          id: f?.id, name: v.name.trim(), amount, day: clampDay(v.day), categoryId: v.categoryId,
          shared: st.shared, myPct: st.myPct,
        });
        close();
        toast('Gasto fijo guardado');
      });
    },
  });
}

function clampDay(d) {
  return Math.min(31, Math.max(1, parseInt(d, 10) || 1));
}
