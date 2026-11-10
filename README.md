# Mis Cuentas — app de finanzas personales (Fase 1)

App web instalable en el celular (PWA). Funciona sin internet y **los datos se guardan solo en el
celular** (no hay servidor ni cuentas). No usa librerías externas ni necesita compilar nada.

## Qué hace

- **Inicio:** “Hoy puedes gastar S/ X”, calculado así:
  `(ingresos − fijos − cuotas − pago extra a tarjetas − ahorro − lo ya gastado) ÷ días que quedan`.
  Avisa si vas más rápido de lo planeado y muestra los próximos pagos y en qué se va tu dinero.
- **Registrar (+):** gasto o ingreso extra en pocos segundos: monto, categoría, medio de pago y,
  si es compartido, quién pagó y tu parte.
- **Movimientos:** lista por día o por categoría, mes a mes. Toca un movimiento para editarlo.
- **Mi plan:** ingresos fijos, gastos fijos (marcar como pagados) y meta de ahorro.
- **Deudas:** tarjetas (deuda, uso de la línea, fechas de cierre y pago) y préstamos (cuotas
  que faltan, fecha en que terminas).
- **Compartidos:** cuánto te debe la otra persona o cuánto le debes, y botón para liquidar.
- **Ajustes:** nombres, categorías, respaldo (descargar/restaurar JSON) y exportar a CSV/Excel.

### Reglas de cálculo
- Comprar con tarjeta **es gastar**: cuenta el día de la compra. Pagar la tarjeta solo baja la deuda.
- En un gasto compartido solo **tu parte** cuenta en tu presupuesto.
- Un gasto fijo pendiente se reserva por su monto estimado; cuando lo pagas, cuenta el monto real.

## Probarla en la PC

```bash
node tools/dev-server.mjs
```

Abrir http://localhost:5173 (en Chrome, F12 → modo dispositivo para verla como celular).

## Instalarla en el celular

La instalación y el modo sin internet requieren **HTTPS**, así que hay que publicarla en un hosting
estático gratuito (por ejemplo GitHub Pages, Netlify o Cloudflare Pages) subiendo esta carpeta tal cual.
El código no contiene datos personales: cada persona que la abra tiene sus propios datos en su celular.

Después, en el celular:
- **Android (Chrome):** menú ⋮ → *Instalar app*.
- **iPhone (Safari):** Compartir → *Agregar a inicio*.

> Cada vez que cambies archivos, sube `VERSION` en `sw.js` para que el celular tome la versión nueva.

## Respaldo
Ajustes → *Descargar respaldo*. Guárdalo en un lugar **personal** (no en carpetas de la empresa).

## Estructura

```
index.html, manifest.webmanifest, sw.js   app instalable + modo sin internet
css/app.css                               estilos (claro/oscuro automático)
js/store.js                               datos y guardado local
js/calc.js                                cálculos del mes, deudas, compartidos
js/views/*.js                             pantallas
tools/                                    servidor local y generador de íconos
```

## Próximas fases
- **Fase 2:** presupuesto por categoría con alertas, gastos anuales (SOAT, seguros, matrícula)
  divididos por mes, recordatorios de pago.
- **Fase 3:** plan para salir de deudas (qué pagar primero), metas de ahorro, importar estados de
  cuenta del banco, sincronizar gastos compartidos entre dos celulares.
