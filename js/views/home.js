// Pantalla de inicio: "Hoy puedes gastar", próximos pagos y en qué se va el dinero.
import { getState, addTx, updateSettings } from '../store.js';
import {
  monthSummary, upcomingPayments, sharedBalance, nextIncome,
} from '../calc.js';
import {
  money, monthName, esc, capitalize, parseAmount, today, shortDate,
} from '../format.js';
import { incomeIcon, weekdayShort } from '../schedule.js';
import {
  ICONS, txRow, categoryBars, dueLabel, openSheet, toast, partnerName,
} from '../ui.js';
import { openPayFixed } from './plan.js';
import { openPayCard, openPayLoan } from './debts.js';
import { openTxDetail } from './movs.js';
import {
  backupDue, daysSinceBackup, shareBackup, snoozeBackup, canShareBackup,
} from '../backup.js';

export default function home(el) {
  const s = getState();
  const m = monthSummary(s);
  const hasIncome = s.incomes.length > 0 || m.incomeExtra > 0;
  const name = s.settings.name ? `, ${esc(s.settings.name)}` : '';

  el.innerHTML = `
    <header class="topbar">
      <div>
        <h1>Hola${name}</h1>
        <div class="sub">${capitalize(monthName(m.mk))} · quedan ${m.daysLeft} ${m.daysLeft === 1 ? 'día' : 'días'}</div>
      </div>
      <a class="icon-btn" href="#/ajustes" aria-label="Ajustes">${ICONS.gear}</a>
    </header>

    ${setupCard(s)}
    ${hasIncome ? hero(m) : heroEmpty()}
    ${backupNotice()}
    ${paceNotice(m)}
    ${nextIncomeCard(s)}
    ${upcomingCard(s)}

    <section class="card">
      <h2 class="card-title">¿En qué se va tu dinero? <a href="#/movimientos">Ver todo</a></h2>
      ${categoryBars(m.categories, m.totalOut, 6)}
      ${m.totalOut ? `<div class="muted small" style="margin-top:8px">Total gastado este mes (tu parte): <b class="num">${money(m.totalOut)}</b></div>` : ''}
    </section>

    ${sharedCard(s)}

    <section class="card">
      <h2 class="card-title">Últimos movimientos <a href="#/movimientos">Ver todos</a></h2>
      ${recentList(s)}
    </section>
  `;

  el.querySelectorAll('[data-pay]').forEach((row) => row.addEventListener('click', () => {
    const { pay, id } = row.dataset;
    if (pay === 'fixed') openPayFixed(id);
    if (pay === 'loan') openPayLoan(id);
    if (pay === 'card') openPayCard(id);
  }));
  el.querySelectorAll('[data-tx]').forEach((row) => row.addEventListener('click', () => openTxDetail(row.dataset.tx)));
  el.querySelector('[data-settle]')?.addEventListener('click', openSettle);
  el.querySelector('[data-backup-now]')?.addEventListener('click', async () => {
    if (await shareBackup()) toast('Respaldo listo ✓ Guárdalo fuera del celular');
  });
  el.querySelector('[data-backup-later]')?.addEventListener('click', () => {
    snoozeBackup(1);
    toast('Te lo recuerdo mañana');
  });
  el.querySelector('[data-dismiss-setup]')?.addEventListener('click', () => updateSettings({ setupDismissed: true }));
}

