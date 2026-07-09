# 💷 → 💶 Calculadora de sueldo UK & Gibraltar → €

Web app de una sola página (HTML + CSS + JavaScript vanilla, **sin frameworks, sin
build, sin CDN, sin dependencias**). Funciona abriendo `index.html` directamente
(`file://`), sin internet (salvo los entregables de red, que degradan sin romper).
Calcula el neto en **dos jurisdicciones**: **Gibraltar (GIBS 2025/26)** — la opción
por defecto — y **Reino Unido (PAYE Inglaterra 2026/27)**, con un comparador en vivo.

## Uso

1. Abre `index.html` en cualquier navegador moderno (doble clic).
2. Elige la **jurisdicción fiscal**: 🇬🇮 Gibraltar (GIBS) o 🇬🇧 Reino Unido.
3. Elige el **modo de entrada** (Anual / Mensual / Por hora) e introduce tu sueldo bruto.
4. La **tasa GBP → EUR** se obtiene **automáticamente** de fuente oficial (solo lectura).
5. Añade tus **gastos mensuales** (nombre + importe + moneda £/€).
6. Usa el **toggle ☀️🌗🌙** para cambiar entre tema claro, automático y oscuro.

Todo se **recalcula en el acto** al cambiar cualquier entrada.

## Modo Gibraltar (GIBS) — jurisdicción por defecto

Sistema **Gross Income Based (GIBS)**, año fiscal 2025/26 (1-jul-2025 a
30-jun-2026; el Budget 2026 del 7-jul-2026 no cambió el income tax, así que
sigue vigente en 2026/27). Constantes en `GIB_CONFIG` (`app.js`).

**Impuesto (GIBS) — sin personal allowance** (se tributa desde la primera libra):

| Assessable income > £25.000 | Tipo | | Assessable income ≤ £25.000 | Tipo |
|---|---|---|---|---|
| First £17,000 | 16% | | First £10,000 | 6% |
| £17,001 – £25,000 | 19% | | £10,001 – £17,000 | 20% |
| £25,001 – £40,000 | 25% | | Balance | 28% |
| £40,001 – £105,000 | 28% | | | |
| Balance (> £105,000) | 25% | | | |

**Social Insurance (empleado, clase ER, <60 años):** 10% del bruto con suelo
**£62,11/mes** y techo **£176,76/mes** (tabla oficial WEF 01/07/2025). No se
reduce por la pensión.

**Pensión bajo GIBS:** la aportación del empleado a approved pension schemes
reduce la renta sujeta al impuesto con un **máximo deducible de £1.500/año**
(EY Tax Facts 2025/26); la aportación completa sí sale del neto.

Fuentes: Income Tax Office (leaflet oficial de bandas), tabla oficial de Social
Insurance WEF 01/07/2025 (gibraltar.gov.gi), EY Tax Facts 2025/26, PwC WWTS.

### Ejemplo verificado — Gibraltar, £55.000 bruto anual

Contrastado contra **una nómina real de Gibraltar (jul 2026, tax code GIB)**,
sin datos personales:

| Concepto | Anual | Mensual |
|---:|---:|---:|
| Bruto | £55.000,00 | £4.583,33 |
| Impuesto (GIBS) | £12.190,00 | £1.015,83 |
| Social Insurance | £2.121,12 | £176,76 |
| **Neto** | **£40.688,88** | **£3.390,74** |

Detalle del impuesto: 17.000×16% + 8.000×19% + 15.000×25% + 15.000×28% =
2.720 + 1.520 + 3.750 + 4.200 = **£12.190/año**. SI: 10% × £4.583,33 = £458,33
→ capado al máximo oficial **£176,76/mes**.

> **Nota de redondeo:** la nómina real muestra £1.015,88 de impuesto y £3.390,69
> de neto mensual (dif. **±£0,05/mes**) por el redondeo de las tablas PAYE del
> software del empleador. La app calcula el valor exacto y **no** emula ese
> redondeo; cuando la jurisdicción es Gibraltar y el bruto anual es exactamente
> £55.000, muestra un **chip de verificación** con esta nota.

