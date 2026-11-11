// Registrar (o editar) un gasto o ingreso: pensado para hacerlo en pocos segundos.
import { getState, addTx, removeTx } from '../store.js';
import { monthSummary } from '../calc.js';
import { esc, money, today, parseAmount, daysBetween } from '../format.js';
import {
  toast, bindSeg, ICONS, shareFieldsHTML, bindShareFields, catInfo, methodLabel, partnerName,
} from '../ui.js';
import { parsePhrase } from '../voice.js';
import { openPayItem } from './money.js';

const VISIBLE_CATS = 8;
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

// Resumen de lo que entendió la app, con lo que falta.
function summaryHTML(r) {
  if (r.project) {
    return `
      <div class="voice-summary">
        <div>Entendí: <b>${esc(r.project.icon || '📌')} ${esc(r.project.name)}</b> de ${esc(r.project.projectName)} · <b>${money(r.amount)}</b></div>
        <button type="button" class="btn sm primary" data-proj style="margin-top:8px">Marcar como pagado en ${esc(r.project.projectName)}</button>
      </div>`;
  }
  const bits = [];
  const missing = [];
  if (r.type === 'income') bits.push('💰 Ingreso');
  if (r.amount != null) bits.push(`<b>${money(r.amount)}</b>`); else missing.push('el monto');
  if (r.type === 'expense') {
    if (r.categoryId) { const c = catInfo(r.categoryId); bits.push(`${c.icon} ${esc(c.name)}`); } else missing.push('la categoría');
    if (r.method) bits.push(esc(methodLabel(r.method)));
    if (r.shared) bits.push(r.paidBy === 'partner' ? `🤝 pagó ${esc(partnerName())} (tu parte ${r.myPct}%)` : `🤝 compartido (tu parte ${r.myPct}%)`);
  }
  if (r.date !== today()) bits.push(`📅 ${esc(r.date.slice(8, 10))}/${esc(r.date.slice(5, 7))}`);
  return `
    <div class="voice-summary ${missing.length ? 'incomplete' : ''}">
      <div>Entendí: ${bits.join(' · ') || '—'}</div>
      ${missing.length ? `<div class="small" style="margin-top:4px">Falta ${missing.join(' y ')}: elígelo abajo.</div>`
    : '<div class="small muted" style="margin-top:4px">Revisa y toca <b>Guardar</b>.</div>'}
    </div>`;
}

export default function add(el, params) {
  const s = getState();
  const editing = params.id ? s.txs.find((t) => t.id === params.id) : null;
  const vale = s.incomes.find((i) => i.cash === false); // ej. tarjeta de alimentos
  const validMethod = (m) => m === 'cash' || (m === 'vale' && vale) || s.cards.some((c) => c.id === m);
  const tx = editing || {
    type: params.type === 'income' ? 'income' : 'expense',
    amount: '',
    categoryId: null,
    method: validMethod(s.settings.lastMethod) ? s.settings.lastMethod : 'cash',
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

    ${editing ? '' : `
      <section class="voice-box">
        <div class="voice-row">
          <input class="input" id="voice" placeholder='Dímelo: "25 taxi con la visa"' enterkeyhint="done" autocomplete="off" aria-label="Dime el gasto">
          ${SR ? `<button type="button" class="icon-btn voice-mic" id="voice-mic" aria-label="Hablar">${MIC}</button>` : ''}
        </div>
        <div class="small muted" id="voice-hint">🎤 Toca el micrófono ${SR ? 'o el de tu teclado' : 'de tu teclado'} y dime el gasto. Ej: "almuerzo 38 a medias con ${esc(partnerName())}", "ayer 120 mercado con la tarjeta de alimentos".</div>
        <div id="voice-result"></div>
      </section>`}

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
          ${vale ? `<button type="button" class="chip" data-method="vale">🛒 ${esc(vale.name)}</button>` : ''}
        </div>
        ${s.cards.length ? '' : '<div class="small muted" style="margin-top:4px">¿Pagas con tarjeta de crédito? Agrégala en <a href="#/deudas">Deudas</a>.</div>'}

        <div class="card" id="share-card" style="margin-top:16px;padding:14px 16px 8px"></div>
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

  function renderType() {
    expenseBlock.classList.toggle('hidden', f.type !== 'expense');
    form.note.placeholder = f.type === 'income' ? 'Ej: trabajo extra, venta, bono' : 'Ej: almuerzo con amigos';
  }

  // El bloque "Solo mío / Compartido" se puede volver a dibujar cuando la voz lo cambia.
  const shareCard = el.querySelector('#share-card');
  let share;
  function mountShare() {
    shareCard.innerHTML = shareFieldsHTML(f);
    share = bindShareFields(shareCard, f, {
      getAmount: () => parseAmount(amountInput.value),
      onChange: renderMethods,
    });
  }

  function setType(type) {
    f.type = type;
    el.querySelectorAll('.type-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === type)));
    renderType();
  }

  renderCats();
  mountShare();
  renderMethods();
  renderType();

  bindSeg(form, (name, value) => {
    f[name] = value;
    if (name === 'type') renderType();
  });

  // ---------- "Dímelo": entender una frase y llenar el formulario ----------
  const voiceInput = el.querySelector('#voice');
  const voiceResult = el.querySelector('#voice-result');
  let autoNote = '';

  function applyPhrase(text) {
    const r = parsePhrase(text, getState());
    if (!text.trim()) { voiceResult.innerHTML = ''; return r; }
    setType(r.type);
    if (r.amount != null) amountInput.value = r.amount;
    if (r.categoryId) {
      f.categoryId = r.categoryId;
      if (cats.findIndex((c) => c.id === r.categoryId) >= VISIBLE_CATS) f.showAllCats = true;
      renderCats();
    }
    if (r.method && validMethod(r.method)) f.method = r.method;
    f.shared = r.shared;
    f.paidBy = r.paidBy;
    if (r.shared) f.myPct = r.myPct;
    mountShare();
    renderMethods();
    form.date.value = r.date;
    if (!form.note.value || form.note.value === autoNote) {
      form.note.value = r.note;
      autoNote = r.note;
    }
    voiceResult.innerHTML = summaryHTML(r);
    voiceResult.querySelector('[data-proj]')?.addEventListener('click', () => {
      openPayItem(r.project.projectId, r.project.itemId, { amount: r.amount, date: r.date });
    });
    return r;
  }

  if (voiceInput) {
    let timer;
    voiceInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => applyPhrase(voiceInput.value), 350);
    });
    voiceInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      applyPhrase(voiceInput.value);
      voiceInput.blur(); // revisas el resumen y tocas Guardar
    });
    if (params.voz) { voiceInput.value = params.voz; applyPhrase(params.voz); }
    else setTimeout(() => voiceInput.focus(), 50);

    // Micrófono del navegador (si el celular lo permite).
    el.querySelector('#voice-mic')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const rec = new SR();
      rec.lang = 'es-PE';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      btn.classList.add('listening');
      rec.onresult = (ev) => {
        const said = ev.results[0][0].transcript;
        voiceInput.value = said;
        applyPhrase(said);
      };
      rec.onerror = () => toast('No pude usar el micrófono aquí. Usa el 🎤 de tu teclado.');
      rec.onend = () => btn.classList.remove('listening');
      try { rec.start(); } catch { btn.classList.remove('listening'); toast('Usa el 🎤 de tu teclado.'); }
    });
  } else if (!editing) {
    setTimeout(() => amountInput.focus(), 50);
  }

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
  amountInput.addEventListener('input', share.refresh);

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
