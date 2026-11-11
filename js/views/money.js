// Mi dinero: saldos de tus cuentas, "¿Me alcanza?" (proyección) y proyectos con pagos grandes.
import {
  getState, saveAccounts, upsert, remove, findById, addTx, removeTx,
} from '../store.js';
import { projectTotals, projectItemPaid } from '../calc.js';
import { cashProjection, currentCash, hasAccounts } from '../cash.js';
import {
  money, esc, today, parseAmount, shortDate, daysBetween, uid,
} from '../format.js';
import { weekdayShort } from '../schedule.js';
import {
  ICONS, openSheet, toast, formValues, shareFieldsHTML, bindShareFields,
} from '../ui.js';

const KIND_ICON = { income: '💵', loan: '🏦', fixed: '📅', card: '💳', project: '🧾' };

function wd(iso) {
  return `${weekdayShort(iso)} ${shortDate(iso)}`;
}

export default function moneyView(el) {
  const s = getState();
  const t = today();
  const accounts = hasAccounts(s);
  const proj = accounts ? cashProjection(s) : null;
  const updated = s.settings.balancesUpdatedAt ? daysBetween(new Date(s.settings.balancesUpdatedAt).toISOString().slice(0, 10), t) : null;

  el.innerHTML = `
    <header class="topbar">
      <a class="icon-btn" href="#/inicio" aria-label="Volver">${ICONS.back}</a>
      <h1 style="font-size:19px">Mi dinero</h1>
      <span style="width:44px"></span>
    </header>

    ${accounts ? `
      <section class="hero" style="padding-bottom:16px">
        <p class="hero-label">Tienes hoy</p>
        <div class="hero-amount num">${money(proj.start)}</div>
        <p class="hero-note">${s.accounts.map((a) => `${esc(a.name)} ${money(a.balance)}${a.cash === false ? ' (no disponible)' : ''}`).join(' · ')}</p>
        <p class="hero-note small" style="margin-top:6px">Saldos anotados ${updated === 0 ? 'hoy' : `hace ${updated} ${updated === 1 ? 'día' : 'días'}`}; desde entonces se suma y resta lo que registras.</p>
        <button class="btn sm" data-accounts style="margin-top:12px;background:rgba(255,255,255,.18);border-color:transparent;color:inherit">Actualizar saldos</button>
      </section>
      ${reachCard(proj)}`
    : `
      <section class="card">
        <h2 class="card-title">¿Cuánto tienes hoy?</h2>
        <p class="muted small" style="margin-top:-4px">Anota lo que tienes en cada cuenta (sueldo, ahorros, CTS…). Con eso la app proyecta tu dinero día a día
          y te dice si te alcanza para tus pagos grandes.</p>
        <button class="btn primary block" data-accounts>Anotar mis saldos</button>
      </section>`}

    <div class="section-label">Proyectos y pagos grandes</div>
    ${s.projects.length ? s.projects.map((p) => projectCard(s, p, t)).join('') : `
      <section class="card empty">Un matrimonio, un viaje, una mudanza… agrupa sus pagos con sus fechas para tenerlos reservados.</section>`}
    <button class="btn block" data-new-project>+ Nuevo proyecto</button>
  `;

  el.querySelectorAll('[data-accounts]').forEach((b) => b.addEventListener('click', openAccountsForm));
  el.querySelector('[data-new-project]').addEventListener('click', () => openProjectForm());
  el.querySelectorAll('[data-edit-project]').forEach((b) => b.addEventListener('click', () => openProjectForm(b.dataset.editProject)));
  el.querySelectorAll('[data-add-item]').forEach((b) => b.addEventListener('click', () => openItemForm(b.dataset.addItem)));
  el.querySelectorAll('[data-item]').forEach((r) => r.addEventListener('click', () => {
    const [pid, iid] = r.dataset.item.split('|');
    openPayItem(pid, iid);
  }));
}