## Comparador UK ↔ Gibraltar

Bajo el desglose del bruto, una tarjeta muestra **para el mismo bruto (y misma
pensión)** el neto anual y mensual en ambas jurisdicciones, resalta en **verde
la ganadora** y destaca la **delta mensual** (ej.: con £55.000, en UK cobrarías
£147,38/mes más que en Gibraltar). Reactivo en vivo, accesible (`aria-live`),
presente en ambos temas y como línea en el resumen imprimible.

La jurisdicción elegida se **persiste** en `localStorage` (`ukcalc.v1`, campo
`jur`, default `GIB` — retrocompatible con estados guardados antiguos) y se
**serializa en el enlace compartible** (parámetro `?j=GIB|UK`; la URL tiene
prioridad sobre localStorage).

## Nuevas features (SUE-8 — Visual/UX)

### Entregable 1 — Gráfico del desglose
- Gráfico donut en SVG vanilla con segmentos: **Neto**, **impuesto**, **NI/SI** y **Pensión** (si aplica). Las etiquetas son dinámicas por jurisdicción (UK: *Income Tax* / *National Insurance* · GIB: *Impuesto (GIBS)* / *Social Insurance*).
- Leyenda con etiqueta, importe en GBP y porcentaje; colores coherentes con el tema activo.
- Se redibuja al recalcular y al cambiar el tamaño de la ventana.

### Entregable 2 — Histórico tasa GBP → EUR (90 días)
- Mini gráfico de líneas SVG con la evolución de los últimos ~90 días.
- Fuente: BCE vía Frankfurter (`https://api.frankfurter.dev/v1/{START}..{END}?base=GBP&symbols=EUR`).
- Ejes con min/max y fechas; marcador del valor actual; tooltips SVG nativos por punto.
- **Sin internet:** panel oculto; si hay internet pero la fuente falla, aviso discreto. La consola queda limpia.

### Entregable 3 — Resumen imprimible tipo nómina
- Botón **🖨️ Resumen imprimible** → `window.print()`.
- `@media print`: oculta controles/gráficos y muestra un payslip a una página con Bruto, Income Tax, NI, Pensión, Neto anual/mensual (£ y €), total de gastos, dinero libre, fecha y fuente de la tasa. Sin fondos oscuros.

### Entregable 4 — Persistencia en localStorage
- Guarda y restaura automáticamente: sueldo, modo de entrada, gastos (con su moneda) y preferencia de tema.
- Clave versionada `ukcalc.v1`. JSON corrupto/ausente → defaults sin romper.
- Botón **🗑️ Borrar datos guardados** limpia todo y resetea a valores por defecto.

### Entregable 5 — Modo oscuro / claro
- Tema mediante CSS custom properties. Por defecto respeta `prefers-color-scheme`.
- Toggle manual **☀️ / 🌗 / 🌙** (claro / auto / oscuro) persistido en localStorage.
- El tema se aplica **antes del primer render** (sin FOUC). Contraste AA en ambos temas.

### Entregable 6 — Compartir por URL
- Botón **🔗 Copiar enlace** serializa el estado (sueldo, modo, gastos, tema) en la query string con `URLSearchParams`.
- Al cargar, los parámetros de URL tienen **prioridad sobre localStorage**.
- Copia con `navigator.clipboard` + fallback `execCommand` + mensaje de confirmación.

### Entregable 7 — Pulido general
- Jerarquía visual, tipografía, tarjetas, espaciados y alineaciones revisados.
- Hover/focus visibles; `:focus-visible` con outline de alto contraste; navegación completa por teclado.
- `<label>` asociados, `aria-label`, `aria-checked`, `aria-live`, `role="alert"` donde aplica.
- Responsive impecable en móvil, tablet (iPad) y escritorio; sin desbordes. `prefers-reduced-motion`.
- Microinteracciones CSS (transiciones discretas). Iconos emoji inline (sin CDN).
- Validación de inputs con mensajes claros (vacíos, negativos, no numéricos).

