// Respaldo: descargar o compartir el archivo, y recordar cuándo toca hacerlo.
import { getState, exportJSON, updateSettings } from './store.js';
import { today } from './format.js';

const DAY = 86400000;
const REMIND_EVERY_DAYS = 7;   // con respaldo previo
const FIRST_REMIND_DAYS = 3;   // sin ningún respaldo, desde el primer movimiento

export function backupFileName() {
  return `mis-cuentas-respaldo-${today()}.json`;
}

export function download(name, content, type) {
  const blob = new Blob([type === 'text/csv' ? '﻿' + content : content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function backupFile() {
  return new File([exportJSON()], backupFileName(), { type: 'application/json' });
}

// ¿El celular permite compartir archivos (Drive, WhatsApp, correo…)?
export function canShareBackup() {
  try {
    return !!navigator.canShare && navigator.canShare({ files: [backupFile()] });
  } catch {
    return false;
  }
}

function markDone() {
  updateSettings({ lastBackupAt: Date.now(), backupSnoozeUntil: 0 });
}

export function downloadBackup() {
  download(backupFileName(), exportJSON(), 'application/json');
  markDone();
}

// Comparte el archivo; si el usuario cancela, no se marca como hecho.
// Devuelve true si se compartió o descargó.
export async function shareBackup() {
  if (!canShareBackup()) {
    downloadBackup();
    return true;
  }
  try {
    await navigator.share({
      files: [backupFile()],
      title: 'Respaldo Mis Cuentas',
      text: 'Respaldo de mis datos de Mis Cuentas. Guárdalo en un lugar seguro.',
    });
    markDone();
    return true;
  } catch (e) {
    if (e?.name === 'AbortError') return false;
    downloadBackup();
    return true;
  }
}

export function daysSinceBackup() {
  const last = getState().settings.lastBackupAt;
  return last ? Math.floor((Date.now() - last) / DAY) : null;
}

// Toca recordar si hay datos y pasó el plazo desde el último respaldo
// (o desde el primer movimiento, si nunca se hizo uno).
export function backupDue() {
  const s = getState();
  if (!s.txs.length) return false;
  const now = Date.now();
  if ((s.settings.backupSnoozeUntil || 0) > now) return false;
  const last = s.settings.lastBackupAt;
  if (last) return now - last >= REMIND_EVERY_DAYS * DAY;
  const first = Math.min(...s.txs.map((t) => t.createdAt || now));
  return now - first >= FIRST_REMIND_DAYS * DAY;
}

export function snoozeBackup(days = 1) {
  updateSettings({ backupSnoozeUntil: Date.now() + days * DAY });
}