function reachCard(p) {
  let notice;
  if (p.firstNegative) {
    notice = `<div class="notice danger" style="margin:0 0 12px"><span>🚨</span><div><b>Te quedarías en rojo el ${esc(wd(p.firstNegative))}</b>
      Con los pagos que vienen no te alcanza. Revisa qué puedes mover o de dónde sacar ese dinero.</div></div>`;
  } else {
    notice = `<div class="notice ok" style="margin:0 0 12px"><span>✅</span><div><b>Te alcanza para todo lo programado</b>
      Gastando hasta <strong>${money(p.safeDaily)} por día</strong> en tu día a día, no te quedas en rojo en los próximos ${p.days} días.</div></div>`;
  }
  return `
    <section class="card">
      <h2 class="card-title">¿Me alcanza? <span class="small muted">próximos ${p.days} días</span></h2>
      ${notice}
      <div class="stats" style="margin-bottom:12px">
        <div class="stat"><div class="stat-label">Punto más bajo</div>
          <div class="stat-value ${p.low.balance < 0 ? 'danger-text' : ''}">${money(p.low.balance)}</div>
          <div class="small muted">${esc(wd(p.low.date))}</div></div>
        <div class="stat"><div class="stat-label">Al día ${p.days}</div>
          <div class="stat-value">${money(p.end)}</div>
          <div class="small muted">sin gastos diarios</div></div>
      </div>
      ${p.events.length ? `<ul class="rows">${p.events.map((e) => `
        <li class="row">
          <div class="row-icon">${KIND_ICON[e.kind] || '•'}</div>
          <div class="row-main"><div class="row-title">${esc(e.name)}${e.tentative ? ' *' : ''}</div>
            <div class="row-sub">${esc(wd(e.date))}${e.overdue ? ' · vencido' : ''}</div></div>
          <div class="row-end"><div class="row-amount ${e.amount > 0 ? 'in' : ''}">${e.amount > 0 ? '+' : '−'}${money(Math.abs(e.amount))}</div>
            <div class="small muted num ${e.after < 0 ? 'danger-text' : ''}">queda ${money(e.after)}</div></div>
        </li>`).join('')}</ul>` : '<div class="empty">No hay ingresos ni pagos programados en estos días.</div>'}
      <p class="small muted" style="margin:10px 0 0">No incluye tus gastos del día a día: de lo que "queda" salen la comida, el transporte y lo demás.</p>
    </section>`;
}

function projectCard(s, p, t) {
  const tot = projectTotals(s, p);
  const pct = tot.total ? (tot.paid / tot.total) * 100 : 0;
  const days = p.date ? daysBetween(t, p.date) : null;
  let when = '';
  if (p.date) {
    if (days > 1) when = ` · faltan ${days} días`;
    else if (days === 1) when = ' · ¡mañana!';
    else if (days === 0) when = ' · ¡hoy!';
  }
  const items = [...(p.items || [])].sort((a, b) => a.date.localeCompare(b.date));
  return `
    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div><div class="row-title" style="font-size:17px">${esc(p.icon || '📌')} ${esc(p.name)}</div>
          <div class="small muted">${p.date ? esc(wd(p.date)) : ''}${when}</div></div>
        <div style="text-align:right"><div class="stat-value">${money(tot.pending)}</div><div class="small muted">por pagar</div></div>
      </div>
      <div class="bar" style="margin:12px 0 6px"><span style="width:${pct}%"></span></div>
      <div class="small muted" style="display:flex;justify-content:space-between"><span>Pagado ${money(tot.paid)}</span><span>Total ${money(tot.total)}</span></div>
      <ul class="rows" style="margin-top:8px">
        ${items.map((it) => {
    const tx = projectItemPaid(s, p.id, it.id);
    return `
          <li class="row tappable" data-item="${esc(p.id)}|${esc(it.id)}">
            <div class="row-main"><div class="row-title">${esc(it.name)}</div>
              <div class="row-sub">${tx ? `Pagado el ${esc(shortDate(tx.date))}` : `Pagar hasta el ${esc(wd(it.date))}`}</div></div>
            <div class="row-end"><div class="row-amount">${money(tx ? tx.amount : it.amount)}</div>
              ${tx ? '<span class="pill ok">Pagado</span>' : '<span class="pill">Pendiente</span>'}</div>
          </li>`;
  }).join('')}
      </ul>
      <div class="btn-row">
        <button class="btn sm" data-edit-project="${esc(p.id)}">Editar</button>
        <button class="btn sm" data-add-item="${esc(p.id)}">+ Pago</button>
      </div>
    </section>`;
}

// ---------- Saldos ----------

