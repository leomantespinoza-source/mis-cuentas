// Componentes compartidos: hoja inferior, avisos, filas de movimientos, barras.
import { getState, findById } from './store.js';
import { myShare } from './calc.js';
import { esc, money, shortDate } from './format.js';

// ---------- Hoja inferior ----------

let openClose = null;

export function openSheet({ title, html, onMount }) {
  if (openClose) openClose();
  const root = document.getElementById('sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div>
      <div class="sheet-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Cerrar">${ICONS.close}</button>
      </div>
      <div class="sheet-body">${html}</div>
    </div>`;
  const sheet = root.querySelector('.sheet');
  const close = () => {
    root.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    openClose = null;
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  openClose = close;
  onMount?.(sheet, close);
  const first = sheet.querySelector('input:not([type=hidden]), select, textarea');
  if (first && !first.dataset.noautofocus) setTimeout(() => first.focus(), 250);
  return close;
}

export function closeSheet() {
  openClose?.();
}

// ---------- Aviso flotante ----------

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- Íconos ----------

const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>'),
  right: svg('<path d="M9 6l6 6-6 6"/>'),
  back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
};

// ---------- Datos de presentación ----------

export function catInfo(id) {
  if (id === '__loans') return { icon: '🏦', name: 'Cuotas de préstamos' };
  const c = getState().categories.find((x) => x.id === id);
  return c || { icon: '📦', name: 'Otros' };
}

export function methodLabel(method) {
  const s = getState();
  if (!method || method === 'cash') return 'Efectivo / débito';
  if (method === 'partner') return `Pagó ${s.settings.partnerName}`;
  const card = findById('cards', method);
  return card ? `Tarjeta ${card.name}` : 'Tarjeta';
}

export function partnerName() {
  return getState().settings.partnerName || 'Pareja';
}

// ---------- Fila de movimiento ----------

export function txView(tx) {
  const s = getState();
  let icon = '📦';
  let title = tx.note;
  let sub = '';
  let sign = '−';
  let cls = '';
  let amount = tx.amount;

  switch (tx.type) {
    case 'expense': {
      const c = catInfo(tx.categoryId);
      icon = c.icon;
      title = tx.note || c.name;
      sub = [tx.note ? c.name : null, methodLabel(tx.method)].filter(Boolean).join(' · ');
      break;
    }
    case 'fixed': {
      const f = findById('fixed', tx.refId);
      const c = catInfo(tx.categoryId);
      icon = c.icon;
      title = f?.name || tx.note || 'Gasto fijo';
      sub = `Gasto fijo · ${methodLabel(tx.method)}`;
      break;
    }
    case 'income':
      icon = '💰'; title = tx.note || 'Ingreso extra'; sub = 'Ingreso'; sign = '+'; cls = 'in';
      break;
    case 'cardpay': {
      const c = findById('cards', tx.refId);
      icon = '💳'; title = `Pago tarjeta ${c?.name || ''}`.trim(); sub = 'Baja tu deuda (no es gasto nuevo)';
      sign = ''; break;
    }
    case 'loanpay': {
      const l = findById('loans', tx.refId);
      icon = '🏦'; title = `Cuota ${l?.name || 'préstamo'}`; sub = 'Pago de préstamo';
      break;
    }
    case 'settle':
      icon = '🤝';
      title = tx.direction === 'in' ? `${partnerName()} te pagó` : `Le pagaste a ${partnerName()}`;
      sub = 'Liquidación de compartidos'; sign = ''; cls = tx.direction === 'in' ? 'in' : '';
      break;
    default:
      break;
  }

  let total = null;
  if (tx.shared) {
    sub = `🤝 ${tx.paidBy === 'partner' ? `Pagó ${partnerName()}` : 'Compartido'} · ${sub.split(' · ')[0]}`;
    total = tx.amount;
    amount = myShare(tx);
  }
  return { icon, title, sub, sign, cls, amount, total, s };
}

export function txRow(tx, { showDate = false } = {}) {
  const v = txView(tx);
  return `
    <li class="row tappable" data-tx="${esc(tx.id)}">
      <div class="row-icon">${v.icon}</div>
      <div class="row-main">
        <div class="row-title">${esc(v.title)}</div>
        <div class="row-sub">${showDate ? esc(shortDate(tx.date)) + ' · ' : ''}${esc(v.sub)}</div>
      </div>
      <div class="row-end"><div class="row-amount ${v.cls}">${v.sign}${money(v.amount)}</div>
        ${v.total != null ? `<div class="small muted num">de ${money(v.total)}</div>` : ''}</div>
    </li>`;
}

// ---------- Barras por categoría ----------

export function categoryBars(categories, total, limit = 99) {
  if (!categories.length) {
    return `<div class="empty"><span class="big">🧾</span>Aún no hay gastos registrados este mes.</div>`;
  }
  const max = categories[0].total || 1;
  return categories.slice(0, limit).map((c) => {
    const info = catInfo(c.id);
    const pct = total ? Math.round((c.total / total) * 100) : 0;
    return `
      <div class="bar-row">
        <div class="bar-head">
          <span class="name"><span>${info.icon}</span><span>${esc(info.name)}</span></span>
          <span class="num"><b>${money(c.total)}</b> <span class="muted small">${pct}%</span></span>
        </div>
        <div class="bar"><span style="width:${Math.max(2, (c.total / max) * 100)}%"></span></div>
      </div>`;
  }).join('');
}

// ---------- Utilidades de formularios ----------

export function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function bindSeg(container, onChange) {
  container.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onChange?.(seg.dataset.name, b.dataset.value);
    });
  });
}

export function dueLabel(days, overdue) {
  if (overdue) return `<span class="pill danger">Vencido</span>`;
  if (days === 0) return `<span class="pill danger">Vence hoy</span>`;
  if (days === 1) return `<span class="pill warn">Mañana</span>`;
  if (days <= 3) return `<span class="pill warn">En ${days} días</span>`;
  return `<span class="pill">En ${days} días</span>`;
}
