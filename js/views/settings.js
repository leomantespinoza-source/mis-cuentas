// Ajustes: datos personales, compartidos, categorías y respaldo.
import {
  getState, updateSettings, upsert, remove, importJSON, resetAll,
} from '../store.js';
import {
  download, downloadBackup, shareBackup, canShareBackup, daysSinceBackup,
} from '../backup.js';
import { esc, today } from '../format.js';
import { ICONS, toast, formValues, catInfo, methodLabel } from '../ui.js';
import { myShare } from '../calc.js';

export default function settings(el) {
  const s = getState();
  const days = daysSinceBackup();
  let lastText;
  let lastCls = '';
  if (days == null) lastText = '<b>Aún no has hecho ningún respaldo.</b>';
  else if (days === 0) { lastText = '<b>Último respaldo: hoy.</b> Todo en orden.'; lastCls = 'ok'; }
  else if (days < 7) { lastText = `<b>Último respaldo: hace ${days} ${days === 1 ? 'día' : 'días'}.</b>`; lastCls = 'ok'; }
  else lastText = `<b>Último respaldo: hace ${days} días.</b> Toca hacer uno nuevo.`;

  el.innerHTML = `
    <header class="topbar">
      <a class="icon-btn" href="#/inicio" aria-label="Volver">${ICONS.back}</a>
      <h1 style="font-size:19px">Ajustes</h1>
      <span style="width:44px"></span>
    </header>

    <section class="card">
      <h2 class="card-title">Tú y los gastos compartidos</h2>
      <form id="profile">
        <label class="field"><span>Tu nombre</span>
          <input class="input" name="name" maxlength="30" value="${esc(s.settings.name)}" data-noautofocus="1"></label>
        <label class="field"><span>¿Con quién compartes gastos?</span>
          <input class="input" name="partnerName" maxlength="30" value="${esc(s.settings.partnerName)}">
          <small>Pareja, roommate, familia… Aparece al marcar un gasto como compartido.</small></label>
        <label class="field"><span>Tu parte por defecto (%)</span>
          <input class="input" type="number" name="defaultSharedPct" min="0" max="100" step="5" value="${s.settings.defaultSharedPct}"></label>
        <button class="btn primary block">Guardar</button>
      </form>
    </section>

    <section class="card">
      <h2 class="card-title">Categorías</h2>
      <ul class="rows">
        ${s.categories.map((c) => `
          <li class="row">
            <div class="row-icon">${c.icon}</div>
            <div class="row-main"><div class="row-title">${esc(c.name)}</div></div>
            ${c.id === 'otros' ? '' : `<button class="btn sm" data-del-cat="${esc(c.id)}" aria-label="Eliminar ${esc(c.name)}">Quitar</button>`}
          </li>`).join('')}
      </ul>
      <form id="new-cat" style="display:flex;gap:8px;margin-top:12px">
        <input class="input" name="icon" maxlength="4" placeholder="🙂" style="width:64px;text-align:center" aria-label="Emoji">
        <input class="input" name="name" maxlength="30" placeholder="Nueva categoría" required aria-label="Nombre de categoría">
        <button class="btn">Agregar</button>
      </form>
    </section>

    <section class="card">
      <h2 class="card-title">Respaldo de tus datos</h2>
      <p class="muted small" style="margin-top:0">Tus datos se guardan <b>solo en este celular</b>, no en internet.
        Si borras los datos del navegador o cambias de celular, se pierden. Descarga un respaldo cada cierto tiempo y guárdalo en un lugar personal.</p>
      <div class="notice ${lastCls}" style="margin-bottom:12px"><span>💾</span><div>${lastText}</div></div>
      <div style="display:grid;gap:10px">
        ${canShareBackup() ? '<button class="btn primary block" data-share>📤 Enviar respaldo (Drive, correo, WhatsApp)</button>' : ''}
        <button class="btn block" data-export>⬇️ Descargar respaldo</button>
        <label class="btn block" style="cursor:pointer">⬆️ Restaurar respaldo
          <input type="file" data-import class="hidden"></label>
        <button class="btn block" data-csv>📄 Exportar movimientos (Excel/CSV)</button>
      </div>
      <p class="small muted" id="persist-status" style="margin-bottom:0"></p>
    </section>

    <section class="card">
      <h2 class="card-title">Instalar en tu celular</h2>
      <p class="small" style="margin:0 0 6px"><b>Android (Chrome):</b> menú ⋮ → <i>Instalar app</i> o <i>Agregar a pantalla principal</i>.</p>
      <p class="small" style="margin:0"><b>iPhone (Safari):</b> botón Compartir → <i>Agregar a inicio</i>.</p>
    </section>

    <button class="btn danger block" data-reset style="margin-top:8px">Borrar todos los datos</button>
  `;

  el.querySelector('#profile').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formValues(e.target);
    updateSettings({
      name: v.name.trim(),
      partnerName: v.partnerName.trim() || 'Pareja',
      defaultSharedPct: Math.min(100, Math.max(0, Number(v.defaultSharedPct) || 50)),
    });
    toast('Guardado');
  });

  el.querySelector('#new-cat').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formValues(e.target);
    upsert('categories', { icon: v.icon.trim() || '🏷️', name: v.name.trim() });
    toast('Categoría agregada');
  });

  el.querySelectorAll('[data-del-cat]').forEach((b) => b.addEventListener('click', () => {
    const c = catInfo(b.dataset.delCat);
    if (!confirm(`¿Quitar "${c.name}"? Sus gastos pasarán a mostrarse como "Otros".`)) return;
    remove('categories', b.dataset.delCat);
  }));

  el.querySelector('[data-export]').addEventListener('click', () => {
    downloadBackup();
    toast('Respaldo descargado. Guárdalo fuera del celular');
  });
  el.querySelector('[data-share]')?.addEventListener('click', async () => {
    if (await shareBackup()) toast('Respaldo listo ✓');
  });

  el.querySelector('[data-import]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Esto reemplazará los datos actuales de la app con los del respaldo. ¿Continuar?')) return;
    try {
      importJSON(await file.text());
      toast('Respaldo restaurado');
    } catch (err) {
      alert(`No se pudo restaurar: ${err.message}`);
    }
  });

  el.querySelector('[data-csv]').addEventListener('click', () => {
    download(`mis-cuentas-movimientos-${today()}.csv`, toCSV(getState()), 'text/csv');
  });

  el.querySelector('[data-reset]').addEventListener('click', () => {
    if (!confirm('Se borrarán TODOS tus datos de este celular. Esto no se puede deshacer. ¿Seguro?')) return;
    if (!confirm('Última confirmación: ¿descargaste un respaldo? Pulsa Aceptar para borrar todo.')) return;
    resetAll();
    location.hash = '#/inicio';
  });

  const ps = el.querySelector('#persist-status');
  navigator.storage?.persisted?.().then((p) => {
    ps.textContent = p
      ? '✓ El navegador mantendrá tus datos guardados.'
      : 'El navegador podría borrar los datos si falta espacio. Instalar la app ayuda a evitarlo.';
  });
}

const TYPE_LABEL = {
  expense: 'Gasto', fixed: 'Gasto fijo', income: 'Ingreso', cardpay: 'Pago tarjeta', loanpay: 'Cuota préstamo', settle: 'Liquidación',
};

function toCSV(s) {
  const rows = [['Fecha', 'Tipo', 'Categoría', 'Nota', 'Medio de pago', 'Monto total', 'Mi parte', 'Compartido']];
  const sorted = [...s.txs].sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sorted) {
    rows.push([
      t.date,
      TYPE_LABEL[t.type] || t.type,
      t.categoryId ? catInfo(t.categoryId).name : '',
      t.note || '',
      methodLabel(t.method),
      t.amount.toFixed(2),
      myShare(t).toFixed(2),
      t.shared ? 'Sí' : 'No',
    ]);
  }
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
