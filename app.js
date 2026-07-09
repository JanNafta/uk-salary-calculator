'use strict';

/* =========================================================================
 *  CONSTANTES FISCALES EDITABLES — Inglaterra, año fiscal 2026/27
 *  (6-abr-2026 a 5-abr-2027; tras el Autumn Budget nov-2025 los parámetros
 *  del empleado estándar quedan CONGELADOS hasta abril 2031: mismos valores
 *  que 2024/25. Fuente: gov.uk "Rates and thresholds for employers 2026-27".)
 *  Cambia estos valores para actualizar el cálculo a otro año/región.
 *  (SUE-1..SUE-7 — sin cambios numéricos: el ejemplo £55.000 sigue verificado.)
 * ========================================================================= */
const TAX_CONFIG = {
  personalAllowance: 12570,        // Tramo libre de impuestos (0%)
  paTaper: {
    threshold: 100000,             // A partir de aquí se reduce la Personal Allowance
    lostPerPound: 0.5,             // Se pierde £1 de PA por cada £2 de ingreso (= 0.5)
  },
  // Tramos de Income Tax. La anchura del tramo básico (20%) es fija (£37.700)
  // y el umbral del tipo adicional (45%) se mide sobre el ingreso total.
  basicRate:        { rate: 0.20, bandWidth: 50270 - 12570 }, // £37.700 de renta imponible al 20%
  higherRate:       { rate: 0.40 },
  additionalRate:   { rate: 0.45, incomeThreshold: 125140 },
  // National Insurance — empleado, Class 1 (8% PT→UEL, 2% encima; sin cambios)
  ni: {
    primaryThreshold: 12570,       // No se paga NI por debajo de este sueldo
    upperEarningsLimit: 50270,     // Cambio de tipo principal a tipo reducido
    mainRate: 0.08,                // 8% entre primaryThreshold y upperEarningsLimit
    upperRate: 0.02,               // 2% por encima del upperEarningsLimit
  },
};

/* =========================================================================
 *  CONSTANTES FISCALES — GIBRALTAR, Gross Income Based System (GIBS)
 *  Año fiscal 2025/26 (1-jul-2025 a 30-jun-2026); el Budget 2026 (7-jul-2026)
 *  NO cambió el income tax, así que sigue vigente en 2026/27.
 *  Fuentes: Income Tax Office (leaflet oficial de bandas), tabla oficial
 *  "Social Insurance Contribution Class WEF 01/07/2025" (gibraltar.gov.gi),
 *  EY Tax Facts 2025/26 y PwC Worldwide Tax Summaries.
 *  En GIBS NO hay personal allowance: se tributa desde la primera libra.
 * ========================================================================= */
const GIB_CONFIG = {
  // Escala para assessable income > £25.000 ("balance @ 25%" por encima
  // de £105.000 según todas las fuentes vigentes 2024/25–2026/27).
  bandsHigh: [
    { width: 17000,    rate: 0.16 },   // first £17,000 @ 16%
    { width: 8000,     rate: 0.19 },   // next  £8,000  @ 19%
    { width: 15000,    rate: 0.25 },   // next  £15,000 @ 25%
    { width: 65000,    rate: 0.28 },   // next  £65,000 @ 28% (£40.001–£105.000)
    { width: Infinity, rate: 0.25 },   // balance @ 25%
  ],
  // Escala para assessable income ≤ £25.000.
  bandsLow: [
    { width: 10000,    rate: 0.06 },   // first £10,000 @ 6%
    { width: 7000,     rate: 0.20 },   // next  £7,000  @ 20%
    { width: Infinity, rate: 0.28 },   // balance @ 28%
  ],
  lowScaleMax: 25000,                  // hasta aquí aplica la escala reducida
  // Social Insurance del EMPLEADO (clase ER, <60 años): 10% del bruto con
  // suelo y techo MENSUALES oficiales. £40,79/semana × 52 ÷ 12 = £176,76/mes.
  si: {
    rate: 0.10,
    monthlyMin: 62.11,                 // mínimo mensual oficial
    monthlyMax: 176.76,                // máximo mensual oficial (cap efectivo)
  },
  // Deducción máxima anual por aportaciones del empleado a approved pension
  // schemes bajo GIBS (EY 2025/26). Limita cuánto reduce la pensión la base
  // del impuesto; la aportación completa sí sale del neto.
  pensionDeductionCap: 1500,
};

/* Etiquetas y metadatos por jurisdicción (tarjetas, donut, payslip, hero). */
const JUR_META = {
  GIB: {
    key: 'GIB',
    name: 'Gibraltar',
    flag: '🇬🇮',
    year: '2025/26',
    taxLabel: 'Impuesto (GIBS)',
    niLabel: 'Social Insurance',
    badge: 'GBP → EUR · Gibraltar 2025/26',
    psTitle: 'Resumen de nómina · Gibraltar 2025/26',
    region: 'Gibraltar (GIBS)',
    jurHint: 'GIBS: sin personal allowance, se tributa desde la primera libra. SI 10% con tope £176,76/mes.',
    pensionHint: 'Opcional. Reduce la renta sujeta al impuesto GIBS (deducción máx. £1.500/año). No reduce la base de Social Insurance.',
  },
  UK: {
    key: 'UK',
    name: 'Reino Unido',
    flag: '🇬🇧',
    year: '2026/27',
    taxLabel: 'Income Tax',
    niLabel: 'National Insurance',
    badge: 'GBP → EUR · UK 2026/27',
    psTitle: 'Resumen de nómina · Reino Unido 2026/27',
    region: 'Inglaterra',
    jurHint: 'PAYE Inglaterra: personal allowance £12.570 (0%), luego 20% / 40% / 45% + National Insurance.',
    pensionHint: 'Opcional. Reduce la renta sujeta a Income Tax (esquema net pay). No reduce la base de NI.',
  },
};

// Metadatos de la jurisdicción ACTIVA (STATE.jur se define más abajo; esta
// función solo se invoca en runtime, cuando el estado ya existe).
function jurMeta() { return JUR_META[STATE.jur] || JUR_META.GIB; }

/* =========================================================================
 *  TIPO DE CAMBIO GBP → EUR — AUTOMÁTICO, SOLO LECTURA
 *  SUE-15: el XML diario del BCE (ecb.europa.eu/.../eurofxref-daily.xml)
 *  NO envía cabeceras CORS, así que el navegador registra SIEMPRE un error
 *  de CORS + net::ERR_FAILED en consola aunque el JS capture la excepción
 *  (los fallos CORS/red no se pueden silenciar desde JS). Frankfurter sirve
 *  exactamente los mismos datos de referencia del BCE con CORS abierto, por
 *  lo que la cascada del navegador es Frankfurter → open.er-api → constante.
 *  No reintroducir un fetch directo al XML del BCE desde el navegador.
 * ========================================================================= */
const FRANKFURTER_URLS = [
  'https://api.frankfurter.dev/v1/latest?base=GBP&symbols=EUR', // endpoint nuevo
  'https://api.frankfurter.app/latest?base=GBP&symbols=EUR',    // alternativa legacy
];
const ER_API_URL = 'https://open.er-api.com/v6/latest/GBP';
const FX_API_TIMEOUT_MS = 3500;

// ÚLTIMO recurso sin conexión. Valor aproximado revisado en la fecha indicada.
const FX_FALLBACK = { rate: 1.17, date: '2025-05-15' };

// Entregable 2: histórico 90 días. Reutiliza Frankfurter (= datos del BCE).
const FRANKFURTER_HISTORY = 'https://api.frankfurter.dev/v1/{START}..{END}?base=GBP&symbols=EUR';
const FX_HISTORY_DAYS = 90;

/* ========================== CÁLCULO DE IMPUESTOS ========================= */

function personalAllowance(gross) {
  let pa = TAX_CONFIG.personalAllowance;
  const { threshold, lostPerPound } = TAX_CONFIG.paTaper;
  if (gross > threshold) {
    pa = Math.max(0, pa - (gross - threshold) * lostPerPound);
  }
  return pa;
}

function incomeTax(gross) {
  const pa = personalAllowance(gross);
  const taxable = Math.max(0, gross - pa);

  const basicBand = TAX_CONFIG.basicRate.bandWidth;                 // 37.700
  // Renta imponible que marca el inicio del tipo adicional (45%):
  // el umbral del 45% es de ingreso total (£125.140), así que en renta
  // imponible equivale a (125.140 - PA).
  const additionalTaxablePoint =
    Math.max(basicBand, TAX_CONFIG.additionalRate.incomeThreshold - pa);

  const at20 = Math.min(taxable, basicBand);
  const at40 = Math.max(0, Math.min(taxable, additionalTaxablePoint) - basicBand);
  const at45 = Math.max(0, taxable - additionalTaxablePoint);

  return (
    at20 * TAX_CONFIG.basicRate.rate +
    at40 * TAX_CONFIG.higherRate.rate +
    at45 * TAX_CONFIG.additionalRate.rate
  );
}

function nationalInsurance(gross) {
  const { primaryThreshold, upperEarningsLimit, mainRate, upperRate } = TAX_CONFIG.ni;
  let ni = 0;
  if (gross > primaryThreshold) {
    const main = Math.min(gross, upperEarningsLimit) - primaryThreshold;
    ni += Math.max(0, main) * mainRate;
  }
  if (gross > upperEarningsLimit) {
    ni += (gross - upperEarningsLimit) * upperRate;
  }
  return ni;
}

/* ==================== CÁLCULO DE IMPUESTOS — GIBRALTAR ==================== */

// Impuesto GIBS sobre el assessable income anual. Dos escalas oficiales:
// reducida hasta £25.000 y estándar por encima (en £25.000 exactos ambas
// coinciden: £4.240). Sin personal allowance: tributa desde la primera libra.
// La ESCALA se elige por el GROSS assessable income (EY Tax Facts 2025/26)
// aunque las bandas se apliquen a la base ya minorada por deducciones;
// `scaleIncome` permite pasar ese bruto (por defecto, la propia base).
function gibIncomeTax(taxable, scaleIncome) {
  if (!(taxable > 0)) return 0;
  const forScale = Number.isFinite(scaleIncome) ? scaleIncome : taxable;
  const bands = forScale > GIB_CONFIG.lowScaleMax
    ? GIB_CONFIG.bandsHigh : GIB_CONFIG.bandsLow;
  let tax = 0;
  let remaining = taxable;
  for (const b of bands) {
    const slice = Math.min(remaining, b.width);
    tax += slice * b.rate;
    remaining -= slice;
    if (remaining <= 0) break;
  }
  return tax;
}

