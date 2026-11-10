// Deudas: tarjetas de crédito y préstamos, con fechas, saldos y pagos.
import {
  getState, upsert, remove, findById, addTx,
} from '../store.js';
import {
  cardBalance, cardSpentThisCycle, loanStatus, totalDebt,
} from '../calc.js';
import {
  money, esc, parseAmount, today, dateInMonth, currentMonth, addMonths, shortDate, monthName, capitalize, daysBetween,
} from '../format.js';
import { openSheet, toast, formValues } from '../ui.js';

function nextDate(day) {
  const t = today();
  const d = dateInMonth(currentMonth(), day);
  return d >= t ? d : dateInMonth(addMonths(currentMonth(), 1), day);
}

export default function debts(el) {
  const s = getState();
  const debt = totalDebt(s);
  const monthlyLoans = s.loans.reduce((a, l) => a + (loanStatus(s, l).remaining > 0 ? Number(l.payment) || 0 : 0), 0);

  el.innerHTML = `
    <header class="topbar"><h1>Deudas</h1></header>

    <section class="hero" style="padding-bottom:16px">
      <p class="hero-label">Debes en total</p>
      <div class="hero-amount num">${money(debt.total)}</div>
      <p class="hero-note">Tarjetas ${money(debt.cards)} · Préstamos ${money(debt.loans)}</p>
      ${monthlyLoans ? `<p class="hero-note" style="margin-top:6px">Cuotas de préstamos al mes: <b>${money(monthlyLoans)}</b></p>` : ''}
    </section>

    <div class="section-label">Tarjetas de crédito</div>
    ${s.cards.length ? s.cards.map((c) => cardBlock(s, c)).join('') : `
      <section class="card empty">Agrega tus tarjetas para saber cuánto debes en cada una y cuándo pagarlas.</section>`}
    <button class="btn block" data-add-card>+ Agregar tarjeta</button>

    <div class="notice" style="margin-top:14px"><span>💡</span><div><b>Comprar con tarjeta es gastar</b>
      Cuando registras una compra con tarjeta, ya se descuenta de tu presupuesto del día.
      Pagar la tarjeta después no es un gasto nuevo: solo baja tu deuda.</div></div>

    <div class="section-label">Préstamos</div>
    ${s.loans.length ? s.loans.map((l) => loanBlock(s, l)).join('') : `
      <section class="card empty">Agrega tus préstamos (personales, vehiculares, con familiares…) con su cuota mensual.</section>`}
    <button class="btn block" data-add-loan>+ Agregar préstamo</button>
  `;

  el.querySelector('[data-add-card]').addEventListener('click', () => openCardForm());
  el.querySelector('[data-add-loan]').addEventListener('click', () => openLoanForm());
  el.querySelectorAll('[data-pay-card]').forEach((b) => b.addEventListener('click', () => openPayCard(b.dataset.payCard)));
  el.querySelectorAll('[data-edit-card]').forEach((b) => b.addEventListener('click', () => openCardForm(b.dataset.editCard)));
  el.querySelectorAll('[data-pay-loan]').forEach((b) => b.addEventListener('click', () => openPayLoan(b.dataset.payLoan)));
  el.querySelectorAll('[data-edit-loan]').forEach((b) => b.addEventListener('click', () => openLoanForm(b.dataset.editLoan)));
}

function cardBlock(s, c) {
  const bal = cardBalance(s, c);
  const spent = cardSpentThisCycle(s, c);
  const limit = Number(c.limit) || 0;
  const use = limit ? Math.min(100, (Math.max(0, bal) / limit) * 100) : 0;
  const due = nextDate(c.dueDay);
  const close = nextDate(c.closingDay);
  const dueDays = daysBetween(today(), due);
  let useCls = '';
  if (use >= 70) useCls = 'danger';
  else if (use >= 30) useCls = 'warn';
  return `
    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div><div class="row-title">💳 ${esc(c.name)}</div>
          <div class="small muted">Cierra el ${esc(shortDate(close))} · Pagar hasta el ${esc(shortDate(due))}</div></div>
        <div style="text-align:right"><div class="stat-value">${money(bal)}</div><div class="small muted">deuda</div></div>
      </div>
      ${limit ? `
        <div class="bar" style="margin:12px 0 6px"><span style="width:${use}%;${useCls ? `background:var(--${useCls})` : ''}"></span></div>
        <div class="small muted" style="display:flex;justify-content:space-between">
          <span>Usas ${Math.round(use)}% de tu línea</span><span>Línea ${money(limit)}</span></div>` : ''}
      <div class="small" style="margin-top:10px">Este mes compraste <b>${money(spent)}</b> con esta tarjeta.
        ${Number(c.planMonthly) > 0 ? `Reservas <b>${money(c.planMonthly)}</b>/mes para bajar la deuda.` : ''}</div>
      ${bal > 0 && dueDays <= 5 ? `<div class="notice danger" style="margin:10px 0 0"><span>⏰</span><div>${dueDays === 0 ? 'Vence hoy' : `Vence en ${dueDays} ${dueDays === 1 ? 'día' : 'días'}`}. Paga al menos el mínimo para evitar intereses moratorios; lo ideal es el total.</div></div>` : ''}
      ${use >= 70 ? '<div class="small danger-text" style="margin-top:6px">Usar más del 70% de la línea encarece tu deuda y afecta tu historial.</div>' : ''}
      <div class="btn-row">
        <button class="btn sm" data-edit-card="${esc(c.id)}">Editar</button>
        <button class="btn sm primary" data-pay-card="${esc(c.id)}">Registrar pago</button>
      </div>
    </section>`;
}