function openAccountsForm() {
  const s = getState();
  let rows = s.accounts.length
    ? s.accounts.map((a) => ({ ...a }))
    : [{ id: uid(), name: 'Cuenta sueldo', balance: '', cash: true }];

  openSheet({
    title: 'Mis saldos de hoy',
    html: `
      <p class="muted small" style="margin-top:0">Anota lo que tienes <b>hoy</b> en cada cuenta. Desde este momento la app suma tus ingresos y resta lo que registres.
        Si algo no cuadra más adelante, vuelve aquí y corrige.</p>
      <form>
        <div id="acc-rows"></div>
        <button type="button" class="btn sm block" data-add-row style="margin-bottom:14px">+ Otra cuenta</button>
        <button class="btn primary block">Guardar saldos</button>
      </form>`,
    onMount(sheet, close) {
      const box = sheet.querySelector('#acc-rows');
      const render = () => {
        box.innerHTML = rows.map((a, i) => `
          <div class="card" style="padding:12px;margin-bottom:10px">
            <div style="display:flex;gap:8px">
              <input class="input" data-i="${i}" data-f="name" value="${esc(a.name)}" placeholder="Nombre" aria-label="Nombre de la cuenta" data-noautofocus="1">
              <input class="input num" data-i="${i}" data-f="balance" value="${a.balance ?? ''}" inputmode="decimal" placeholder="0.00" style="width:120px" aria-label="Saldo">
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
              <label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-i="${i}" data-f="cash" ${a.cash !== false ? 'checked' : ''}> Lo puedo usar</label>
              <button type="button" class="link-btn" data-del-row="${i}" style="color:var(--danger)">Quitar</button>
            </div>
          </div>`).join('');
      };
      render();
      box.addEventListener('input', (e) => {
        const { i, f } = e.target.dataset;
        if (i == null) return;
        rows[i][f] = f === 'cash' ? e.target.checked : e.target.value;
      });
      box.addEventListener('change', (e) => {
        const { i, f } = e.target.dataset;
        if (f === 'cash') rows[i].cash = e.target.checked;
      });
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-del-row]');
        if (!b) return;
        rows.splice(Number(b.dataset.delRow), 1);
        render();
      });
      sheet.querySelector('[data-add-row]').addEventListener('click', () => {
        rows.push({ id: uid(), name: '', balance: '', cash: true });
        render();
      });
      sheet.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const clean = rows
          .filter((a) => String(a.name).trim() || parseAmount(a.balance))
          .map((a) => ({ id: a.id, name: String(a.name).trim() || 'Cuenta', balance: parseAmount(a.balance), cash: a.cash !== false }));
        saveAccounts(clean);
        close();
        toast(`Saldos guardados: ${money(currentCash(getState()))}`);
      });
    },
  });
}

// ---------- Proyectos ----------

function openProjectForm(id) {
  const p = id ? findById('projects', id) : null;
  openSheet({
    title: p ? 'Editar proyecto' : 'Nuevo proyecto',
    html: `
      <form>
        <div style="display:flex;gap:8px">
          <label class="field" style="width:76px"><span>Ícono</span>
            <input class="input" name="icon" maxlength="4" value="${esc(p?.icon || '📌')}" style="text-align:center" data-noautofocus="1"></label>
          <label class="field" style="flex:1"><span>Nombre</span>
            <input class="input" name="name" required maxlength="40" placeholder="Ej: Matrimonio, Viaje" value="${esc(p?.name || '')}"></label>
        </div>
        <label class="field"><span>Fecha del evento</span>
          <input class="input" type="date" name="date" value="${esc(p?.date || '')}"></label>
        <div class="btn-row">
          ${p ? '<button type="button" class="btn danger" data-del>Eliminar</button>' : ''}
          <button class="btn primary">Guardar</button>
        </div>
      </form>`,
    onMount(sheet, close) {
      sheet.querySelector('[data-del]')?.addEventListener('click', () => {
        if (!confirm('¿Eliminar el proyecto? Los pagos ya registrados se conservan en Movimientos.')) return;
        remove('projects', p.id); close();
      });
      sheet.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(e.target);
        upsert('projects', { id: p?.id, name: v.name.trim(), icon: v.icon.trim() || '📌', date: v.date || null, items: p?.items || [] });
        close();
        toast('Proyecto guardado');
      });
    },
  });
}