// Social Insurance del empleado (Gibraltar, clase ER): 10% del bruto MENSUAL
// con suelo £62,11 y techo £176,76 al mes (tabla oficial WEF 01/07/2025).
// Devuelve el importe ANUAL. Verificado contra nómina real: £55.000/año →
// £176,76/mes = £2.121,12/año (exacto al penique).
function gibSocialInsurance(grossAnnual) {
  if (!(grossAnnual > 0)) return 0;
  const { rate, monthlyMin, monthlyMax } = GIB_CONFIG.si;
  const monthly = Math.min(Math.max((grossAnnual / 12) * rate, monthlyMin), monthlyMax);
  return monthly * 12;
}

/* Motor unificado: bruto anual + % pensión + jurisdicción → deducciones y
 * neto. Función PURA (la usan render(), el comparador UK↔GIB, el payslip y
 * el export de finanzas). La pensión (esquema net pay) reduce la renta
 * sujeta a income tax en ambas jurisdicciones — en GIBS con el tope oficial
 * de £1.500/año deducibles — y NUNCA la base de NI/SI. */
function computeNet(grossAnnual, pensionPct, jur) {
  const gross = Number.isFinite(grossAnnual) && grossAnnual > 0 ? grossAnnual : 0;
  const pct = Math.min(100, Math.max(0, Number.isFinite(pensionPct) ? pensionPct : 0));
  const pensionAmount = gross * (pct / 100);
  let tax, ni;
  if (jur === 'GIB') {
    const deductible = Math.min(pensionAmount, GIB_CONFIG.pensionDeductionCap);
    tax = gibIncomeTax(Math.max(0, gross - deductible), gross);
    ni = gibSocialInsurance(gross);              // SI sobre bruto completo
  } else {
    tax = incomeTax(Math.max(0, gross - pensionAmount));
    ni = nationalInsurance(gross);               // NI sobre bruto completo
  }
  const netAnnual = Math.max(0, gross - pensionAmount - tax - ni);
  return { pensionAmount, tax, ni, netAnnual, netMonthly: netAnnual / 12 };
}

/* ============================== FORMATO ================================= */

const fmtGBP = new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
});
const fmtEUR = new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const fmtGBP2 = new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const fmtEUR2 = new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/* ===================== ESTADO + PERSISTENCIA (entregable 4) ============== *
 *  Clave namespaced versionada. JSON corrupto/ausente → defaults sin romper.
 * ----------------------------------------------------------------------- */
const STORAGE_KEY = 'ukcalc.v1';

const DEFAULTS = {
  grossInput: '55000',   // valor crudo del input según el modo activo
  mode: 'annual',        // 'annual' | 'monthly' | 'hourly'
  hpw: 37.5,             // horas / semana (modo por hora)
  wpy: 52,               // semanas / año  (modo por hora)
  pension: 0,            // % del bruto destinado a pensión
  jur: 'GIB',            // jurisdicción fiscal: 'GIB' | 'UK' (default Gibraltar;
                         // estados guardados sin este campo → 'GIB', retrocompatible)
  theme: 'auto',         // 'light' | 'dark' | 'auto'
  expenses: [],          // [{ id, name, amount, currency }]
};

let STATE = Object.assign({}, DEFAULTS);
let fxRate = FX_FALLBACK.rate;     // tasa GBP → EUR vigente (solo lectura)

function safeStorage() {
  try {
    const k = '__ukcalc_probe__';
    localStorage.setItem(k, '1'); localStorage.removeItem(k);
    return localStorage;
  } catch (e) { return null; }   // file:// muy restrictivo o modo privado
}
const LS = safeStorage();

function loadStored() {
  if (!LS) return {};
  try {
    const raw = LS.getItem(STORAGE_KEY);
    if (!raw) return {};
    const s = JSON.parse(raw);
    return (s && typeof s === 'object') ? s : {};
  } catch (e) { return {}; }       // corrupto → defaults
}

let persistTimer = null;
function persist() {
  if (!LS) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      LS.setItem(STORAGE_KEY, JSON.stringify({
        v: 1,
        grossInput: STATE.grossInput,
        mode: STATE.mode,
        hpw: STATE.hpw,
        wpy: STATE.wpy,
        pension: STATE.pension,
        jur: STATE.jur,
        theme: STATE.theme,
        expenses: STATE.expenses,
      }));
    } catch (e) { /* cuota llena / bloqueado → ignora, no rompe */ }
  }, 250);
}

/* ===================== ESTADO COMPARTIDO POR URL (entregable 6) ========== *
 *  Los parámetros de URL tienen PRIORIDAD sobre localStorage.
 * ----------------------------------------------------------------------- */
function readUrlState() {
  const out = {};
  let q;
  try { q = new URLSearchParams(location.search); } catch (e) { return out; }
  if (!q || ![...q.keys()].length) return out;
  if (q.has('g')) out.grossInput = String(q.get('g'));
  const m = q.get('m');
  if (m === 'annual' || m === 'monthly' || m === 'hourly') out.mode = m;
  if (q.has('hpw')) { const v = parseFloat(q.get('hpw')); if (Number.isFinite(v) && v > 0) out.hpw = v; }
  if (q.has('wpy')) { const v = parseFloat(q.get('wpy')); if (Number.isFinite(v) && v > 0) out.wpy = v; }
  if (q.has('p'))   { const v = parseFloat(q.get('p'));   if (Number.isFinite(v) && v >= 0) out.pension = Math.min(100, v); }
  const j = q.get('j');                          // jurisdicción fiscal
  if (j === 'GIB' || j === 'UK') out.jur = j;
  // Enlaces compartidos ANTERIORES al modo Gibraltar: llevan estado fiscal
  // ('g' siempre presente en buildShareUrl) pero no 'j'. Se generaron cuando
  // solo existía UK → se abren en UK para que quien los reciba vea las
  // mismas cifras que vio quien compartió.
  else if (q.has('g')) out.jur = 'UK';
  const t = q.get('t');
  if (t === 'light' || t === 'dark' || t === 'auto') out.theme = t;
  if (q.has('e')) {
    try {
      const arr = JSON.parse(q.get('e'));
      if (Array.isArray(arr)) out.expenses = arr.map(normalizeExpense).filter(Boolean);
    } catch (e) { /* expenses corruptos en URL → se ignoran */ }
  }
  return out;
}

function normalizeExpense(e) {
  if (!e || typeof e !== 'object') return null;
  const name = String(e.name == null ? '' : e.name).slice(0, 60).trim();
  const amount = Number(e.amount);
  if (!name || !Number.isFinite(amount) || amount < 0) return null;
  const currency = e.currency === 'EUR' ? 'EUR' : 'GBP';
  return { id: Date.now() + Math.random(), name, amount, currency };
}

function buildShareUrl() {
  const q = new URLSearchParams();
  q.set('g', STATE.grossInput);
  q.set('m', STATE.mode);
  if (STATE.mode === 'hourly') { q.set('hpw', String(STATE.hpw)); q.set('wpy', String(STATE.wpy)); }
  if (STATE.pension > 0) q.set('p', String(STATE.pension));
  q.set('j', STATE.jur);                         // jurisdicción fiscal
  q.set('t', STATE.theme);
  if (STATE.expenses.length) {
    q.set('e', JSON.stringify(STATE.expenses.map((x) => ({
      name: x.name, amount: x.amount, currency: x.currency,
    }))));
  }
  const base = location.origin && location.origin !== 'null'
    ? location.origin + location.pathname
    : location.href.split('?')[0].split('#')[0];
  return base + '?' + q.toString();
}

/* ==================== DERIVADOS: gasto, bruto anual ===================== */

function expCurrency(e) { return e && e.currency === 'EUR' ? 'EUR' : 'GBP'; }

function expenseInGBP(e, rate) {
  if (expCurrency(e) === 'EUR') return rate > 0 ? e.amount / rate : 0;
  return e.amount;
}

function expDisplay(e, rate) {
  if (expCurrency(e) === 'EUR') {
    const gbpEq = rate > 0 ? e.amount / rate : 0;
    return { main: fmtEUR2.format(e.amount), ref: fmtGBP2.format(gbpEq) };
  }
  return { main: fmtGBP2.format(e.amount), ref: fmtEUR2.format(e.amount * rate) };
}

// Entregable 8: el cálculo fiscal es SIEMPRE sobre el bruto ANUAL derivado.
function annualGross() {
  const raw = parseFloat(STATE.grossInput);
  const v = Number.isFinite(raw) && raw >= 0 ? raw : 0;
  if (STATE.mode === 'monthly') return v * 12;
  if (STATE.mode === 'hourly') {
    const h = Number.isFinite(STATE.hpw) && STATE.hpw > 0 ? STATE.hpw : 0;
    const w = Number.isFinite(STATE.wpy) && STATE.wpy > 0 ? STATE.wpy : 0;
    return v * h * w;
  }
  return v; // annual
}

/* =============================== DOM =================================== */

const $ = (id) => document.getElementById(id);
const elGross = $('gross');
const elMode = $('mode');
const elHpw = $('hpw');
const elWpy = $('wpy');
const elPension = $('pension');
const elRateValue = $('rate-value');
const elRateStatus = $('rate-status');
const elRateRefresh = $('rate-refresh');
const elGrossLabel = $('gross-label');
const elGrossError = $('gross-error');
const elDerivedField = $('derived-field');
const elDerivedGross = $('derived-gross');
const elActionMsg = $('action-msg');

const MODE_META = {
  annual:  { label: 'Sueldo bruto anual (GBP)',   step: '100' },
  monthly: { label: 'Sueldo bruto mensual (GBP)', step: '50'  },
  hourly:  { label: 'Tarifa bruta por hora (GBP)', step: '0.5' },
};

