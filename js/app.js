// Punto de entrada: navegación entre pantallas y registro del service worker.
import { subscribe } from './store.js';
import { closeSheet } from './ui.js';
import home from './views/home.js';
import add from './views/add.js';
import movs from './views/movs.js';
import plan from './views/plan.js';
import debts from './views/debts.js';
import settings from './views/settings.js';
import calendar from './views/calendar.js';

const routes = {
  calendario: calendar,
  inicio: home,
  nuevo: add,
  movimientos: movs,
  plan,
  deudas: debts,
  ajustes: settings,
};

const viewEl = document.getElementById('view');
let current = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { name: routes[path] ? path : 'inicio', params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function render() {
  const { name, params } = parseHash();
  current = name;
  viewEl.innerHTML = '';
  routes[name](viewEl, params);
  const tab = name === 'calendario' ? 'plan' : name;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === tab);
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

window.addEventListener('hashchange', () => {
  closeSheet();
  render();
  window.scrollTo(0, 0);
});

// Cuando cambian los datos, se vuelve a dibujar la pantalla (salvo el formulario de registro).
subscribe(() => {
  if (current !== 'nuevo') {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }
});

if (!location.hash) history.replaceState(null, '', '#/inicio');
render();

// Funcionamiento sin internet + pedir al navegador que no borre los datos.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW no registrado', e));
}
if (navigator.storage?.persist) {
  navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist(); });
}