### Entregable 8 — Entrada flexible
- Selector de periodicidad: **Anual**, **Mensual**, **Por hora**.
- Modo por hora: campos **Horas/semana** (por defecto 37,5) y **Semanas/año** (por defecto 52).
- El cálculo fiscal siempre opera sobre el **bruto anual derivado** (visible en un campo destacado cuando el modo no es anual).

## Novedades v3 (SUE-11 — donut interactivo + Insights IA + animaciones)

### Bloque A — Donut interactivo
- El desglose del bruto es **un único donut** SVG vanilla con cada segmento
  como sector anular (`<path>`): **Neto, Income Tax, NI y Pensión** (si aplica).
- **Centro:** Neto **mensual** en £, su equivalente en € y el % sobre el bruto.
  El importe se **reescala** solo para no desbordar el agujero.
- **Hover / touch / foco** resalta el segmento (se separa y atenúa el resto) y
  muestra un **tooltip** con concepto, £, € y % del bruto. Hit-testing real por
  forma SVG.
- **Leyenda interactiva**: botones enfocables y clicables, sincronizados con el
  donut en ambos sentidos.
- **Alternativa textual accesible**: `<desc>` del SVG + región `aria-live`
  con todo el desglose, navegable por teclado vía la leyenda.
- Vectorial → **nítido en retina** sin `devicePixelRatio`; se redibuja al
  recalcular y al cambiar el tamaño; colores AA del tema activo.
- **PDF**: al imprimir se inserta un *snapshot* del mismo donut + leyenda en la
  nómina (no es un segundo gráfico; se genera sólo para imprimir).

### Bloque B — Insights IA (Claude Code CLI · suscripción Max · sin API key)
Análisis financiero **opcional** generado por IA. La web **nunca** depende de
ello: si no hay `insights.json`, muestra un estado vacío con instrucciones.

1. En la web, pulsa **📤 Exportar datos para IA** → descarga `finance.json`
   (esquema `uk-salary-calculator/finance@1`). Colócalo junto a `index.html`.
2. Ejecuta el helper **local y opcional** (Node nativo, **sin npm**):

   ```
   node ai-insights.mjs finance.json
   ```

   Internamente invoca:

   ```
   claude -p "<PROMPT>" --output-format json --model sonnet --permission-mode dontAsk
   ```

   **Sin `--bare` y sin `ANTHROPIC_API_KEY`** → usa tu **suscripción Max**
   (no consume API de pago, **sin coste extra**). Escribe `insights.json`
   junto a `index.html` y resume por consola.
3. Recarga la web o pulsa **🔄 Recargar insights**: se renderizan con su
   severidad (`info` ℹ️ / `sugerencia` 💡 / `aviso` ⚠️) y la fecha de generación.

¿Sin terminal? **📋 Copiar prompt para Claude**: pega el prompt en Claude y
guarda su respuesta como `insights.json`.

**Limitaciones / notas:**
- `ai-insights.mjs` es un script Node **opcional** que **sólo** usa módulos
  nativos (`child_process`, `fs`, `path`, `url`). No tiene dependencias.
- Si `claude` no está instalado o falla, el script avisa con el **comando
  exacto** y el formato esperado, **sin romper nada**; `insights.json` no se
  sobrescribe.