/* ============================ RENDERIZADO ============================== */

function showError(el, inputWrapEl, msg) {
  if (msg) {
    el.textContent = msg; el.hidden = false;
    if (inputWrapEl) inputWrapEl.classList.add('invalid');
  } else {
    el.textContent = ''; el.hidden = true;
    if (inputWrapEl) inputWrapEl.classList.remove('invalid');
  }
}

function render() {
  const gross = annualGross();

  // Validación visible (entregable 7) sin romper el cálculo.
  const rawGross = elGross.value.trim();
  showError(
    elGrossError, elGross.closest('.input-wrap'),
    rawGross !== '' && !(parseFloat(rawGross) >= 0)
      ? 'Introduce un número válido (≥ 0).' : ''
  );

  const rate = fxRate;
  // Motor unificado por jurisdicción (GIBS/UK): pensión net pay, SI/NI sobre
  // el bruto completo. Se computan AMBAS jurisdicciones para el comparador.
  const resGib = computeNet(gross, STATE.pension, 'GIB');
  const resUk = computeNet(gross, STATE.pension, 'UK');
  const res = STATE.jur === 'GIB' ? resGib : resUk;
  const { pensionAmount, tax, ni, netAnnual, netMonthly } = res;

  const expTotal = STATE.expenses.reduce((s, e) => s + expenseInGBP(e, rate), 0);
  const freeMonthly = netMonthly - expTotal;

  const g = (v) => fmtGBP.format(v);
  const e = (v) => fmtEUR.format(v * rate);
  // Bloque C: count-up con rAF. El tween interpola sobre el importe en GBP;
  // el formateador €multiplica por la tasa. No degrada el recálculo en vivo
  // (cada render re-apunta el destino; respeta prefers-reduced-motion).
  const tg = (id, v) => tweenNumber($(id), v, (x) => fmtGBP.format(x));
  const te = (id, v) => tweenNumber($(id), v, (x) => fmtEUR.format(x * rate));

  tg('r-gross-gbp', gross);   te('r-gross-eur', gross);
  tg('r-tax-gbp', tax);       te('r-tax-eur', tax);
  tg('r-ni-gbp', ni);         te('r-ni-eur', ni);

  const elPenCard = $('card-pension');
  if (pensionAmount > 0) {
    elPenCard.hidden = false;
    tg('r-pen-gbp', pensionAmount);
    te('r-pen-eur', pensionAmount);
  } else {
    elPenCard.hidden = true;
  }

  tg('r-net-gbp', netAnnual);   te('r-net-eur', netAnnual);
  tg('r-netm-gbp', netMonthly); te('r-netm-eur', netMonthly);
  tg('r-exp-gbp', expTotal);    te('r-exp-eur', expTotal);
  tg('r-free-gbp', freeMonthly); te('r-free-eur', freeMonthly);

  // Bruto anual calculado visible cuando el modo no es anual (entregable 8).
  if (STATE.mode === 'annual') {
    elDerivedField.hidden = true;
  } else {
    elDerivedField.hidden = false;
    elDerivedGross.textContent = g(gross) + ' (' + e(gross) + ')';
  }

  drawDonut({ gross, net: netAnnual, tax, ni, pension: pensionAmount, netMonthly, rate });

  // Rosco "Presupuesto mensual" (NETO): tarjeta visible solo con >=1 gasto.
  // Importes normalizados a GBP con la MISMA tasa que "Total gastos"/"Dinero
  // libre" (expenseInGBP), por lo que coincide numéricamente con esas cifras.
  const bdgCard = $('bdg-card');
  if (bdgCard) {
    const hasExp = STATE.expenses.length > 0;
    bdgCard.hidden = !hasExp;
    if (hasExp) {
      drawBudgetDonut({
        netMonthly,
        expenses: STATE.expenses.map((e) => ({
          name: e.name, gbp: expenseInGBP(e, rate),
        })),
        expTotal,
        available: freeMonthly,
        rate,
      });
    }
  }

  // Comparador UK ↔ Gibraltar (mismo bruto y pensión) + chip de verificación
  // contra nómina real (solo GIB con bruto anual derivado exacto de £55.000).
  updateCompare(gross, resUk, resGib, rate);
  const chip = $('verify-chip');
  if (chip) chip.hidden = !(STATE.jur === 'GIB' && Math.abs(gross - 55000) < 0.005);

  fillPayslip({ gross, tax, ni, pensionAmount, netAnnual, netMonthly, expTotal, freeMonthly, rate, resUk, resGib });
}

/* --------------- Comparador UK ↔ Gibraltar (mismo bruto) ---------------- *
 *  Muestra lado a lado el neto anual/mensual en ambas jurisdicciones y la
 *  delta mensual destacada; la jurisdicción ganadora se colorea en verde.
 *  Reactivo en vivo (se llama desde render()) y reflejado en el payslip.
 * ----------------------------------------------------------------------- */
function updateCompare(gross, resUk, resGib, rate) {
  const box = $('compare');
  if (!box) return;
  if (!(gross > 0)) { box.hidden = true; return; }
  box.hidden = false;

  const tg = (id, v) => tweenNumber($(id), v, (x) => fmtGBP.format(x));
  tg('cmp-gib-m', resGib.netMonthly);
  tg('cmp-gib-y', resGib.netAnnual);
  tg('cmp-uk-m', resUk.netMonthly);
  tg('cmp-uk-y', resUk.netAnnual);

  const dm = resGib.netMonthly - resUk.netMonthly;   // >0 → gana Gibraltar
  const colGib = $('cmp-col-gib');
  const colUk = $('cmp-col-uk');
  const tie = Math.abs(dm) < 0.005;
  if (colGib) colGib.classList.toggle('is-winner', !tie && dm > 0);
  if (colUk) colUk.classList.toggle('is-winner', !tie && dm < 0);

  const delta = $('cmp-delta');
  if (!delta) return;
  delta.classList.toggle('is-tie', tie);
  if (tie) {
    delta.textContent = 'Con este bruto cobrarías prácticamente lo mismo en ambas jurisdicciones.';
    return;
  }
  const winner = dm > 0 ? 'Gibraltar' : 'UK';
  const loser = dm > 0 ? 'UK' : 'Gibraltar';
  const absM = Math.abs(dm);
  delta.innerHTML = '';
  delta.append('Con este bruto, en ');
  const w = document.createElement('strong');
  w.className = 'cmp-winner';
  w.textContent = winner;
  delta.append(w, ' cobrarías ');
  const amt = document.createElement('strong');
  amt.className = 'cmp-winner';
  amt.textContent = fmtGBP2.format(absM) + '/mes';
  delta.append(amt, ' más que en ' + loser + ' (' +
    fmtGBP.format(absM * 12) + '/año).');
}

/* ------------------- Bloque A: donut interactivo ----------------------- *
 *  SVG vanilla. Cada segmento es un <path> de sector anular: hit-testing
 *  real, foco por teclado, leyenda sincronizada, tooltip y alternativa
 *  textual (<desc> + región sr-only). Vectorial → nítido en retina sin
 *  devicePixelRatio. Se redibuja en recálculo y resize. Colores AA del tema.
 * ----------------------------------------------------------------------- */
const SVGNS = 'http://www.w3.org/2000/svg';
const DONUT_CX = 110, DONUT_CY = 110;
const DONUT_RO = 96, DONUT_RI = 60;          // radios exterior / interior
// Config del rosco de impuestos (reparte el BRUTO anual). Los nombres de
// "tax"/"ni" son dinámicos por jurisdicción (Income Tax/NI en UK, Impuesto
// GIBS/Social Insurance en Gibraltar): se resuelven en drawDonut().
const DONUT_SEGS = [
  { key: 'net',     name: 'Neto',        color: 'var(--net)' },
  { key: 'tax',     name: 'Income Tax',  color: 'var(--tax)' },
  { key: 'ni',      name: 'NI',          color: 'var(--ni)' },
  { key: 'pension', name: 'Pensión',     color: 'var(--pension)' },
];
// Paleta cíclica para los gastos del rosco "Presupuesto mensual" (NETO).
// Verde/rojo quedan reservados para "Disponible"/"Déficit".
const BUDGET_PALETTE = [
  'var(--bdg-1)', 'var(--bdg-2)', 'var(--bdg-3)', 'var(--bdg-4)',
  'var(--bdg-5)', 'var(--bdg-6)', 'var(--bdg-7)', 'var(--bdg-8)',
];

function polarPt(r, deg) {
  const a = (deg - 90) * Math.PI / 180;        // 0° = arriba, sentido horario
  return [DONUT_CX + r * Math.cos(a), DONUT_CY + r * Math.sin(a)];
}
function rp(n) { return Math.round(n * 1000) / 1000; }
function annularPath(rO, rI, a0, a1) {
  const large = (a1 - a0) % 360 > 180 ? 1 : 0;
  const [x1, y1] = polarPt(rO, a0);
  const [x2, y2] = polarPt(rO, a1);
  const [x3, y3] = polarPt(rI, a1);
  const [x4, y4] = polarPt(rI, a0);
  return 'M' + rp(x1) + ' ' + rp(y1) +
    ' A' + rO + ' ' + rO + ' 0 ' + large + ' 1 ' + rp(x2) + ' ' + rp(y2) +
    ' L' + rp(x3) + ' ' + rp(y3) +
    ' A' + rI + ' ' + rI + ' 0 ' + large + ' 0 ' + rp(x4) + ' ' + rp(y4) + ' Z';
}

/* ----- Motor de rosco PARAMETRIZADO POR DATASET (reusado por ambos) ------ *
 *  Una sola implementación de dibujo/leyenda/tooltip/teclado/sweep. Cada
 *  instancia guarda su propio estado (segEls/swept/active/pinned) y apunta
 *  a sus propios nodos del DOM. El rosco de impuestos reparte el BRUTO; el
 *  de presupuesto reparte el NETO mensual: misma estética, distinto dataset.
 * ----------------------------------------------------------------------- */
