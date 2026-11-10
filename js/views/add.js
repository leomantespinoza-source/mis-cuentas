// Registrar (o editar) un gasto o ingreso: pensado para hacerlo en pocos segundos.
import { getState, addTx, removeTx } from '../store.js';
import { monthSummary } from '../calc.js';
import { esc, money, today, parseAmount, daysBetween } from '../format.js';
import { toast, bindSeg, ICONS, partnerName } from '../ui.js';

const VISIBLE_CATS = 8;

export default function add(el, params) {
  const s = getState();
  const editing = params.id ? s.txs.find((t) => t.id === params.id) : null;
  const tx = editing || {
    type: params.type === 'income' ? 'income' : 'expense',
    amount: '',
    categoryId: null,
    method: s.settings.lastMethod && (s.settings.lastMethod === 'cash' || s.cards.some((c) => c.id === s.settings.lastMethod))
      ? s.settings.lastMethod : 'cash',
    shared: false,
    myPct: s.settings.defaultSharedPct ?? 50,
    paidBy: 'me',
    note: '',
    date: today(),
  };

  // Estado del formulario
  const f = {
    type: tx.type,
    categoryId: tx.categoryId,
    method: tx.method === 'partner' ? 'cash' : tx.method,
    shared: tx.shared,
    paidBy: tx.paidBy || 'me',
    myPct: tx.myPct ?? 50,
    showAllCats: false,
  };

  const cats = sortedCategories(s);
  if (f.categoryId && cats.findIndex((c) => c.id === f.categoryId) >= VISIBLE_CATS) f.showAllCats = true;

  el.innerHTML = `
    <header class="topbar">
      <a class="icon-btn" href="javascript:history.back()" aria-label="Volver">${ICONS.back}</a>
      <h1 style="font-size:19px">${editing ? 'Editar movimiento' : 'Registrar'}</h1>
      <span style="width:44px"></span>
    </header>

    <form id="tx-form" autocomplete="off">
      <div class="seg type-seg" data-name="type">
        <button type="button" data-value="expense" aria-pressed="${f.type === 'expense'}">Gasto</button>
        <button type="button" data-value="income" aria-pressed="${f.type === 'income'}">Ingreso extra</button>
      </div>

      <div class="amount-wrap">
        <span class="cur">S/</span>
        <input class="amount-input" name="amount" inputmode="decimal" placeholder="0" aria-label="Monto"
          value="${tx.amount ? esc(tx.amount) : ''}" required>
      </div>

      <div data-expense>
        <div class="section-label">Categoría</div>
        <div class="cat-grid" id="cats"></div>
        <button type="button" class="link-btn" id="more-cats" style="margin-top:6px"></button>

        <div class="section-label">¿Con qué pagaste?</div>
        <div class="chips" id="methods">
          <button type="button" class="chip" data-method="cash">💵 Efectivo / débito</button>
          ${s.cards.map((c) => `<button type="button" class="chip" data-method="${esc(c.id)}">💳 ${esc(c.name)}</button>`).join('')}
        </div>
        ${s.cards.length ? '' : '<div class="small muted" style="margin-top:4px">¿Pagas con tarjeta de crédito? Agrégala en <a href="#/deudas">Deudas</a>.</div>'}

        <div class="card" style="margin-top:16px;padding:6px 16px">
          <label class="switch"><span><b>Gasto compartido</b><br><span class="small muted">Con ${esc(partnerName())}</span></span>
            <input type="checkbox" name="shared" ${f.shared ? 'checked' : ''}></label>
          <div id="shared-opts" class="${f.shared ? '' : 'hidden'}" style="padding-bottom:12px">
            <div class="field" style="margin-bottom:10px"><span>¿Quién pagó?</span>
              <div class="seg" data-name="paidBy">
                <button type="button" data-value="me" aria-pressed="${f.paidBy === 'me'}">Yo</button>
                <button type="button" data-value="partner" aria-pressed="${f.paidBy === 'partner'}">${esc(partnerName())}</button>
              </div>
            </div>
            <label class="field" style="margin-bottom:0"><span>Mi parte: <span id="pct-label">${f.myPct}%</span></span>
              <input type="range" name="myPct" min="0" max="100" step="5" value="${f.myPct}" style="width:100%">
              <small id="share-hint"></small>
            </label>
          </div>
        </div>
      </div>

      <label class="field" style="margin-top:14px"><span>Nota <span class="muted small">(opcional)</span></span>
        <input class="input" name="note" maxlength="80" placeholder="Ej: almuerzo con amigos" value="${esc(tx.note)}"></label>

      <label class="field"><span>Fecha</span>
        <input class="input" type="date" name="date" value="${esc(tx.date)}" max="${today()}" required></label>

      ${editing ? '<button type="button" class="btn danger block" id="del">Eliminar movimiento</button>' : ''}

      <div class="save-bar"><button class="btn primary" type="submit">${editing ? 'Guardar cambios' : 'Guardar'}</button></div>
    </form>
  `;

  const form = el.querySelector('#tx-form');
  const amountInput = form.amount;
  const expenseBlock = el.querySelector('[data-expense]');
  const catsEl = el.querySelector('#cats');
  const moreBtn = el.querySelector('#more-cats');
  const sharedOpts = el.querySelector('#shared-opts');
  const methodsEl = el.querySelector('#methods');

  function renderCats() {
    const list = f.showAllCats ? cats : cats.slice(0, VISIBLE_CATS);
    catsEl.innerHTML = list.map((c) => `
      <button type="button" class="cat" data-cat="${esc(c.id)}" aria-pressed="${c.id === f.categoryId}">
        <span class="e">${c.icon}</span><span>${esc(c.name)}</span>
      </button>`).join('');
    moreBtn.textContent = f.showAllCats ? 'Ver menos' : `Ver todas (${cats.length})`;
    moreBtn.classList.toggle('hidden', cats.length <= VISIBLE_CATS);
  }

  function renderMethods() {
    methodsEl.classList.toggle('hidden', f.shared && f.paidBy === 'partner');
    methodsEl.previousElementSibling.classList.toggle('hidden', f.shared && f.paidBy === 'partner');
    methodsEl.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.method === f.method)));
  }

  function renderShareHint() {
    const amt = parseAmount(amountInput.value);
    el.querySelector('#pct-label').textContent = `${f.myPct}%`;
    const mine = (amt * f.myPct) / 100;
    const hint = el.querySelector('#share-hint');
    if (!amt) { hint.textContent = 'Solo tu parte cuenta en tu presupuesto.'; return; }
    hint.textContent = f.paidBy === 'me'
      ? `Tu parte: ${money(mine)}. ${partnerName()} te debe ${money(amt - mine)}.`
      : `Tu parte: ${money(mine)}. Le debes eso a ${partnerName()}.`;
  }

  function renderType() {
    expenseBlock.classList.toggle('hidden', f.type !== 'expense');
    form.note.placeholder = f.type === 'income' ? 'Ej: trabajo extra, venta, bono' : 'Ej: almuerzo con amigos';
  }

  renderCats();
  renderMethods();
  renderShareHint();
  renderType();
  if (!editing) setTimeout(() => amountInput.focus(), 50);

  bindSeg(el, (name, value) => {
    f[name] = value;
    if (name === 'type') renderType();
    if (name === 'paidBy') { renderMethods(); renderShareHint(); }
  });

  catsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    f.categoryId = b.dataset.cat;
    renderCats();
  });
  moreBtn.addEventListener('click', () => { f.showAllCats = !f.showAllCats; renderCats(); });
  methodsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-method]');
    if (!b) return;
    f.method = b.dataset.method;
    renderMethods();
  });
  form.shared.addEventListener('change', () => {
    f.shared = form.shared.checked;
    sharedOpts.classList.toggle('hidden', !f.shared);
    renderMethods();
    renderShareHint();
  });
  form.myPct.addEventListener('input', () => { f.myPct = Number(form.myPct.value); renderShareHint(); });
  amountInput.addEventListener('input', renderShareHint);

  el.querySelector('#del')?.addEventListener('click', () => {
    if (!confirm('¿Eliminar este movimiento?')) return;
    removeTx(editing.id);
    toast('Movimiento eliminado');
    history.back();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmount(amountInput.value);
    if (amount <= 0) { toast('Escribe el monto'); amountInput.focus(); return; }
    if (f.type === 'expense' && !f.categoryId) { toast('Elige una categoría'); return; }

    const saved = addTx({
      id: editing?.id,
      createdAt: editing?.createdAt,
      type: editing?.type === 'fixed' ? 'fixed' : f.type,
      refId: editing?.refId,
      amount,
      categoryId: f.type === 'expense' || editing?.type === 'fixed' ? f.categoryId : null,
      method: f.type === 'expense' ? f.method : 'cash',
      shared: f.type === 'expense' && f.shared,
      myPct: f.myPct,
      paidBy: f.paidBy,
      note: form.note.value,
      date: form.date.value || today(),
    });

    toast(feedback(saved), 3500);
    if (editing) history.back();
    else location.hash = '#/inicio';
  });
}

// Categorías ordenadas por uso reciente: las que más usas aparecen primero.
function sortedCategories(s) {
  const counts = new Map();
  const t = today();
  for (const tx of s.txs) {
    if (tx.type !== 'expense' || daysBetween(tx.date, t) > 90) continue;
    counts.set(tx.categoryId, (counts.get(tx.categoryId) || 0) + 1);
  }
  return s.categories
    .map((c, i) => ({ ...c, n: counts.get(c.id) || 0, i }))
    .sort((a, b) => (b.n - a.n) || (a.i - b.i));
}

// Mensaje después de guardar: muestra al instante cómo queda tu día.
function feedback(tx) {
  if (tx.type === 'income') return `Ingreso de ${money(tx.amount)} guardado`;
  const s = getState();
  if (!s.incomes.length || tx.date !== today()) return 'Gasto guardado';
  const m = monthSummary(s);
  if (m.variableBudget <= 0) return 'Gasto guardado';
  if (m.todayLeft >= 0) return `Guardado ✓ Hoy aún puedes gastar ${money(m.todayLeft)}`;
  return `Guardado. Hoy te pasaste por ${money(-m.todayLeft)}`;
}