function openItemForm(projectId, itemId) {
  const p = findById('projects', projectId);
  if (!p) return;
  const it = itemId ? p.items.find((x) => x.id === itemId) : null;
  openSheet({
    title: it ? 'Editar pago' : `Nuevo pago · ${p.name}`,
    html: `
      <form>
        <label class="field"><span>Concepto</span>
          <input class="input" name="name" required maxlength="40" placeholder="Ej: Fotógrafo" value="${esc(it?.name || '')}"></label>
        <div class="field-row">
          <label class="field"><span>Monto</span>
            <input class="input num" name="amount" inputmode="decimal" required value="${it?.amount ?? ''}"></label>
          <label class="field"><span>Pagar hasta</span>
            <input class="input" type="date" name="date" required value="${esc(it?.date || p.date || today())}"></label>
        </div>
        <div class="btn-row">
          ${it ? '<button type="button" class="btn danger" data-del>Eliminar</button>' : ''}
          <button class="btn primary">Guardar</button>
        </div>
      </form>`,
    onMount(sheet, close) {
      sheet.querySelector('[data-del]')?.addEventListener('click', () => {
        if (!confirm('¿Eliminar este pago del proyecto?')) return;
        upsert('projects', { id: p.id, items: p.items.filter((x) => x.id !== it.id) });
        close();
      });
      sheet.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(e.target);
        const amount = parseAmount(v.amount);
        if (amount <= 0) return toast('Ingresa un monto válido');
        const next = { id: it?.id || uid(), name: v.name.trim(), amount, date: v.date };
        const items = it ? p.items.map((x) => (x.id === it.id ? next : x)) : [...(p.items || []), next];
        upsert('projects', { id: p.id, items });
        close();
        toast('Pago guardado');
      });
    },
  });
}

export function openPayItem(projectId, itemId, prefill = {}) {
  const s = getState();
  const p = findById('projects', projectId);
  const it = p?.items.find((x) => x.id === itemId);
  if (!it) return;
  const paid = projectItemPaid(s, p.id, it.id);

  if (paid) {
    openSheet({
      title: it.name,
      html: `
        <p class="muted" style="margin-top:0">Pagado <b>${money(paid.amount)}</b> el ${esc(shortDate(paid.date))}.</p>
        <div class="btn-row" style="flex-direction:column">
          <button class="btn block" data-undo>Desmarcar pago</button>
          <button class="btn block" data-edit>Editar concepto</button>
        </div>`,
      onMount(sheet, close) {
        sheet.querySelector('[data-undo]').addEventListener('click', () => { removeTx(paid.id); close(); toast('Pago desmarcado'); });
        sheet.querySelector('[data-edit]').addEventListener('click', () => openItemForm(p.id, it.id));
      },
    });
    return;
  }

  const st = { shared: false, myPct: s.settings.defaultSharedPct ?? 50, paidBy: 'me' };
  openSheet({
    title: `Pagar: ${it.name}`,
    html: `
      <form>
        <p class="muted small" style="margin-top:0">${esc(p.icon || '📌')} ${esc(p.name)} · pagar hasta el ${esc(wd(it.date))}</p>
        <label class="field"><span>Monto pagado</span>
          <input class="input num" name="amount" inputmode="decimal" value="${prefill.amount ?? it.amount}" required data-noautofocus="1"></label>
        ${shareFieldsHTML(st)}
        <label class="field" data-method-field><span>¿Con qué pagaste?</span>
          <select class="input" name="method">
            <option value="cash">💵 Efectivo / débito / transferencia</option>
            ${s.cards.map((c) => `<option value="${esc(c.id)}">💳 Tarjeta ${esc(c.name)}</option>`).join('')}
          </select></label>
        <label class="field"><span>Fecha</span>
          <input class="input" type="date" name="date" value="${prefill.date || today()}" max="${today()}" required></label>
        <div class="btn-row">
          <button type="button" class="btn" data-edit>Editar</button>
          <button class="btn primary">Marcar pagado</button>
        </div>
      </form>`,
    onMount(sheet, close) {
      const form = sheet.querySelector('form');
      const methodField = sheet.querySelector('[data-method-field]');
      const sync = () => methodField.classList.toggle('hidden', st.shared && st.paidBy === 'partner');
      const share = bindShareFields(sheet, st, { getAmount: () => parseAmount(form.amount.value), onChange: sync });
      form.amount.addEventListener('input', share.refresh);
      sheet.querySelector('[data-edit]').addEventListener('click', () => openItemForm(p.id, it.id));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(form);
        const amount = parseAmount(v.amount);
        if (amount <= 0) return toast('Ingresa un monto válido');
        addTx({
          type: 'project', refId: p.id, itemId: it.id, amount, date: v.date, note: it.name,
          method: v.method, shared: st.shared, myPct: st.myPct, paidBy: st.shared ? st.paidBy : 'me',
        });
        close();
        toast(`${it.name}: pagado ✓`);
      });
    },
  });
}