function createDonut(o) {
  // o: { svgId, wrapId, segsId, centerId, centerEurId, centerSubId,
  //      tipId, legendId, descId, srId }
  return {
    o,
    segEls: [],
    swept: false,
    activeKey: null,
    // Segmento "fijado" por clic en la leyenda, independiente del resaltado
    // transitorio por hover/foco (activeKey), igual que el patrón de SUE-14.
    pinnedKey: null,
  };
}

function fitCenterText(centerId) {
  // Reescala el importe central para que nunca desborde el agujero.
  const el = document.getElementById(centerId);
  if (!el || !el.getComputedTextLength) return;
  let size = 25;
  el.style.fontSize = size + 'px';
  const maxW = DONUT_RI * 2 - 12;
  try {
    let w = el.getComputedTextLength();
    while (w > maxW && size > 12) {
      size -= 1;
      el.style.fontSize = size + 'px';
      w = el.getComputedTextLength();
    }
  } catch (_) { /* sin layout (panel oculto) → tamaño por defecto */ }
}

function showTipFor(D, it, src) {
  const elTip = document.getElementById(D.o.tipId);
  if (!elTip) return;
  elTip.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = it.seg.name;
  const l1 = document.createElement('span');
  l1.textContent = fmtGBP.format(it.gbp) + '  ·  ' + fmtEUR.format(it.eur);
  const l2 = document.createElement('span');
  l2.className = 'tip-pct';
  l2.textContent = it.frac >= 0 ? (it.frac * 100).toFixed(1) + '% ' + it.pctSuffix : '';
  elTip.append(strong, l1, l2);
  elTip.hidden = false;
  const svg = document.getElementById(D.o.svgId);
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  let cx, cy;
  if (src && typeof src.clientX === 'number' && src.clientX) {
    cx = src.clientX - rect.left;
    cy = src.clientY - rect.top;
  } else {                                   // foco/teclado → centroide del sector
    const mid = (it.a0 + it.a1) / 2;
    const [px, py] = polarPt((DONUT_RO + DONUT_RI) / 2, mid);
    cx = (px / 220) * rect.width;
    cy = (py / 220) * rect.height;
  }
  elTip.style.left = cx + 'px';
  elTip.style.top = cy + 'px';
}
function hideTip(D) {
  const elTip = document.getElementById(D.o.tipId);
  if (elTip) elTip.hidden = true;
}

