// Intérprete de frases habladas o escritas: "25 taxi con la visa", "ayer 120 mercado a medias con mi pareja".
// Funciona sin internet y sin IA: busca monto, tipo, categoría, forma de pago, compartido y fecha.
import { today, toISO, parseISO, round2 } from './format.js';
import { pendingProjectItems } from './calc.js';

export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"'()]/g, (c) => (c === ',' || c === '.' ? c : ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Números en palabras ----------

const UNITS = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const HUNDREDS = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
  setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};

// Convierte secuencias como "mil trescientos" o "veinticinco con cincuenta" en dígitos.
function wordsToDigits(text) {
  const words = text.split(' ');
  const out = [];
  let i = 0;
  const isNumWord = (w) => w in UNITS || w in TENS || w in HUNDREDS || w === 'mil';
  while (i < words.length) {
    if (!isNumWord(words[i]) || (words[i] === 'un' || words[i] === 'una') && !isNumWord(words[i + 1] || '')) {
      out.push(words[i]); i++; continue;
    }
    let total = 0;
    let current = 0;
    while (i < words.length) {
      const w = words[i];
      if (w in UNITS) current += UNITS[w];
      else if (w in TENS) current += TENS[w];
      else if (w in HUNDREDS) current += HUNDREDS[w];
      else if (w === 'mil') { total += (current || 1) * 1000; current = 0; }
      else if (w === 'y' && (words[i + 1] in UNITS) && current >= 30) { /* "treinta y cinco" */ } else break;
      i++;
    }
    out.push(String(total + current));
  }
  return out.join(' ');
}

// ---------- Diccionario de categorías ----------

const CATEGORY_WORDS = {
  super: ['supermercado', 'super', 'mercado', 'plaza vea', 'tottus', 'wong', 'makro', 'vivanda', 'bodega', 'abarrotes', 'verduras', 'frutas', 'carne', 'pan', 'panaderia', 'tambo', 'oxxo', 'mass', 'compras'],
  comida: ['almuerzo', 'almorce', 'cena', 'cene', 'desayuno', 'desayune', 'restaurante', 'menu', 'pollo', 'pollada', 'chifa', 'pizza', 'hamburguesa', 'delivery', 'rappi', 'pedidosya', 'comida', 'ceviche', 'sushi', 'kfc', 'bembos', 'mcdonalds', 'parrilla', 'anticucho', 'salchipapa'],
  antojos: ['cafe', 'starbucks', 'snack', 'golosina', 'helado', 'chocolate', 'galleta', 'gaseosa', 'dulce', 'jugo', 'antojo', 'chifles', 'piqueo', 'agua'],
  transporte: ['taxi', 'uber', 'cabify', 'didi', 'indrive', 'bus', 'pasaje', 'combi', 'gasolina', 'combustible', 'grifo', 'peaje', 'estacionamiento', 'cochera', 'colectivo', 'mototaxi', 'moto', 'metropolitano', 'corredor', 'tren', 'avion', 'vuelo'],
  vivienda: ['alquiler', 'renta', 'mantenimiento', 'condominio', 'arbitrios'],
  servicios: ['luz', 'agua potable', 'gas', 'enel', 'sedapal', 'luz del sur', 'calidda', 'servicios'],
  celular: ['celular', 'internet', 'recarga', 'claro', 'movistar', 'entel', 'bitel', 'telefono'],
  salud: ['farmacia', 'medicina', 'medicamento', 'pastilla', 'doctor', 'medico', 'clinica', 'consulta', 'inkafarma', 'mifarma', 'dentista', 'analisis', 'laboratorio', 'salud'],
  educacion: ['curso', 'libro', 'colegio', 'universidad', 'matricula', 'pension', 'clases', 'taller', 'diplomado', 'maestria'],
  ocio: ['cine', 'fiesta', 'salida', 'discoteca', 'bar', 'cerveza', 'chela', 'trago', 'concierto', 'juego', 'entrada', 'karaoke', 'paseo'],
  suscripciones: ['netflix', 'spotify', 'disney', 'hbo', 'youtube', 'prime', 'suscripcion', 'icloud', 'chatgpt', 'claude', 'crunchyroll', 'xbox', 'playstation'],
  ropa: ['ropa', 'zapatillas', 'zapatos', 'polo', 'camisa', 'pantalon', 'vestido', 'casaca', 'jean', 'medias', 'ternos', 'terno'],
  cuidado: ['peluqueria', 'corte de pelo', 'barberia', 'barbero', 'crema', 'shampoo', 'perfume', 'unas', 'manicure', 'spa', 'desodorante'],
  hogar: ['mueble', 'limpieza', 'detergente', 'ferreteria', 'sodimac', 'promart', 'foco', 'utensilios', 'casa', 'hogar', 'lavanderia'],
  familia: ['mama', 'papa', 'hermano', 'hermana', 'hijo', 'hija', 'familia', 'sobrino', 'sobrina', 'abuela', 'abuelo', 'suegra', 'suegro'],
  regalos: ['regalo', 'cumpleanos', 'obsequio', 'detalle', 'flores'],
  mascotas: ['perro', 'gato', 'veterinaria', 'veterinario', 'mascota', 'croquetas'],
};