function loanBlock(s, l) {
  const st = loanStatus(s, l);
  const total = st.paidCount + st.remaining;
  const pct = total ? (st.paidCount / total) * 100 : 0;
  return `
    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div><div class="row-title">🏦 ${esc(l.name)}</div>
          <div class="small muted">Cuota ${money(l.payment)} · día ${l.dueDay}</div></div>
        <div style="text-align:right">${st.done ? '<span class="pill ok">¡Pagado!</span>' : `<div class="stat-value">${st.remaining}</div><div class="small muted">cuotas faltan</div>`}</div>
      </div>
      ${total ? `<div class="bar" style="margin:12px 0 6px"><span style="width:${pct}%"></span></div>` : ''}
      ${st.done ? '' : `<div class="small muted">Faltan aprox. ${money(st.remainingAmount)} · terminas en ${esc(capitalize(monthName(st.endMonth)))}</div>`}
      <div class="btn-row">
        <button class="btn sm" data-edit-loan="${esc(l.id)}">Editar</button>
        ${st.done ? '' : (st.paidThisMonth
    ? '<span class="pill ok" style="align-self:center;text-align:center;padding:8px">Cuota de este mes pagada ✓</span>'
    : `<button class="btn sm primary" data-pay-loan="${esc(l.id)}">Pagar cuota</button>`)}
      </div>
    </section>`;
}

// ---------- Tarjetas ----------

function openCardForm(id) {
  const c = id ? findById('cards', id) : null;
  openSheet({
    title: c ? 'Editar tarjeta' : 'Nueva tarjeta',
    html: `
      <form>
        <label class="field"><span>Nombre</span>
          <input class="input" name="name" required maxlength="30" placeholder="Ej: Visa BCP, Interbank Oro" value="${esc(c?.name || '')}"></label>
        <div class="field-row">
          <label class="field"><span>Deuda actual</span>
            <input class="input num" name="startBalance" inputmode="decimal" value="${c?.startBalance ?? ''}" placeholder="0.00">
            <small>Lo que debes hoy</small></label>
          <label class="field"><span>Línea de crédito</span>
            <input class="input num" name="limit" inputmode="decimal" value="${c?.limit ?? ''}" placeholder="0.00"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Día de cierre</span>
            <input class="input" name="closingDay" type="number" min="1" max="31" required value="${c?.closingDay ?? 20}"></label>
          <label class="field"><span>Día de pago</span>
            <input class="input" name="dueDay" type="number" min="1" max="31" required value="${c?.dueDay ?? 5}"></label>
        </div>
        <label class="field"><span>Pago extra mensual para bajar la deuda</span>
          <input class="input num" name="planMonthly" inputmode="decimal" value="${c?.planMonthly ?? ''}" placeholder="0.00">
          <small>Lo que separas cada mes, además de tus compras nuevas, para ir bajando la deuda que ya tienes. Se reserva de tu plan.</small></label>
        ${c ? '<small class="muted" style="display:block;margin:-6px 0 12px">Si cambias "Deuda actual", recalcula con lo que debías cuando agregaste la tarjeta.</small>' : ''}
        <div class="btn-row">
          ${c ? '<button type="button" class="btn danger" data-del>Eliminar</button>' : ''}
          <button class="btn primary">Guardar</button>
        </div>
      </form>`,
    onMount(sheet, close) {
      sheet.querySelector('[data-del]')?.addEventListener('click', () => {
        if (!confirm('¿Eliminar esta tarjeta? Sus movimientos se conservan.')) return;
        remove('cards', c.id); close();
      });
      sheet.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(e.target);
        upsert('cards', {
          id: c?.id,
          name: v.name.trim(),
          startBalance: parseAmount(v.startBalance),
          limit: parseAmount(v.limit),
          closingDay: clampDay(v.closingDay),
          dueDay: clampDay(v.dueDay),
          planMonthly: parseAmount(v.planMonthly),
        });
        close();
        toast('Tarjeta guardada');
      });
    },
  });
}