- El parseo es tolerante (acepta vallas ```` ``` ````/texto extra) y se queda
  con 4–7 insights válidos.
- La web lee `insights.json` con `fetch`. Abierta como **`file://`** el
  navegador **bloquea** lecturas locales, así que la app **ni intenta** el
  `fetch` (consola limpia) y muestra el estado vacío con instrucciones:
  sírvela por HTTP para ver los insights (`python3 -m http.server` en esta
  carpeta). El resto de la calculadora funciona igual sin insights.
- Se incluye un `insights.json` de muestra (escenario £55.000 + gastos).
  Es regenerable y se puede borrar; la web degrada al estado vacío sin él.

### Bloque C — Más animaciones y feedback
- **Count-up** de todos los importes (£/€, neto, totales, dinero libre) con
  `requestAnimationFrame` (~420 ms, easeOutCubic). Re-apunta el destino en cada
  render: escribir rápido **no degrada** el recálculo en vivo.
- Transiciones del donut y de sus segmentos; resaltado al activar.
- **Alta/baja de gastos animada** + *bump* del total de gastos y del dinero
  libre al cambiar.
- **Skeleton/spinner** para la tasa y el histórico; estado **error/offline
  animado** (pulso) discreto.
- **Toasts** animados para copiar enlace, exportar, copiar prompt, insights,
  imprimir y guardar/borrar.
- **`prefers-reduced-motion` respetado en TODO**: con «reduce» los importes se
  fijan al instante, los toasts y micro-efectos no animan y el spinner queda
  como punto estático. (Regla CSS global + comprobación en JS.)

## Gastos en libras o euros

- Cada gasto se introduce en **£ GBP** o **€ EUR** mediante el selector de moneda.
- En la lista, cada gasto se muestra en su moneda original y su equivalente en la otra según la tasa actual.
- El total de gastos y el dinero libre se calculan normalizando a GBP base.
- Un gasto sin moneda explícita se trata como £ GBP (compatibilidad con datos existentes).

## Cálculo de impuestos (Inglaterra, año fiscal 2026/27)

Constantes editables al inicio de `app.js` (`TAX_CONFIG`). Tras el Autumn
Budget de nov-2025, los parámetros del empleado estándar quedan **congelados
hasta abril 2031** (idénticos a 2024/25):

- **Personal Allowance:** £12.570 al 0%; se reduce £1 por cada £2 de ingreso > £100.000 (cero a partir de £125.140).
- **Income Tax:** 20% de £12.571–£50.270 · 40% de £50.271–£125.140 · 45% por encima.
- **National Insurance (Class 1):** 8% entre £12.570 y £50.270 · 2% por encima. La pensión no reduce la base de NI.
- **Pensión (net pay):** el porcentaje introducido reduce la renta sujeta a Income Tax (no a NI).

Fuente: gov.uk "Rates and thresholds for employers 2026 to 2027".

## Tasa de cambio GBP → EUR

Automática, solo lectura. Cascada de obtención:

1. **Frankfurter** (datos oficiales del BCE, CORS abierto) — `https://api.frankfurter.dev/v1/latest?base=GBP&symbols=EUR` (con `frankfurter.app` como alternativa legacy)
2. **open.er-api** (sin clave) — `https://open.er-api.com/v6/latest/GBP`
3. **Constante incrustada** como último recurso sin conexión (`FX_FALLBACK` en `app.js`).

> El XML diario del BCE (`ecb.europa.eu/.../eurofxref-daily.xml`) **no** se consulta directamente desde el navegador: ese endpoint no envía cabeceras CORS, así que el navegador registraría siempre un error en consola aunque el JS capture la excepción. Frankfurter sirve exactamente los mismos datos de referencia del BCE con CORS abierto.

> **Limitación:** el BCE publica un tipo de referencia EUR/GBP por **día laborable** (~16:00 CET). No es tiempo real; la app muestra el **último tipo diario disponible** con su fecha.

Cada fuente tiene timeout corto (~3,5 s) y `try/catch` silencioso.

## Ejemplo UK (£55.000 bruto anual, tasa 1,17)

| Concepto            | GBP          | EUR (×1,17)  |
|--------------------:|-------------:|-------------:|
| Bruto anual         | £55.000      | €64.350      |
| Income Tax          | £9.432       | €11.035      |
| National Insurance  | £3.110,60    | €3.639       |
| **Neto anual**      | **£42.457,40** | **€49.675** |
| **Neto mensual**    | **£3.538,12**  | **€4.140**  |

Detalle: IT = 20% × £37.700 + 40% × £4.730 = £7.540 + £1.892 = **£9.432** | NI = 8% × £37.700 + 2% × £4.730 = £3.016 + £94,60 = **£3.110,60**

Con el mismo bruto, el comparador muestra: **UK £3.538,12/mes vs Gibraltar
£3.390,74/mes → +£147,38/mes a favor de UK**.

## Sistema de diseño PREMIUM (SUE-17)

Rediseño visual nivel keynote Apple, **sin romper ninguna funcionalidad** (SUE-1..SUE-15) y **100% vanilla** (abre en `file://`, consola limpia en todos los estados):

- **Tokens** en CSS custom properties: tipografía del sistema (SF Pro / Inter) con escala modular, **números tabulares** en todas las cifras, rejilla de 4 pt, paleta semántica Apple, sistema coherente de elevación/sombra/radio y curvas de easing (`cubic-bezier(0.32,0.72,0,1)`).
- **Modo oscuro real con profundidad**: negro Apple + superficies elevadas (no gris plano), realce superior de 1 px, contraste AA/AAA.
- **Micro-interacciones** (solo `transform`/`opacity`, 60 fps): entrada escalonada de paneles, barrido del donut, cross-fade de tema sin FOUC, count-up de cifras, toasts con resorte, shake en error, hover/active/`focus-visible`, skeleton/shimmer de carga, alta/baja de gastos animada.
- **`prefers-reduced-motion` siempre respetado** (estado final instantáneo, sin saltos de layout).
- Auto-auditoría reproducible: `PLAYWRIGHT_BROWSERS_PATH=… node qa/audit.mjs after` captura la matriz (4 viewports × claro/oscuro × estados clave) y verifica consola limpia + cálculos intactos.

## Segundo rosco — Presupuesto mensual (SUE-20)

Bajo la lista de gastos aparece una **tarjeta propia** *"Reparto de tu
presupuesto mensual"*, visualmente separada del donut de impuestos. Reparte
el **NETO mensual** (no el bruto) entre cada gasto y el dinero disponible.

- **Mismo motor de donut**, parametrizado por dataset (`renderDonut`): el
  rosco de impuestos reparte el BRUTO y el de presupuesto el NETO,
  reutilizando dibujo, leyenda, tooltip, foco por teclado y barrido —
  **sin duplicar lógica**.
- **Centro:** dinero **DISPONIBLE** mensual (£ + equivalente € + % del neto).
- **Segmentos:** uno por gasto (paleta cíclica) + **"Disponible"** destacado
  en **verde**; la leyenda lo resalta como fila final.
- **Déficit** (gastos > neto): segmento **"Déficit" en rojo**, aviso claro y
  porcentajes sobre el total de gastos (sin cifras absurdas > 100 %).
- Solo se muestra con **≥ 1 gasto**. Importes normalizados a GBP con la
  misma tasa que *Total gastos* / *Dinero libre*: **coincide numéricamente**.
- 2 columnas en iPad/escritorio (rosco izq. / leyenda der.), apilado en
  móvil. Tema claro/oscuro, accesible (alternativa textual + teclado),
  reactivo en vivo y reflejado en el resumen imprimible.
- Auditoría: `node qa/sue20-audit.mjs` (sin gastos / £+€ / déficit /
  claro+oscuro / móvil·iPad·escritorio, consola limpia, cifras cuadran).

## Estructura

```
uk-salary-calculator/
├── index.html       # estructura, FOUC-prevention, payslip, panel Insights IA
├── styles.css       # tokens/temas, sistema de diseño premium, responsive, @media print, animaciones
├── app.js           # lógica fiscal, FX, gastos, donut interactivo, animaciones, persistencia, URL
├── ai-insights.mjs  # helper LOCAL y OPCIONAL (Node nativo, sin npm) — Bloque B
├── insights.json    # salida de muestra de ai-insights.mjs (regenerable / borrable)
├── qa/audit.mjs     # auditoría visual Playwright (test-only, sin dependencia de la app)
└── README.md
```

> Cálculo orientativo. No constituye asesoramiento fiscal.