function setupCard(s) {
  const steps = [
    { done: s.incomes.length > 0, label: 'Tus ingresos del mes', href: '#/plan' },
    { done: s.fixed.length > 0, label: 'Tus gastos fijos', href: '#/plan' },
    { done: s.cards.length > 0 || s.loans.length > 0, label: 'Tus tarjetas y préstamos', href: '#/deudas' },
    { done: Number(s.settings.savingsMonthly) > 0, label: 'Cuánto quieres ahorrar', href: '#/plan?s=ahorro' },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  if (doneCount === steps.length || (s.settings.setupDismissed && doneCount >= 1)) return '';
  return `
    <section class="card">
      <h2 class="card-title">Arma tu mes (${doneCount}/${steps.length})
        ${doneCount >= 1 ? '<button class="link-btn" data-dismiss-setup>Ocultar</button>' : ''}</h2>
      <p class="muted small" style="margin:-4px 0 8px">Con estos datos la app calcula cuánto puedes gastar cada día sin pasarte.</p>
      <ul class="steps">
        ${steps.map((st) => `
          <li><a href="${st.href}">
            <span class="check ${st.done ? 'done' : ''}">${st.done ? '✓' : ''}</span>
            <span style="flex:1">${st.label}</span>${ICONS.right.replace('<svg', '<svg width="18" height="18" style="stroke:currentColor;fill:none;stroke-width:2"')}
          </a></li>`).join('')}
      </ul>
    </section>`;
}

function heroEmpty() {
  return `
    <section class="hero">
      <p class="hero-label">Hoy puedes gastar</p>
      <div class="hero-amount">S/ —</div>
      <p class="hero-note">Agrega tus ingresos en <b>Mi plan</b> para calcularlo.</p>
    </section>`;
}

function hero(m) {
  let cls = '';
  let label = 'Hoy puedes gastar';
  let amount = money(Math.max(0, m.todayLeft));
  let note;

  if (m.variableBudget <= 0) {
    cls = 'is-danger';
    label = 'Tu plan no alcanza';
    amount = money(m.variableBudget);
    note = 'Tus pagos fijos, deudas y ahorro superan tus ingresos. Revisa <b>Mi plan</b>.';
  } else if (m.variableLeft <= 0) {
    cls = 'is-danger';
    label = 'Ya usaste todo lo del mes';
    amount = `−${money(Math.abs(m.variableLeft))}`;
    note = 'Cada gasto extra ahora sale de tus pagos o tu ahorro.';
  } else if (m.todayLeft < 0) {
    cls = 'is-warn';
    label = 'Hoy te pasaste por';
    amount = money(Math.abs(m.todayLeft));
    note = `Mañana tendrás un poco menos por día. Te quedan ${money(m.variableLeft)} para ${m.daysLeft - 1} días.`;
  } else {
    note = m.spentToday > 0
      ? `Ya gastaste ${money(m.spentToday)} hoy. Te quedan ${money(m.variableLeft)} para el mes.`
      : `Te quedan ${money(m.variableLeft)} para ${m.daysLeft} ${m.daysLeft === 1 ? 'día' : 'días'}.`;
  }

  const budget = Math.max(1, m.variableBudget);
  const used = Math.min(100, (m.variableSpent / budget) * 100);
  const mark = Math.min(100, (m.expectedByNow / budget) * 100);

  return `
    <section class="hero ${cls}">
      <p class="hero-label">${label}</p>
      <div class="hero-amount num">${amount}</div>
      <p class="hero-note">${note}</p>
      ${m.variableBudget > 0 ? `
        <div class="hero-bar" role="img" aria-label="Gastado ${Math.round(used)}% de tu presupuesto variable">
          <span style="width:${used}%"></span><i style="left:${mark}%"></i>
        </div>
        <div class="hero-meta num"><span>Gastado ${money(m.variableSpent)}</span><span>de ${money(m.variableBudget)}</span></div>` : ''}
    </section>`;
}

function backupNotice() {
  if (!backupDue()) return '';
  const days = daysSinceBackup();
  const when = days == null
    ? 'Aún no has hecho ningún respaldo.'
    : `Tu último respaldo fue hace ${days} días.`;
  const how = canShareBackup()
    ? 'Envíatelo a Drive, a tu correo o a tu propio WhatsApp.'
    : 'Se descargará un archivo: guárdalo en Drive o en tu correo.';
  return `
    <div class="notice"><span>💾</span><div style="flex:1"><b>Toca respaldar tus datos</b>
      ${when} Si formateas o pierdes el celular, el respaldo es lo único que te permite recuperarlos. ${how}
      <div class="btn-row" style="margin-top:10px">
        <button class="btn sm" data-backup-later>Mañana</button>
        <button class="btn sm primary" data-backup-now>Respaldar ahora</button>
      </div></div></div>`;
}

function paceNotice(m) {
  if (m.variableBudget <= 0 || m.variableLeft <= 0 || m.day < 4) return '';
  const diff = m.variableSpent - m.expectedByNow;
  if (diff > m.variableBudget * 0.08) {
    return `<div class="notice"><span>⚠️</span><div><b>Vas más rápido de lo planeado</b>
      A esta altura del mes deberías llevar unos ${money(m.expectedByNow)} y llevas ${money(m.variableSpent)}.
      La rayita de la barra marca dónde deberías estar.</div></div>`;
  }
  if (diff < -m.variableBudget * 0.08) {
    return `<div class="notice ok"><span>👏</span><div><b>Vas por debajo de tu plan</b>
      Llevas ${money(m.expectedByNow - m.variableSpent)} menos de lo esperado. Si sigues así, lo que sobre puede ir a tu deuda o tu ahorro.</div></div>`;
  }
  return '';
}

function nextIncomeCard(s) {
  const n = nextIncome(s);
  if (!n) return '';
  let when;
  if (n.days === 0) when = 'hoy';
  else if (n.days === 1) when = 'mañana';
  else when = `en ${n.days} días`;
  return `
    <a class="card next-income" href="#/calendario">
      <div class="row-icon">${incomeIcon(n.income)}</div>
      <div class="row-main">
        <div class="small muted">Próximo ingreso · ${when}</div>
        <div class="row-title">${esc(n.income.name)} · ${weekdayShort(n.date)} ${esc(shortDate(n.date))}${n.tentative ? ' *' : ''}</div>
      </div>
      <div class="row-amount in">+${money(n.amount)}</div>
    </a>`;
}

function upcomingCard(s) {
  const items = upcomingPayments(s).slice(0, 6);
  if (!items.length) return '';
  const icon = { fixed: '📅', loan: '🏦', card: '💳' };
  return `
    <section class="card">
      <h2 class="card-title">Próximos pagos</h2>
      <ul class="rows">
        ${items.map((it) => `
          <li class="row tappable" data-pay="${it.kind}" data-id="${esc(it.id)}">
            <div class="row-icon">${icon[it.kind]}</div>
            <div class="row-main">
              <div class="row-title">${esc(it.name)}</div>
              <div class="row-sub">${dueLabel(it.days, it.overdue)}</div>
            </div>
            <div class="row-end"><div class="row-amount">${money(it.amount)}</div>
              <div class="small muted">Toca para pagar</div></div>
          </li>`).join('')}
      </ul>
    </section>`;
}

function sharedCard(s) {
  const hasShared = s.txs.some((t) => t.shared || t.type === 'settle');
  if (!hasShared) return '';
  const bal = sharedBalance(s);
  const p = esc(partnerName());
  let text;
  if (Math.abs(bal) < 0.01) text = `Están a mano con ${p}.`;
  else if (bal > 0) text = `<b>${p} te debe ${money(bal)}</b>`;
  else text = `<b>Le debes ${money(-bal)} a ${p}</b>`;
  return `
    <section class="card">
      <h2 class="card-title">Gastos compartidos</h2>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>${text}<div class="muted small">Suma de lo que cada uno pagó por el otro.</div></div>
        ${Math.abs(bal) >= 0.01 ? '<button class="btn sm" data-settle>Liquidar</button>' : ''}
      </div>
    </section>`;
}

function recentList(s) {
  const recent = [...s.txs].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 5);
  if (!recent.length) {
    return `<div class="empty"><span class="big">✍️</span>Registra tu primer gasto con el botón <b>+</b>.<br>Mientras más registres, más claro verás a dónde se va tu dinero.</div>`;
  }
  return `<ul class="rows">${recent.map((t) => txRow(t, { showDate: true })).join('')}</ul>`;
}

function openSettle() {
  const bal = sharedBalance(getState());
  const p = esc(partnerName());
  const direction = bal > 0 ? 'in' : 'out';
  openSheet({
    title: 'Liquidar compartidos',
    html: `
      <form>
        <p class="muted" style="margin-top:0">${bal > 0 ? `${p} te paga` : `Tú le pagas a ${p}`}.</p>
        <label class="field"><span>Monto</span>
          <input class="input num" name="amount" inputmode="decimal" value="${Math.abs(bal).toFixed(2)}" required></label>
        <label class="field"><span>Fecha</span>
          <input class="input" type="date" name="date" value="${today()}" required></label>
        <button class="btn primary block">Guardar</button>
      </form>`,
    onMount(sheet, close) {
      sheet.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const amount = parseAmount(f.get('amount'));
        if (amount <= 0) return toast('Ingresa un monto válido');
        addTx({ type: 'settle', amount, date: f.get('date'), direction });
        close();
        toast('Liquidación registrada');
      });
    },
  });
}