function setDonutActive(D, key, src) {
  D.activeKey = key;
  for (const it of D.segEls) {
    const on = it.seg.key === key;
    it.path.classList.toggle('is-active', on);
    it.path.classList.toggle('is-dim', key != null && !on);
    if (it.btn) {
      it.btn.classList.toggle('is-active', on);
      it.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  if (key == null) { hideTip(D); return; }
  const it = D.segEls.find((x) => x.seg.key === key);
  if (it) showTipFor(D, it, src);
}

/* Dibuja una instancia de rosco a partir de un dataset normalizado:
 *  m = { empty, emptyCenter:{main,eur,sub}, emptyDesc, emptyLegend,
 *        center:{main,eur,sub}, total, rate, segs:[{key,name,color,value}],
 *        pctSuffix, descPrefix, srPrefix } */
function renderDonut(D, m) {
  const segG = document.getElementById(D.o.segsId);
  const legend = document.getElementById(D.o.legendId);
  const desc = document.getElementById(D.o.descId);
  const sr = D.o.srId ? document.getElementById(D.o.srId) : null;
  if (!segG || !legend) return;
  segG.textContent = '';
  legend.textContent = '';
  D.segEls = [];
  D.activeKey = null;
  D.pinnedKey = null;

  const elC = document.getElementById(D.o.centerId);
  const elCE = document.getElementById(D.o.centerEurId);
  const elCS = document.getElementById(D.o.centerSubId);

  if (m.empty) {
    const ring = document.createElementNS(SVGNS, 'circle');
    ring.setAttribute('cx', String(DONUT_CX));
    ring.setAttribute('cy', String(DONUT_CY));
    ring.setAttribute('r', String((DONUT_RO + DONUT_RI) / 2));
    ring.setAttribute('fill', 'none');
    ring.style.stroke = 'var(--line)';
    ring.setAttribute('stroke-width', String(DONUT_RO - DONUT_RI));
    segG.appendChild(ring);
    if (elC) elC.textContent = m.emptyCenter.main;
    if (elCE) elCE.textContent = m.emptyCenter.eur || '';
    if (elCS) elCS.textContent = m.emptyCenter.sub;
    if (desc) desc.textContent = m.emptyDesc;
    if (sr) sr.textContent = '';
    const li = document.createElement('li');
    li.className = 'lg-empty';
    li.textContent = m.emptyLegend;
    legend.appendChild(li);
    hideTip(D);
    fitCenterText(D.o.centerId);
    return;
  }

  if (elC) elC.textContent = m.center.main;
  if (elCE) elCE.textContent = m.center.eur || '';
  if (elCS) elCS.textContent = m.center.sub;

  const total = m.total > 0 ? m.total : 0;
  let cumDeg = 0;
  const descParts = [];
  for (const s of m.segs) {
    const val = Math.max(0, s.value || 0);
    if (val <= 0) continue;
    const frac = total > 0 ? val / total : 0;
    const a0 = cumDeg;
    const a1 = cumDeg + frac * 360;
    cumDeg = a1;

    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('class', 'seg-arc');
    if (a1 - a0 >= 359.999) {                 // 100% → anillo en dos mitades
      path.setAttribute('d',
        annularPath(DONUT_RO, DONUT_RI, 0, 180) + ' ' +
        annularPath(DONUT_RO, DONUT_RI, 180, 359.999));
    } else {
      path.setAttribute('d', annularPath(DONUT_RO, DONUT_RI, a0, a1));
    }
    path.style.fill = s.color;
    path.setAttribute('tabindex', '0');
    path.setAttribute('role', 'button');
    const eurVal = val * m.rate;
    const label = s.name + ': ' + fmtGBP.format(val) + ', ' +
      fmtEUR.format(eurVal) + ', ' + (frac * 100).toFixed(1) + '% ' + m.pctSuffix;
    path.setAttribute('aria-label', label);
    const t = document.createElementNS(SVGNS, 'title');
    t.textContent = label;
    path.appendChild(t);
    segG.appendChild(path);
    descParts.push(label);

    const li = document.createElement('li');
    if (s.emphasis) li.className = 'lg-row-' + s.emphasis;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lg-btn' + (s.emphasis ? ' lg-' + s.emphasis : '');
    btn.setAttribute('aria-pressed', 'false');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = s.color;
    const nm = document.createElement('span');
    nm.className = 'lg-name'; nm.textContent = s.name;
    const vv = document.createElement('span');
    vv.className = 'lg-val'; vv.textContent = fmtGBP.format(val);
    const pc = document.createElement('span');
    pc.className = 'lg-pct'; pc.textContent = Math.round(frac * 100) + '%';
    btn.append(dot, nm, vv, pc);
    li.appendChild(btn);
    legend.appendChild(li);

    const item = {
      seg: s, path, btn, li, frac, gbp: val, eur: eurVal,
      a0, a1, pctSuffix: m.pctSuffix,
    };
    D.segEls.push(item);

    // Al salir/perder foco volvemos al segmento fijado (o a nada si no hay).
    const leave = () => {
      if (D.activeKey === s.key) setDonutActive(D, D.pinnedKey);
    };
    path.addEventListener('pointerenter', (ev) => setDonutActive(D, s.key, ev));
    path.addEventListener('pointermove', (ev) => setDonutActive(D, s.key, ev));
    path.addEventListener('pointerleave', leave);
    path.addEventListener('focus', () => setDonutActive(D, s.key));
    path.addEventListener('blur', leave);
    path.addEventListener('click', () => setDonutActive(D, s.key));
    btn.addEventListener('pointerenter', () => setDonutActive(D, s.key));
    btn.addEventListener('pointerleave', leave);
    btn.addEventListener('focus', () => setDonutActive(D, s.key));
    btn.addEventListener('blur', leave);
    // Un clic fija/desfija el segmento (toggle sobre pinnedKey, no activeKey).
    btn.addEventListener('click', () => {
      D.pinnedKey = D.pinnedKey === s.key ? null : s.key;
      setDonutActive(D, D.pinnedKey);
    });
  }

  if (desc) {
    desc.textContent = m.descPrefix + ': ' + descParts.join('; ') + '.';
    if (sr) sr.textContent = (m.srPrefix || '') + desc.textContent;
  }
  // Barrido de entrada una sola vez por instancia (no en cada tecla).
  if (!D.swept && !prefersReduced()) {
    D.swept = true;
    const wrap = document.getElementById(D.o.wrapId);
    if (wrap) {
      wrap.classList.add('sweep-in');
      requestAnimationFrame(() =>
        requestAnimationFrame(() => wrap.classList.remove('sweep-in')));
    }
  }
  fitCenterText(D.o.centerId);
}

/* Instancias: rosco de impuestos (BRUTO) y rosco de presupuesto (NETO). */
const taxDonut = createDonut({
  svgId: 'donut', wrapId: 'donut-wrap', segsId: 'donut-segs',
  centerId: 'donut-center', centerEurId: 'donut-center-eur',
  centerSubId: 'donut-center-sub', tipId: 'donut-tip',
  legendId: 'legend', descId: 'donut-desc', srId: 'donut-sr',
});
const budgetDonut = createDonut({
  svgId: 'bdg-donut', wrapId: 'bdg-donut-wrap', segsId: 'bdg-segs',
  centerId: 'bdg-center', centerEurId: 'bdg-center-eur',
  centerSubId: 'bdg-center-sub', tipId: 'bdg-tip',
  legendId: 'bdg-legend', descId: 'bdg-desc', srId: 'bdg-sr',
});

/* Rosco de impuestos: reparte el BRUTO anual. Salida idéntica a SUE-1..16. */
function drawDonut(d) {
  const total = d.gross > 0 ? d.gross : 0;
  if (total <= 0) {
    renderDonut(taxDonut, {
      empty: true,
      emptyCenter: { main: '—', eur: '', sub: 'introduce un sueldo' },
      emptyDesc: 'Introduce un sueldo para ver el desglose.',
      emptyLegend: 'Introduce un sueldo para ver el desglose.',
    });
    return;
  }
  // Etiquetas dinámicas por jurisdicción (leyenda, tooltip, aria del donut).
  const jm = jurMeta();
  const segName = { net: 'Neto', tax: jm.taxLabel, ni: jm.niLabel, pension: 'Pensión' };
  renderDonut(taxDonut, {
    empty: false,
    center: {
      main: fmtGBP.format(d.netMonthly),
      eur: '≈ ' + fmtEUR.format(d.netMonthly * d.rate),
      sub: 'neto / mes',
    },
    total,
    rate: d.rate,
    segs: DONUT_SEGS.map((s) => ({
      key: s.key, name: segName[s.key] || s.name, color: s.color,
      value: Math.max(0, ({ net: d.net, tax: d.tax, ni: d.ni, pension: d.pension })[s.key] || 0),
    })),
    pctSuffix: 'del bruto',
    descPrefix: 'Desglose del bruto anual ' + fmtGBP.format(total),
    srPrefix: 'Neto mensual ' + fmtGBP.format(d.netMonthly) +
      ', equivalente a ' + fmtEUR.format(d.netMonthly * d.rate) + '. ',
  });
}

/* Rosco "Presupuesto mensual": reparte el NETO mensual entre cada gasto y
 *  el dinero disponible. Reutiliza el MISMO motor (renderDonut). Solo se
 *  dibuja cuando hay >=1 gasto (la tarjeta se oculta si no los hay). */
function drawBudgetDonut(d) {
  // d: { netMonthly, expenses:[{name, gbp}], expTotal, available, rate }
  const exps = d.expenses;
  const palette = (i) => BUDGET_PALETTE[i % BUDGET_PALETTE.length];
  const eur = (v) => fmtEUR.format(v * d.rate);

  // Sin neto ni gastos cuantificables → estado vacío del motor (defensivo;
  // la tarjeta ya se oculta sin gastos desde render()).
  if (d.netMonthly <= 0 && d.expTotal <= 0) {
    renderDonut(budgetDonut, {
      empty: true,
      emptyCenter: { main: '—', eur: '', sub: 'sin datos' },
      emptyDesc: 'Introduce un sueldo y añade gastos para ver el reparto.',
      emptyLegend: 'Introduce un sueldo y añade gastos para ver el reparto.',
    });
    return;
  }

  const warn = document.getElementById('bdg-warn');

  if (d.available < 0) {
    // DÉFICIT: los gastos superan el neto. El anillo representa el TOTAL de
    // gastos (cada gasto = su parte del gasto total, suma 100%) + un segmento
    // rojo "Déficit" = lo que excede al neto. Porcentajes sobre el total de
    // gastos (no sobre el neto) para no mostrar cifras absurdas (>100%).
    const deficit = d.expTotal - d.netMonthly;
    const total = d.expTotal + deficit;
    const segs = exps.map((e, i) => ({
      key: 'exp' + i, name: e.name, color: palette(i), value: e.gbp,
    }));
    segs.push({
      key: 'deficit', name: 'Déficit', color: 'var(--bdg-deficit)',
      value: deficit, emphasis: 'deficit',
    });
    if (warn) {
      warn.hidden = false;
      warn.textContent = '⚠️ Tus gastos superan el neto mensual en ' +
        fmtGBP.format(deficit) + ' (' + eur(deficit) + ').';
    }
    renderDonut(budgetDonut, {
      empty: false,
      center: {
        main: '−' + fmtGBP.format(deficit),
        eur: '≈ −' + eur(deficit),
        sub: 'DÉFICIT mensual',
      },
      total,
      rate: d.rate,
      segs,
      pctSuffix: 'del total de gastos',
      descPrefix: 'Reparto: los gastos (' + fmtGBP.format(d.expTotal) +
        ') superan el neto mensual (' + fmtGBP.format(d.netMonthly) + ')',
      srPrefix: 'Déficit mensual ' + fmtGBP.format(deficit) +
        ', equivalente a ' + eur(deficit) + '. ',
    });
    return;
  }

  // Caso normal: neto = suma de gastos + "Disponible" (verde, destacado).
  if (warn) { warn.hidden = true; warn.textContent = ''; }
  const total = d.netMonthly;
  const segs = exps.map((e, i) => ({
    key: 'exp' + i, name: e.name, color: palette(i), value: e.gbp,
  }));
  segs.push({
    key: 'avail', name: 'Disponible', color: 'var(--bdg-avail)',
    value: d.available, emphasis: 'avail',
  });
  const pctFree = total > 0 ? Math.round((d.available / total) * 100) : 0;
  renderDonut(budgetDonut, {
    empty: false,
    center: {
      main: fmtGBP.format(d.available),
      eur: '≈ ' + eur(d.available),
      sub: 'DISPONIBLE · ' + pctFree + '%',
    },
    total,
    rate: d.rate,
    segs,
    pctSuffix: 'del neto',
    descPrefix: 'Reparto del neto mensual ' + fmtGBP.format(total),
    srPrefix: 'Disponible ' + fmtGBP.format(d.available) +
      ', equivalente a ' + eur(d.available) + ' (' + pctFree +
      '% del neto). ',
  });
}

/* --------------- Entregable 3: payslip imprimible ---------------------- */
function fillPayslip(d) {
  const g = (v) => fmtGBP2.format(v);
  const e = (v) => fmtEUR2.format(v * d.rate);
  // Título y etiquetas del payslip según la jurisdicción activa.
  const jm = jurMeta();
  $('ps-title').textContent = jm.psTitle;
  $('ps-tax-th').textContent = jm.taxLabel;
  $('ps-ni-th').textContent = jm.niLabel;
  $('ps-date').textContent = 'Generado el ' +
    new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  $('ps-gross-gbp').textContent = g(d.gross);   $('ps-gross-eur').textContent = e(d.gross);
  $('ps-tax-gbp').textContent = g(d.tax);       $('ps-tax-eur').textContent = e(d.tax);
  $('ps-ni-gbp').textContent = g(d.ni);         $('ps-ni-eur').textContent = e(d.ni);
  const penRow = $('ps-pen-row');
  if (d.pensionAmount > 0) {
    penRow.style.display = '';
    $('ps-pen-gbp').textContent = g(d.pensionAmount);
    $('ps-pen-eur').textContent = e(d.pensionAmount);
  } else {
    penRow.style.display = 'none';
  }
  $('ps-net-gbp').textContent = g(d.netAnnual);   $('ps-net-eur').textContent = e(d.netAnnual);
  $('ps-netm-gbp').textContent = g(d.netMonthly); $('ps-netm-eur').textContent = e(d.netMonthly);
  $('ps-exp-gbp').textContent = g(d.expTotal);    $('ps-exp-eur').textContent = e(d.expTotal);
  $('ps-free-gbp').textContent = g(d.freeMonthly); $('ps-free-eur').textContent = e(d.freeMonthly);
  // Línea del comparador UK ↔ Gibraltar en el resumen imprimible.
  const cmp = $('ps-compare');
  if (cmp) {
    if (d.gross > 0 && d.resUk && d.resGib) {
      const dm = d.resGib.netMonthly - d.resUk.netMonthly;
      if (Math.abs(dm) < 0.005) {
        cmp.textContent = 'Comparador UK ↔ Gibraltar: mismo neto mensual en ambas (' +
          g(d.resGib.netMonthly) + ').';
      } else {
        const winner = dm > 0 ? 'Gibraltar' : 'UK';
        cmp.textContent = 'Comparador UK ↔ Gibraltar: neto/mes Gibraltar ' +
          g(d.resGib.netMonthly) + ' · UK ' + g(d.resUk.netMonthly) +
          ' → ' + fmtGBP2.format(Math.abs(dm)) + '/mes a favor de ' + winner + '.';
      }
    } else {
      cmp.textContent = '';
    }
  }
  $('ps-rate').textContent = elRateStatus.textContent.replace(/^[^A-Za-zÁÉÍÓÚ]+/, '') +
    ' · 1 £ = ' + d.rate.toFixed(4) + ' €';
}

/* =======================================================================
 *  BLOQUE C — Animaciones y feedback (sin librerías).
 *  Todo respeta prefers-reduced-motion: con «reduce» los importes se fijan
 *  al instante, los toasts no animan y los micro-efectos se omiten.
 * ======================================================================= */
const REDUCE_MQ = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
function prefersReduced() { return !!(REDUCE_MQ && REDUCE_MQ.matches); }

// Count-up con requestAnimationFrame (~420 ms, easeOutCubic). Re-apunta el
// destino en cada render → escribir rápido no degrada el recálculo en vivo.
function tweenNumber(el, to, fmt) {
  if (!el) return;
  const target = Number.isFinite(to) ? to : 0;
  if (prefersReduced()) {
    if (el.__raf) { cancelAnimationFrame(el.__raf); el.__raf = 0; }
    el.__cv = target;
    el.textContent = fmt(target);
    return;
  }
  const from = Number.isFinite(el.__cv) ? el.__cv : target;
  if (from === target) {
    if (el.__raf) { cancelAnimationFrame(el.__raf); el.__raf = 0; }
    el.__cv = target;
    el.textContent = fmt(target);
    return;
  }
  if (el.__raf) cancelAnimationFrame(el.__raf);
  const dur = 420;
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const k = 1 - Math.pow(1 - p, 3);
    const v = from + (target - from) * k;
    el.__cv = v;
    el.textContent = fmt(v);
    if (p < 1) {
      el.__raf = requestAnimationFrame(step);
    } else {
      el.__cv = target;
      el.textContent = fmt(target);
      el.__raf = 0;
    }
  };
  el.__raf = requestAnimationFrame(step);
}

const elToasts = $('toasts');
function toast(msg, kind) {
  if (!elToasts) return;
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.setAttribute('role', 'status');
  t.textContent = msg;
  elToasts.appendChild(t);
  if (prefersReduced()) {
    setTimeout(() => t.remove(), 2800);
    return;
  }
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    t.classList.add('hide');
    setTimeout(() => t.remove(), 340);
  }, 3200);
}