const INCOME_WORDS = ['me pagaron', 'recibi', 'cobre', 'ingreso', 'me depositaron', 'me yapearon', 'me plinearon', 'me transfirieron', 'gane', 'vendi', 'me devolvieron'];
const CASH_WORDS = ['efectivo', 'debito', 'yape', 'yapee', 'plin', 'transferencia', 'transferi', 'cuenta'];
const SHARED_WORDS = ['compartido', 'a medias', 'mitad', 'entre los dos', 'entre ambos', 'para los dos', 'compartimos'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

function hasWord(text, w) {
  return new RegExp(`(^|\\s)${w.replace(/\s+/g, '\\s+')}(\\s|$)`).test(text);
}

// ---------- Intérprete ----------

export function parsePhrase(raw, state, todayStr = today()) {
  const original = String(raw || '').trim();
  let t = wordsToDigits(norm(original));
  const result = {
    text: original,
    type: 'expense',
    amount: null,
    categoryId: null,
    method: null,
    shared: false,
    myPct: Number(state.settings.defaultSharedPct ?? 50),
    paidBy: 'me',
    date: todayStr,
    note: '',
    project: null, // { projectId, itemId, name }
    found: [],
  };
  if (!t) return result;

  // Porcentaje ("mi parte 60%", "60 por ciento") antes del monto, para no confundirlos.
  const pct = t.match(/(\d{1,3})\s*(%|por ciento)/);
  if (pct) {
    result.myPct = Math.min(100, Number(pct[1]));
    t = t.replace(pct[0], ' ');
  }

  // Monto: "25", "25.50", "25,50", "s/ 25", "25 soles con 50", "1,300" / "1 300".
  const money = t.match(/(?:s\/\s*)?(\d{1,3}(?:[ ,]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?:\s*(?:soles|sol|lucas|cocos))?(?:\s+con\s+(\d{1,2})(?:\s*centimos)?)?/);
  if (money) {
    const whole = money[1].replace(/[ ,]/g, '');
    const cents = money[2] || money[3] || '';
    result.amount = round2(Number(`${whole}.${cents.padEnd(2, '0') || '00'}`));
    t = t.replace(money[0], ' ');
  }

  // Tipo
  if (INCOME_WORDS.some((w) => hasWord(t, w))) result.type = 'income';

  // Fecha
  if (hasWord(t, 'anteayer') || hasWord(t, 'antes de ayer')) result.date = shift(todayStr, -2);
  else if (hasWord(t, 'ayer')) result.date = shift(todayStr, -1);
  else {
    const wd = WEEKDAYS.findIndex((d) => hasWord(t, `el ${d}`) || hasWord(t, `este ${d}`));
    if (wd >= 0) {
      const cur = parseISO(todayStr).getDay();
      const back = (cur - wd + 7) % 7 || 7;
      result.date = shift(todayStr, -back);
    }
  }

  // Compartido / quién pagó
  const partner = norm(state.settings.partnerName || '');
  const mentionsPartner = partner && hasWord(t, partner);
  if (SHARED_WORDS.some((w) => hasWord(t, w)) || (mentionsPartner && /(^|\s)con\s/.test(t)) || pct) result.shared = true;
  if (partner && (hasWord(t, `pago ${partner}`) || hasWord(t, `${partner} pago`) || hasWord(t, `lo pago ${partner}`) || hasWord(t, `invito ${partner}`))) {
    result.shared = true;
    result.paidBy = 'partner';
  }

  // Forma de pago: tarjeta por nombre; "tarjeta de alimentos"; efectivo/yape/débito.
  if (hasWord(t, 'tarjeta de alimentos') || hasWord(t, 'alimentos') || hasWord(t, 'vale')) {
    result.method = 'vale';
  } else {
    const card = state.cards.find((c) => norm(c.name).split(' ').some((w) => w.length >= 3 && hasWord(t, w)));
    if (card) result.method = card.id;
    else if (hasWord(t, 'tarjeta') || hasWord(t, 'credito')) {
      if (state.cards.length === 1) result.method = state.cards[0].id;
    } else if (CASH_WORDS.some((w) => hasWord(t, w))) result.method = 'cash';
  }

  // ¿Es un pago pendiente de un proyecto? (ej. "pagué el bus de la boda 1300")
  if (result.type === 'expense') {
    let best = null;
    for (const { project, item } of pendingProjectItems(state)) {
      const tokens = norm(item.name).split(' ').filter((w) => w.length >= 3 && !['dulces', 'salados', 'nov'].includes(w));
      const hits = tokens.filter((w) => hasWord(t, w)).length;
      if (!hits) continue;
      const projWords = [norm(project.name), 'boda', 'matrimonio'].filter(Boolean);
      const sameAmount = result.amount != null && Math.abs(result.amount - Number(item.amount)) < 1;
      const mentionsProject = projWords.some((w) => hasWord(t, w));
      const score = hits + (sameAmount ? 2 : 0) + (mentionsProject ? 2 : 0);
      if ((sameAmount || mentionsProject) && (!best || score > best.score)) best = { score, project, item };
    }
    if (best) {
      result.project = { projectId: best.project.id, itemId: best.item.id, name: best.item.name, projectName: best.project.name, icon: best.project.icon };
      if (result.amount == null) result.amount = Number(best.item.amount);
    }
  }

  // Categoría: categorías propias por nombre, luego el diccionario.
  if (result.type === 'expense' && !result.project) {
    const custom = state.categories.find((c) => !(c.id in CATEGORY_WORDS) && c.name && hasWord(t, norm(c.name)));
    if (custom) result.categoryId = custom.id;
    else {
      let bestCat = null;
      for (const [id, words] of Object.entries(CATEGORY_WORDS)) {
        if (!state.categories.some((c) => c.id === id)) continue;
        const w = words.find((x) => hasWord(t, x));
        if (w && (!bestCat || w.length > bestCat.len)) bestCat = { id, len: w.length };
      }
      if (bestCat) result.categoryId = bestCat.id;
    }
  }

  result.note = cleanNote(original);
  return result;
}

function shift(iso, days) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

// Nota legible: la frase sin el monto ni muletillas.
const STOP = new Set(['gaste', 'pague', 'compre', 'hoy', 'ayer', 'anteayer', 'me', 'costo', 'por', 'de', 'del', 'en', 'el', 'la',
  'los', 'las', 'un', 'una', 'soles', 'sol', 'lucas', 'centimos', 's/', 'y', 'mi', 'parte', 'ciento', 'registra', 'anota', 'gasto',
  'le', 'a', 'al']);

function cleanNote(original) {
  const words = original.replace(/s\/\s*/gi, ' ').replace(/\ba\s+medias\b/gi, ' ').split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => {
    const n = norm(w).replace(/[.,%]/g, '');
    if (!n) return false;
    if (/^\d+$/.test(n)) return false;
    if (n in UNITS || n in TENS || n in HUNDREDS || n === 'mil') return false;
    return !STOP.has(n);
  });
  // Quita un "con" que haya quedado colgando al final o al inicio.
  while (kept.length && norm(kept[kept.length - 1]) === 'con') kept.pop();
  while (kept.length && norm(kept[0]) === 'con') kept.shift();
  let s = kept.join(' ').trim();
  if (s.length > 80) s = s.slice(0, 80);
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}
