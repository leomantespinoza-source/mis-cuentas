// Formularios de ingresos: el ingreso en sí (tipo, día, meses) y el ajuste de un mes concreto.
import { findById, upsert, remove } from '../store.js';
import {
  esc, money, parseAmount, monthName, capitalize, dayLabel,
} from '../format.js';
import {
  INCOME_KINDS, RULES, ALL_MONTHS, incomeMonths, incomeOccurrence, movedReason, weekdayShort,
} from '../schedule.js';
import { openSheet, toast, formValues } from '../ui.js';

const MONTH_LETTERS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

export function fmtPayDate(iso) {
  return `${weekdayShort(iso)} ${Number(iso.slice(8, 10))}`;
}

// ---------- Crear / editar ingreso ----------

export function openIncomeForm(id) {
  const i = id ? findById('incomes', id) : null;
  const f = {
    kind: i?.kind || 'quincena',
    months: [...incomeMonths(i || {})],
    counts: i ? i.counts !== false : true,
  };
  if (!i) Object.assign(f, { months: [...INCOME_KINDS.quincena.months] });

  openSheet({
    title: i ? 'Editar ingreso' : 'Nuevo ingreso',
    html: `
      <form>
        <div class="field"><span>Tipo</span>
          <div class="chips" id="kinds" style="flex-wrap:wrap">
            ${Object.entries(INCOME_KINDS).map(([k, v]) => `
              <button type="button" class="chip" data-kind="${k}" aria-pressed="${k === f.kind}">${v.icon} ${v.label}</button>`).join('')}
          </div>
        </div>
        <label class="field"><span>Nombre</span>
          <input class="input" name="name" required maxlength="40" value="${esc(i?.name || INCOME_KINDS[f.kind].label)}" data-noautofocus="1"></label>
        <div class="field-row">
          <label class="field"><span>Monto neto</span>
            <input class="input num" name="amount" inputmode="decimal" required value="${i?.amount ?? ''}">
            <small>Lo que te llega a la cuenta</small></label>
          <label class="field"><span>Día de pago</span>
            <input class="input" name="day" type="number" min="1" max="31" required value="${i?.day ?? INCOME_KINDS[f.kind].day}">
            <small>El día "oficial"</small></label>
        </div>
        <label class="field"><span>Si cae sábado, domingo o feriado</span>
          <select class="input" name="rule">
            ${Object.entries(RULES).map(([k, v]) => `<option value="${k}" ${k === (i?.rule || 'nearest') ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <small>Igual puedes cambiar la fecha de cualquier mes en el Calendario.</small></label>
        <div class="field"><span>¿En qué meses llega?</span>
          <div class="month-picks" id="months">
            ${ALL_MONTHS.map((m) => `<button type="button" class="chip" data-month="${m}" aria-pressed="${f.months.includes(m)}">${MONTH_LETTERS[m - 1]}</button>`).join('')}
          </div>
        </div>
        <label class="switch"><span><b>Cuenta para mi presupuesto</b><br>
          <span class="small muted" id="counts-hint"></span></span>
          <input type="checkbox" name="counts" ${f.counts ? 'checked' : ''}></label>
        <div class="btn-row">
          ${i ? '<button type="button" class="btn danger" data-del>Eliminar</button>' : ''}
          <button class="btn primary">Guardar</button>
        </div>
      </form>`,
    onMount(sheet, close) {
      const form = sheet.querySelector('form');
      const kindsEl = sheet.querySelector('#kinds');
      const monthsEl = sheet.querySelector('#months');
      const hint = sheet.querySelector('#counts-hint');

      const renderHint = () => {
        hint.textContent = f.kind === 'cts'
          ? 'La CTS se deposita en tu cuenta CTS y no se gasta libremente; déjalo apagado salvo que la retires.'
          : 'Si lo apagas, se muestra en el calendario pero no suma a lo que puedes gastar.';
      };
      const renderMonths = () => monthsEl.querySelectorAll('[data-month]')
        .forEach((b) => b.setAttribute('aria-pressed', String(f.months.includes(Number(b.dataset.month)))));
      renderHint();

      kindsEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-kind]');
        if (!b) return;
        const prev = INCOME_KINDS[f.kind];
        f.kind = b.dataset.kind;
        const k = INCOME_KINDS[f.kind];
        kindsEl.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (!form.name.value.trim() || form.name.value === prev.label) form.name.value = k.label;
        if (!i) {
          form.day.value = k.day;
          f.months = [...k.months];
          form.counts.checked = k.counts;
          renderMonths();
        }
        renderHint();
      });
      monthsEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-month]');
        if (!b) return;
        const m = Number(b.dataset.month);
        f.months = f.months.includes(m) ? f.months.filter((x) => x !== m) : [...f.months, m].sort((a, c) => a - c);
        renderMonths();
      });
      sheet.querySelector('[data-del]')?.addEventListener('click', () => {
        if (!confirm('¿Eliminar este ingreso y sus fechas ajustadas?')) return;
        remove('incomes', i.id); close();
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(form);
        const amount = parseAmount(v.amount);
        if (amount <= 0) return toast('Ingresa un monto válido');
        if (!f.months.length) return toast('Elige al menos un mes');
        upsert('incomes', {
          id: i?.id,
          kind: f.kind,
          name: v.name.trim(),
          amount,
          day: Math.min(31, Math.max(1, parseInt(v.day, 10) || 1)),
          rule: v.rule,
          months: f.months,
          counts: form.counts.checked,
          overrides: i?.overrides || {},
        });
        close();
        toast('Ingreso guardado');
      });
    },
  });
}

// ---------- Ajustar un mes concreto ----------

export function openIncomeOverride(id, mk) {
  const i = findById('incomes', id);
  if (!i) return;
  const ov = i.overrides?.[mk] || {};
  // Ocurrencia "automática" (sin ajuste manual), para comparar.
  const base = incomeOccurrence({ ...i, overrides: {} }, mk);
  if (!base) {
    toast(`${i.name} no llega en ${monthName(mk)}. Cámbialo en sus meses.`);
    return;
  }
  const current = { date: ov.date || base.date, amount: ov.amount ?? i.amount };
  const reason = movedReason(base);

  openSheet({
    title: `${i.name} · ${capitalize(monthName(mk))}`,
    html: `
      <form>
        <p class="muted small" style="margin-top:0">
          Fecha automática: <b>${esc(dayLabel(base.date))}</b>${reason ? ` (${esc(reason)})` : ''}.</p>
        <label class="field"><span>Fecha de pago este mes</span>
          <input class="input" type="date" name="date" value="${current.date}" required data-noautofocus="1"></label>
        <label class="field"><span>Monto este mes</span>
          <input class="input num" name="amount" inputmode="decimal" value="${current.amount}" required>
          <small>Monto normal: ${money(i.amount)}</small></label>
        <label class="switch"><span><b>Fecha por confirmar (*)</b><br><span class="small muted">Se marca con * hasta que la confirmes.</span></span>
          <input type="checkbox" name="tentative" ${ov.tentative ? 'checked' : ''}></label>
        <label class="switch"><span><b>Este mes no hay este pago</b></span>
          <input type="checkbox" name="skip" ${ov.skip ? 'checked' : ''}></label>
        <div class="btn-row">
          <button type="button" class="btn" data-reset>Usar automático</button>
          <button class="btn primary">Guardar</button>
        </div>
      </form>`,
    onMount(sheet, close) {
      const form = sheet.querySelector('form');
      const save = (next) => {
        const overrides = { ...(i.overrides || {}) };
        if (next) overrides[mk] = next;
        else delete overrides[mk];
        upsert('incomes', { id: i.id, overrides });
      };
      sheet.querySelector('[data-reset]').addEventListener('click', () => {
        save(null);
        close();
        toast(`${i.name}: fecha automática (${fmtPayDate(base.date)})`);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(form);
        const amount = parseAmount(v.amount);
        const next = {};
        if (v.date && v.date !== base.date) next.date = v.date;
        if (amount !== Number(i.amount)) next.amount = amount;
        if (form.tentative.checked) next.tentative = true;
        if (form.skip.checked) next.skip = true;
        save(Object.keys(next).length ? next : null);
        close();
        toast(form.skip.checked ? `${i.name}: sin pago este mes` : `${i.name}: ${fmtPayDate(v.date)} ✓`);
      });
    },
  });
}