function bump(el) {
  if (!el || prefersReduced()) return;
  el.classList.remove('bump');
  void el.offsetWidth;            // reinicia la animación CSS
  el.classList.add('bump');
}

/* Portapapeles robusto (clipboard API + fallback execCommand para file://). */
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText &&
        window.isSecureContext !== false) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error('no-clipboard-api');
  } catch (_) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
}

/* ---- Bloque A: el donut también en el PDF (snapshot, NO 2º gráfico) ---- *
 *  Clona el donut vivo a la nómina sólo al imprimir, fijando los colores
 *  resueltos (las var() del tema no aplican dentro de @media print).
 * ----------------------------------------------------------------------- */
function buildPrintChart() {
  const host = $('ps-chart');
  const svg = $('donut');
  if (!host || !svg) return;
  host.innerHTML = '';
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  clone.querySelectorAll('[tabindex]').forEach((n) => {
    n.removeAttribute('tabindex');
    n.removeAttribute('role');
  });
  const segs = svg.querySelectorAll('#donut-segs path, #donut-segs circle');
  const csegs = clone.querySelectorAll('#donut-segs, g').length
    ? clone.querySelectorAll('path, circle') : [];
  segs.forEach((s, i) => {
    const c = csegs[i];
    if (!c) return;
    const cs = getComputedStyle(s);
    if (s.tagName.toLowerCase() === 'circle') {
      c.style.fill = 'none';
      c.style.stroke = cs.stroke;
    } else {
      c.style.fill = cs.fill;
    }
  });
  clone.querySelectorAll('.donut-center, .donut-center-eur, .donut-center-sub')
    .forEach((n) => { n.style.fill = '#0f172a'; });
  host.appendChild(clone);
  const lg = document.createElement('ul');
  lg.className = 'ps-legend';
  taxDonut.segEls.forEach((it) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'ps-dot';
    dot.style.background = getComputedStyle(it.path).fill;
    const nm = document.createElement('span');
    nm.textContent = it.seg.name + ' — ' + fmtGBP.format(it.gbp) +
      ' · ' + fmtEUR.format(it.eur) + ' (' + Math.round(it.frac * 100) + '%)';
    li.append(dot, nm);
    lg.appendChild(li);
  });
  if (taxDonut.segEls.length) host.appendChild(lg);

  // Reparto del presupuesto en el PDF: tabla equivalente legible (sin 2º
  // gráfico) cuando hay gastos, reusando los segmentos del rosco de neto.
  const bHost = $('ps-budget');
  if (bHost) {
    bHost.innerHTML = '';
    if (budgetDonut.segEls.length) {
      const h = document.createElement('p');
      h.className = 'ps-budget-h';
      h.textContent = 'Reparto del presupuesto mensual';
      const bl = document.createElement('ul');
      bl.className = 'ps-legend';
      budgetDonut.segEls.forEach((it) => {
        const li = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = 'ps-dot';
        dot.style.background = getComputedStyle(it.path).fill;
        const nm = document.createElement('span');
        nm.textContent = it.seg.name + ' — ' + fmtGBP.format(it.gbp) +
          ' · ' + fmtEUR.format(it.eur) + ' (' + Math.round(it.frac * 100) +
          '% ' + it.pctSuffix + ')';
        li.append(dot, nm);
        bl.appendChild(li);
      });
      bHost.append(h, bl);
    }
  }
}
window.addEventListener('beforeprint', buildPrintChart);

/* =======================================================================
 *  BLOQUE B — Insights IA (Claude Code CLI / suscripción Max, sin API key).
 *  La web sólo LEE insights.json (degradación elegante) y permite exportar
 *  los datos y copiar el prompt. El análisis lo genera ai-insights.mjs.
 * ======================================================================= */
function currentFinance() {
  const gross = annualGross();
  const rate = fxRate;
  const pension = Math.min(100, Math.max(0, STATE.pension));
  // Motor unificado (GIBS/UK): mismas cifras que la web y el payslip.
  const res = computeNet(gross, pension, STATE.jur);
  const jm = jurMeta();
  const r2 = (n) => Math.round(n * 100) / 100;
  const expenses = STATE.expenses.map((e) => ({
    name: e.name,
    amount: r2(e.amount),
    currency: expCurrency(e),
    gbp: r2(expenseInGBP(e, rate)),
  }));
  const expTotal = expenses.reduce((s, e) => s + e.gbp, 0);
  return {
    schema: 'uk-salary-calculator/finance@1',
    generatedAt: new Date().toISOString(),
    jurisdiction: STATE.jur,           // 'GIB' (Gibraltar GIBS) | 'UK' (PAYE)
    taxYear: jm.year,
    region: jm.region,
    currency: { base: 'GBP', quote: 'EUR', gbpToEur: r2(rate) },
    mode: STATE.mode,
    gross: { annual: r2(gross), monthly: r2(gross / 12) },
    pension: { pct: pension, annual: r2(res.pensionAmount) },
    incomeTax: { annual: r2(res.tax), label: jm.taxLabel },
    // En GIB este campo es la Social Insurance (10% capado); el "label"
    // desambigua para la IA sin romper el esquema finance@1 (aditivo).
    nationalInsurance: { annual: r2(res.ni), label: jm.niLabel },
    net: { annual: r2(res.netAnnual), monthly: r2(res.netMonthly) },
    expensesMonthly: expenses,
    expensesMonthlyTotalGbp: r2(expTotal),
    freeMonthlyGbp: r2(res.netMonthly - expTotal),
  };
}

// Mismo texto que ai-insights.mjs (mantener sincronizados si se edita).
function aiPrompt(fin) {
  const where = fin.jurisdiction === 'GIB' ? 'Gibraltar (sistema GIBS)' : 'Reino Unido';
  return [
    'Eres un asesor financiero personal. Analiza este resumen de nómina de',
    where + ' (año fiscal ' + fin.taxYear + ') con sus gastos mensuales.',
    'Responde EXCLUSIVAMENTE con un array JSON de entre 4 y 7 objetos, sin',
    'texto adicional ni markdown ni explicación. Cada objeto debe ser:',
    '{"titulo": string breve, "detalle": string accionable de 1-2 frases,',
    '"severidad": "info" | "sugerencia" | "aviso"}.',
    'Aconseja sobre ahorro, pensión, impuestos y gastos usando las cifras',
    '(importes en £ y su equivalente aproximado en €, tasa 1£=' +
      fin.currency.gbpToEur + '€). Escribe en español, claro y directo.',
    '',
    'DATOS (JSON):',
    JSON.stringify(fin),
  ].join('\n');
}

const elAiList = $('ai-list');
const elAiEmpty = $('ai-empty');
const elAiStatus = $('ai-status');
const AI_SEV = {
  info:       { icon: 'ℹ️', label: 'Info' },
  sugerencia: { icon: '💡', label: 'Sugerencia' },
  aviso:      { icon: '⚠️', label: 'Aviso' },
};

function showAiEmpty() {
  if (!elAiList) return;
  elAiList.hidden = true;
  elAiList.innerHTML = '';
  elAiEmpty.hidden = false;
}

function renderInsights(data) {
  if (!elAiList) return;
  elAiList.innerHTML = '';
  const list = data && Array.isArray(data.insights) ? data.insights : [];
  const clean = list.filter((x) => x && typeof x.titulo === 'string' &&
    typeof x.detalle === 'string').slice(0, 7);
  if (!clean.length) { showAiEmpty(); return; }
  elAiEmpty.hidden = true;
  elAiList.hidden = false;
  for (const it of clean) {
    const key = AI_SEV[it.severidad] ? it.severidad : 'info';
    const sev = AI_SEV[key];
    const card = document.createElement('div');
    card.className = 'ai-card sev-' + key;
    const h = document.createElement('div');
    h.className = 'ai-card-h';
    const ic = document.createElement('span');
    ic.className = 'ai-ic'; ic.textContent = sev.icon;
    const tt = document.createElement('span');
    tt.className = 'ai-tt'; tt.textContent = it.titulo;
    const bd = document.createElement('span');
    bd.className = 'ai-badge'; bd.textContent = sev.label;
    h.append(ic, tt, bd);
    const p = document.createElement('p');
    p.className = 'ai-dt'; p.textContent = it.detalle;
    card.append(h, p);
    elAiList.appendChild(card);
  }
  const when = data.generatedAt ? new Date(data.generatedAt) : null;
  const whenTxt = when && !isNaN(when.getTime())
    ? when.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) +
      ' ' + when.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : '';
  elAiStatus.textContent = '✅ ' + clean.length + ' insights' +
    (data.model ? ' · modelo ' + data.model : '') +
    (whenTxt ? ' · ' + whenTxt : '');
}