export function openPayCard(id) {
  const s = getState();
  const c = findById('cards', id);
  if (!c) return;
  const bal = cardBalance(s, c);
  openSheet({
    title: `Pago a ${c.name}`,
    html: `
      <form>
        <p class="muted" style="margin-top:0">Deuda actual: <b>${money(bal)}</b>. Pagar el total evita intereses; el mínimo solo evita la mora.</p>
        <label class="field"><span>Monto pagado</span>
          <input class="input num" name="amount" inputmode="decimal" value="${bal > 0 ? bal.toFixed(2) : ''}" required data-noautofocus="1"></label>
        <label class="field"><span>Fecha</span>
          <input class="input" type="date" name="date" value="${today()}" max="${today()}" required></label>
        <button class="btn primary block">Registrar pago</button>
      </form>`,
    onMount(sheet, close) {
      sheet.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(e.target);
        const amount = parseAmount(v.amount);
        if (amount <= 0) return toast('Ingresa un monto válido');
        addTx({ type: 'cardpay', refId: c.id, amount, date: v.date, method: 'cash' });
        close();
        toast(`Pago registrado. Te queda ${money(Math.max(0, bal - amount))} en ${c.name}`);
      });
    },
  });
}

// ---------- Préstamos ----------

function openLoanForm(id) {
  const l = id ? findById('loans', id) : null;
  const st = l ? loanStatus(getState(), l) : null;
  openSheet({
    title: l ? 'Editar préstamo' : 'Nuevo préstamo',
    html: `
      <form>
        <label class="field"><span>Nombre</span>
          <input class="input" name="name" required maxlength="30" placeholder="Ej: Préstamo personal, Auto" value="${esc(l?.name || '')}"></label>
        <div class="field-row">
          <label class="field"><span>Cuota mensual</span>
            <input class="input num" name="payment" inputmode="decimal" required value="${l?.payment ?? ''}"></label>
          <label class="field"><span>Día de pago</span>
            <input class="input" name="dueDay" type="number" min="1" max="31" required value="${l?.dueDay ?? 15}"></label>
        </div>
        <label class="field"><span>${l ? 'Cuotas que faltaban al agregarlo' : 'Cuotas que te faltan pagar'}</span>
          <input class="input" name="installments" type="number" min="1" max="600" required value="${l?.installments ?? ''}">
          ${st ? `<small>Has registrado ${st.paidCount} pago(s) en la app; faltan ${st.remaining}.</small>` : '<small>Míralo en tu cronograma de pagos.</small>'}</label>
        <div class="btn-row">
          ${l ? '<button type="button" class="btn danger" data-del>Eliminar</button>' : ''}
          <button class="btn primary">Guardar</button>
        </div>
      </form>`,
    onMount(sheet, close) {
      sheet.querySelector('[data-del]')?.addEventListener('click', () => {
        if (!confirm('¿Eliminar este préstamo? Sus pagos se conservan.')) return;
        remove('loans', l.id); close();
      });
      sheet.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(e.target);
        const payment = parseAmount(v.payment);
        if (payment <= 0) return toast('Ingresa una cuota válida');
        upsert('loans', {
          id: l?.id,
          name: v.name.trim(),
          payment,
          dueDay: clampDay(v.dueDay),
          installments: Math.max(1, parseInt(v.installments, 10) || 1),
          startDate: l?.startDate || today(),
        });
        close();
        toast('Préstamo guardado');
      });
    },
  });
}

export function openPayLoan(id) {
  const l = findById('loans', id);
  if (!l) return;
  openSheet({
    title: `Cuota: ${l.name}`,
    html: `
      <form>
        <label class="field"><span>Monto pagado</span>
          <input class="input num" name="amount" inputmode="decimal" value="${l.payment}" required data-noautofocus="1"></label>
        <label class="field"><span>Fecha</span>
          <input class="input" type="date" name="date" value="${today()}" max="${today()}" required></label>
        <button class="btn primary block">Registrar cuota pagada</button>
      </form>`,
    onMount(sheet, close) {
      sheet.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(e.target);
        const amount = parseAmount(v.amount);
        if (amount <= 0) return toast('Ingresa un monto válido');
        addTx({ type: 'loanpay', refId: l.id, amount, date: v.date, method: 'cash' });
        close();
        const st = loanStatus(getState(), l);
        toast(st.done ? `🎉 ¡Terminaste de pagar ${l.name}!` : `Cuota registrada. Te faltan ${st.remaining}.`);
      });
    },
  });
}

function clampDay(d) {
  return Math.min(31, Math.max(1, parseInt(d, 10) || 1));
}