async function loadInsights(announce) {
  // SUE-15: bajo file:// el navegador bloquea el esquema y registra el error
  // en consola ANTES de que el JS pueda capturarlo. No se puede leer
  // insights.json sin un servidor HTTP, así que ni lo intentamos: mostramos
  // directamente el estado vacío con instrucciones (idéntica UX, consola limpia).
  if (location.protocol === 'file:') {
    showAiEmpty();
    if (announce) {
      elAiStatus.textContent =
        'ℹ️ Los insights IA necesitan servir la carpeta por HTTP ' +
        '(file:// no permite leer insights.json). Ej.: python3 -m http.server';
      toast('Sirve la carpeta por HTTP para ver insights', 'err');
    }
    return;
  }
  try {
    const res = await fetch('insights.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('insights http');
    const data = await res.json();
    renderInsights(data);
    if (announce) toast('💡 Insights IA cargados', 'ok');
  } catch (_) {
    showAiEmpty();
    if (announce) {
      elAiStatus.textContent =
        'ℹ️ No se pudo leer insights.json (no existe, o el navegador bloquea ' +
        'lecturas locales con file://; sirve la carpeta por HTTP).';
      toast('No hay insights.json todavía', 'err');
    }
  }
}

function downloadFinance() {
  const fin = currentFinance();
  const blob = new Blob([JSON.stringify(fin, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'finance.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 1000);
  elAiStatus.textContent =
    '📤 finance.json exportado. Ejecuta en esa carpeta: node ai-insights.mjs finance.json';
  toast('📤 finance.json exportado', 'ok');
}

async function copyAiPrompt() {
  const text = aiPrompt(currentFinance());
  const ok = await copyText(text);
  elAiStatus.textContent = ok
    ? '📋 Prompt copiado. Pégalo en Claude y guarda la respuesta como insights.json.'
    : '⚠️ No se pudo copiar; revisa la consola para copiarlo manualmente.';
  if (!ok) { try { console.info(text); } catch (e) {} }
  toast(ok ? '📋 Prompt copiado' : '⚠️ Copia manual (consola)', ok ? 'ok' : 'err');
}

/* ----------------------------- Gastos ---------------------------------- */
let justAddedExpId = null;   // Bloque C: id del último gasto añadido (anima la entrada)

function bumpExpenseTotals() {
  bump($('r-exp-gbp'));
  bump($('r-free-gbp'));
}

function renderExpenses() {
  const list = $('exp-list');
  const empty = $('exp-empty');
  list.innerHTML = '';
  if (STATE.expenses.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  const rate = fxRate;
  for (const item of STATE.expenses) {
    const li = document.createElement('li');
    li.className = 'exp-item';
    if (item.id === justAddedExpId && !prefersReduced()) {
      li.classList.add('just-added');
    }

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = item.name;

    const right = document.createElement('div');
    right.className = 'right';

    const amt = document.createElement('span');
    amt.className = 'amt';
    const d = expDisplay(item, rate);
    amt.innerHTML = '';
    amt.append(document.createTextNode(d.main + ' '));
    const sm = document.createElement('small');
    sm.textContent = '· ' + d.ref;
    amt.appendChild(sm);

    const del = document.createElement('button');
    del.className = 'btn-del';
    del.type = 'button';
    del.setAttribute('aria-label', 'Borrar ' + item.name);
    del.textContent = '🗑️';
    del.addEventListener('click', () => {
      const removeNow = () => {
        STATE.expenses = STATE.expenses.filter((x) => x.id !== item.id);
        justAddedExpId = null;
        renderExpenses();
        render();
        bumpExpenseTotals();
        persist();
        toast('🗑️ Gasto eliminado', 'ok');
      };
      if (prefersReduced()) { removeNow(); return; }
      li.classList.add('removing');
      setTimeout(removeNow, 200);
    });

    right.appendChild(amt);
    right.appendChild(del);
    li.appendChild(name);
    li.appendChild(right);
    list.appendChild(li);
  }
  justAddedExpId = null;   // la marca de entrada es de un solo render
}

/* ====================== TASA OFICIAL — CASCADA ========================== *
 *  SUE-6, sin cambios funcionales. Sin ruido en consola.
 * ----------------------------------------------------------------------- */
async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FX_API_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(t);
  }
}

function fxDate(input) {
  if (!input) return '';
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function fetchFrankfurter() {
  for (const url of FRANKFURTER_URLS) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const data = await res.json();
      const rate = data && data.rates && data.rates.EUR;
      if (Number.isFinite(rate) && rate > 0) {
        return { rate, date: data.date || '', source: 'BCE vía Frankfurter' };
      }
    } catch (_) { /* probar siguiente URL en silencio */ }
  }
  throw new Error('frankfurter');
}

async function fetchErApi() {
  const res = await fetchWithTimeout(ER_API_URL);
  if (!res.ok) throw new Error('erapi http');
  const data = await res.json();
  const rate = data && data.rates && data.rates.EUR;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('erapi rate');
  return { rate, date: data.time_last_update_utc || '', source: 'open.er-api' };
}

function applyRate(rate, source, date, offline) {
  fxRate = rate;
  elRateValue.textContent = '1 £ = ' + rate.toFixed(4) + ' €';
  elRateStatus.classList.remove('ok', 'loading', 'offline');
  const when = fxDate(date);
  if (offline) {
    elRateStatus.classList.add('offline');
    elRateStatus.textContent =
      '⚠️ Sin conexión — tipo aproximado' + (when ? ' del ' + when : '');
  } else {
    elRateStatus.classList.add('ok');
    elRateStatus.textContent =
      '✅ Tipo de referencia oficial' + (when ? ' del ' + when : '') + ' · ' + source;
  }
  renderExpenses();
  render();
}

let fxLoading = false;

async function loadRate() {
  if (fxLoading) return;
  fxLoading = true;
  elRateRefresh.disabled = true;
  elRateStatus.classList.remove('ok', 'offline');
  elRateStatus.classList.add('loading');
  elRateStatus.textContent = '⏳ Obteniendo tipo de cambio oficial…';

  try {
    if (navigator.onLine === false) {
      applyRate(FX_FALLBACK.rate, 'Sin conexión (aproximado)', FX_FALLBACK.date, true);
      return;
    }
    for (const source of [fetchFrankfurter, fetchErApi]) {
      try {
        const r = await source();
        if (r && Number.isFinite(r.rate) && r.rate > 0) {
          applyRate(r.rate, r.source, r.date, false);
          return;
        }
      } catch (_) { /* fuente caída/CORS → siguiente, en silencio */ }
    }
    applyRate(FX_FALLBACK.rate, 'Sin conexión (aproximado)', FX_FALLBACK.date, true);
  } finally {
    fxLoading = false;
    elRateRefresh.disabled = false;
    loadRateHistory(); // entregable 2: refresca histórico tras (re)cargar tasa
  }
}

/* ------------- Entregable 2: histórico tasa 90 días -------------------- *
 *  Reutiliza la fuente de SUE-6 (Frankfurter = datos del BCE). Timeout
 *  corto + try/catch. Offline/fallo: panel oculto (sin red) o aviso
 *  discreto (fallo en línea). Nunca ensucia la consola desde el código.
 * ----------------------------------------------------------------------- */
function ymd(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

let historyLoaded = false;
async function loadRateHistory() {
  if (historyLoaded) return;            // una sola vez por carga
  const panel = $('rate-history');
  const note = $('history-note');

  if (navigator.onLine === false) {     // file:// sin red: oculto y consola limpia
    panel.hidden = true;
    return;
  }
  // Bloque C: skeleton mientras carga (panel visible, sin ruido en consola).
  panel.hidden = false;
  panel.classList.add('loading');
  note.classList.remove('err');
  note.textContent = '⏳ Cargando histórico de 90 días…';
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - FX_HISTORY_DAYS);
  const url = FRANKFURTER_HISTORY
    .replace('{START}', ymd(start))
    .replace('{END}', ymd(end));

  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error('history http');
    const data = await res.json();
    const rates = data && data.rates;
    if (!rates || typeof rates !== 'object') throw new Error('history empty');
    const points = Object.keys(rates).sort().map((date) => ({
      date, value: rates[date] && rates[date].EUR,
    })).filter((p) => Number.isFinite(p.value) && p.value > 0);
    if (points.length < 2) throw new Error('history short');

    drawHistory(points);
    historyLoaded = true;
    panel.hidden = false;
    panel.classList.remove('loading');
    note.classList.remove('err');
    note.textContent = 'Fuente: BCE vía Frankfurter · ' +
      points.length + ' días · ' + fxDate(points[0].date) +
      ' → ' + fxDate(points[points.length - 1].date) +
      '. Referencia diaria, no tiempo real.';
  } catch (_) {
    // Fallo estando en línea: aviso discreto animado, sin chart, sin romper.
    const svg = $('history-chart');
    if (svg) svg.textContent = '';
    panel.classList.remove('loading');
    note.classList.add('err');
    note.textContent = '📉 Histórico no disponible ahora mismo.';
    panel.hidden = false;
  }
}

function drawHistory(points) {
  const svg = $('history-chart');
  svg.textContent = '';
  const W = 640, H = 220, padL = 56, padR = 16, padT = 16, padB = 28;
  const xs = (i) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 0.01; max += 0.01; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;
  const ys = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const mk = (tag, attrs, cls) => {
    const el = document.createElementNS(SVGNS, tag);
    if (cls) el.setAttribute('class', cls);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  // Ejes (líneas base/superior).
  svg.appendChild(mk('line', { x1: padL, y1: ys(max), x2: W - padR, y2: ys(max) }, 'h-axis'));
  svg.appendChild(mk('line', { x1: padL, y1: ys(min), x2: W - padR, y2: ys(min) }, 'h-axis'));

  // Etiquetas min/max (eje Y).
  const tMax = mk('text', { x: padL - 8, y: ys(max) + 4, 'text-anchor': 'end' }, 'h-txt');
  tMax.textContent = max.toFixed(4);
  const tMin = mk('text', { x: padL - 8, y: ys(min) + 4, 'text-anchor': 'end' }, 'h-txt');
  tMin.textContent = min.toFixed(4);
  svg.appendChild(tMax); svg.appendChild(tMin);

  // Fechas inicio/fin (eje X).
  const dStart = mk('text', { x: padL, y: H - 8, 'text-anchor': 'start' }, 'h-txt');
  dStart.textContent = fxDate(points[0].date);
  const dEnd = mk('text', { x: W - padR, y: H - 8, 'text-anchor': 'end' }, 'h-txt');
  dEnd.textContent = fxDate(points[points.length - 1].date);
  svg.appendChild(dStart); svg.appendChild(dEnd);

  // Área + línea.
  let dLine = '';
  points.forEach((p, i) => { dLine += (i ? 'L' : 'M') + xs(i) + ' ' + ys(p.value) + ' '; });
  const area = mk('path', {
    d: dLine + 'L' + xs(points.length - 1) + ' ' + ys(min) + ' L' + xs(0) + ' ' + ys(min) + ' Z',
  }, 'h-area');
  svg.appendChild(area);
  svg.appendChild(mk('path', { d: dLine.trim() }, 'h-line'));

  // Punto actual (último valor) marcado.
  const last = points[points.length - 1];
  svg.appendChild(mk('circle', { cx: xs(points.length - 1), cy: ys(last.value), r: 4.5 }, 'h-now'));
  const lbl = mk('text', {
    x: xs(points.length - 1) - 6, y: ys(last.value) - 8, 'text-anchor': 'end',
  }, 'h-now-txt');
  lbl.textContent = last.value.toFixed(4) + ' €';
  svg.appendChild(lbl);

  // Tooltips accesibles por punto (title nativo de SVG).
  points.forEach((p, i) => {
    const c = mk('circle', { cx: xs(i), cy: ys(p.value), r: 6, fill: 'transparent' });
    const ttl = document.createElementNS(SVGNS, 'title');
    ttl.textContent = fxDate(p.date) + ': 1 £ = ' + p.value.toFixed(4) + ' €';
    c.appendChild(ttl);
    svg.appendChild(c);
  });
}

/* ===================== TEMA (entregable 5) ============================== */
const elThemeBtns = Array.prototype.slice.call(document.querySelectorAll('.th-btn'));
const mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return (mqDark && mqDark.matches) ? 'dark' : 'light';
}

function applyTheme(pref) {
  STATE.theme = pref;
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-theme-pref', pref);
  for (const b of elThemeBtns) {
    const on = b.getAttribute('data-theme-set') === pref;
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  }
}

for (const b of elThemeBtns) {
  b.addEventListener('click', () => {
    applyTheme(b.getAttribute('data-theme-set'));
    persist();
  });
}
if (mqDark && mqDark.addEventListener) {
  mqDark.addEventListener('change', () => {
    if (STATE.theme === 'auto') applyTheme('auto'); // re-resuelve sin tocar la preferencia
  });
}

/* ============================== EVENTOS ================================ */

/* --------- Selector de jurisdicción (Gibraltar/UK) — segmentado ---------- *
 *  Radiogroup accesible con roving tabindex y flechas de teclado. Cambiarlo
 *  re-etiqueta toda la web (tarjetas, donut, payslip, hints) y recalcula.
 * ----------------------------------------------------------------------- */
const elJurBtns = Array.prototype.slice.call(
  document.querySelectorAll('.seg-btn[data-jur]'));

function syncJurUI() {
  const m = jurMeta();
  for (const b of elJurBtns) {
    const on = b.getAttribute('data-jur') === STATE.jur;
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  }
  // Etiquetas dinámicas fuera del ciclo de render (el donut y el payslip se
  // re-etiquetan en render()/fillPayslip() con la misma fuente: jurMeta()).
  $('lbl-tax').textContent = m.taxLabel;
  $('lbl-ni').textContent = m.niLabel;
  $('hero-badge').textContent = m.badge;
  $('jur-hint').textContent = m.jurHint;
  $('pension-hint').textContent = m.pensionHint;
}

function applyJur(jur, focusBtn) {
  STATE.jur = jur === 'UK' ? 'UK' : 'GIB';
  syncJurUI();
  render();
  persist();
  if (focusBtn) {
    const b = elJurBtns.filter((x) => x.getAttribute('data-jur') === STATE.jur)[0];
    if (b) b.focus();
  }
}

for (const b of elJurBtns) {
  b.addEventListener('click', () => applyJur(b.getAttribute('data-jur')));
  b.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight' &&
        ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    ev.preventDefault();
    applyJur(STATE.jur === 'GIB' ? 'UK' : 'GIB', true);  // solo hay 2 opciones
  });
}

function syncModeUI() {
  const meta = MODE_META[STATE.mode] || MODE_META.annual;
  elGrossLabel.textContent = meta.label;
  elGross.step = meta.step;
  const hourly = STATE.mode === 'hourly';
  $('hpw-field').hidden = !hourly;
  $('wpy-field').hidden = !hourly;
}

elGross.addEventListener('input', () => {
  STATE.grossInput = elGross.value;
  render();
  persist();
});
elMode.addEventListener('change', () => {
  STATE.mode = elMode.value;
  syncModeUI();
  render();
  persist();
});
elHpw.addEventListener('input', () => {
  const v = parseFloat(elHpw.value);
  STATE.hpw = Number.isFinite(v) && v > 0 ? v : 0;
  render();
  persist();
});
elWpy.addEventListener('input', () => {
  const v = parseFloat(elWpy.value);
  STATE.wpy = Number.isFinite(v) && v > 0 ? v : 0;
  render();
  persist();
});
elPension.addEventListener('input', () => {
  const v = parseFloat(elPension.value);
  STATE.pension = Number.isFinite(v) && v >= 0 ? Math.min(100, v) : 0;
  render();
  persist();
});
elRateRefresh.addEventListener('click', () => { historyLoaded = false; loadRate(); });

const elExpCurrency = $('exp-currency');
const elExpPrefix = $('exp-prefix');
const elExpError = $('exp-error');

elExpCurrency.addEventListener('change', () => {
  elExpPrefix.textContent = elExpCurrency.value === 'EUR' ? '€' : '£';
});

$('exp-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const name = $('exp-name').value.trim();
  const amount = parseFloat($('exp-amount').value);
  if (!name) {
    showError(elExpError, null, 'Indica un concepto para el gasto.');
    $('exp-name').focus();
    return;
  }
  if (!Number.isFinite(amount) || amount < 0) {
    showError(elExpError, null, 'Indica un importe válido (≥ 0).');
    $('exp-amount').focus();
    return;
  }
  showError(elExpError, null, '');
  const currency = elExpCurrency.value === 'EUR' ? 'EUR' : 'GBP';
  const id = Date.now() + Math.random();
  STATE.expenses.push({ id, name, amount, currency });
  justAddedExpId = id;
  $('exp-name').value = '';
  $('exp-amount').value = '';
  $('exp-name').focus();
  renderExpenses();
  render();
  bumpExpenseTotals();
  persist();
  toast('➕ Gasto añadido', 'ok');
});

/* ----------- Entregable 6: compartir + entregable 3: imprimir ---------- */
function flashMsg(text, isError) {
  elActionMsg.textContent = text;
  elActionMsg.style.color = isError ? 'var(--tax)' : 'var(--net)';
  clearTimeout(flashMsg._t);
  flashMsg._t = setTimeout(() => { elActionMsg.textContent = ''; }, 4000);
  toast(text, isError ? 'err' : 'ok');
}

$('btn-print').addEventListener('click', () => {
  buildPrintChart();                 // garantiza el donut en el PDF
  toast('🖨️ Abriendo resumen imprimible', 'ok');
  window.print();
});

$('btn-share').addEventListener('click', async () => {
  const url = buildShareUrl();
  const ok = await copyText(url);
  flashMsg(ok ? '✅ Enlace copiado al portapapeles'
              : '⚠️ Copia manual: ' + url, !ok);
});

$('btn-clear').addEventListener('click', () => {
  try { if (LS) LS.removeItem(STORAGE_KEY); } catch (e) { /* ignora */ }
  try {
    history.replaceState(null, '',
      (location.origin && location.origin !== 'null'
        ? location.origin + location.pathname
        : location.pathname));
  } catch (e) { /* file:// puede no permitirlo: no rompe */ }
  STATE = Object.assign({}, DEFAULTS, { expenses: [] });
  hydrateInputs();
  applyTheme(STATE.theme);
  renderExpenses();
  render();
  flashMsg('🗑️ Datos guardados borrados');
});

/* ------------- Bloque B: acciones del panel Insights IA ---------------- */
const elBtnAiExport = $('btn-ai-export');
const elBtnAiPrompt = $('btn-ai-prompt');
const elBtnAiReload = $('btn-ai-reload');
if (elBtnAiExport) elBtnAiExport.addEventListener('click', downloadFinance);
if (elBtnAiPrompt) elBtnAiPrompt.addEventListener('click', copyAiPrompt);
if (elBtnAiReload) elBtnAiReload.addEventListener('click', () => loadInsights(true));

/* ------ resize: redibujar gráficos (entregables 1 y 2) ----------------- */
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { render(); }, 150);
});

/* =============================== INIT ================================== */

function hydrateInputs() {
  elMode.value = STATE.mode;
  elGross.value = STATE.grossInput;
  elHpw.value = STATE.hpw;
  elWpy.value = STATE.wpy;
  elPension.value = STATE.pension;
  elExpPrefix.textContent = elExpCurrency.value === 'EUR' ? '€' : '£';
  syncModeUI();
  syncJurUI();
}

function init() {
  // Prioridad: defaults → localStorage → URL (entregables 4 y 6).
  const stored = loadStored();
  const fromUrl = readUrlState();
  STATE = Object.assign({}, DEFAULTS, stored, fromUrl);

  // Saneado defensivo.
  if (!['annual', 'monthly', 'hourly'].includes(STATE.mode)) STATE.mode = 'annual';
  if (!(Number.isFinite(STATE.hpw) && STATE.hpw > 0)) STATE.hpw = DEFAULTS.hpw;
  if (!(Number.isFinite(STATE.wpy) && STATE.wpy > 0)) STATE.wpy = DEFAULTS.wpy;
  if (!(Number.isFinite(STATE.pension) && STATE.pension >= 0)) STATE.pension = 0;
  STATE.pension = Math.min(100, STATE.pension);
  // Jurisdicción: cualquier valor no reconocido → Gibraltar (default).
  if (STATE.jur !== 'UK' && STATE.jur !== 'GIB') STATE.jur = 'GIB';
  if (!Array.isArray(STATE.expenses)) STATE.expenses = [];
  STATE.expenses = STATE.expenses.map(normalizeExpense).filter(Boolean);
  if (!['light', 'dark', 'auto'].includes(STATE.theme)) STATE.theme = 'auto';

  hydrateInputs();
  applyTheme(STATE.theme);
  renderExpenses();
  render();
  // Tras el primer paint: habilita la entrada escalonada de paneles y el
  // cross-fade de tema. Activarlo aquí (y no en CSS base) evita FOUC y que
  // la resolución inicial del tema dispare una transición no deseada.
  requestAnimationFrame(() => {
    document.documentElement.classList.add('theme-anim');
    document.body.classList.add('is-ready');
  });
  loadInsights();       // Bloque B: lee insights.json si existe (degrada bien)
  loadRate();           // dispara también loadRateHistory() al terminar
  // Si veníamos de URL, persistimos para que quede guardado localmente.
  if (Object.keys(fromUrl).length) persist();
}

init();
