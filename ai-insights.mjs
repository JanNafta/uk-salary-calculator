#!/usr/bin/env node
/* =========================================================================
 *  ai-insights.mjs  ·  Bloque B de la EPIC v3 (uk-salary-calculator)
 *
 *  Helper LOCAL y OPCIONAL. Node nativo: SOLO usa módulos nativos
 *  (child_process, fs, path, url). SIN dependencias npm. NO forma parte de
 *  la web (que es 100% vanilla y abre en file://): esto se ejecuta a mano.
 *
 *  Qué hace:
 *    1. Lee un JSON de estado financiero exportado por la web
 *       (botón «📤 Exportar datos para IA» → finance.json). Esquema:
 *       uk-salary-calculator/finance@1.
 *    2. Construye un prompt en español pidiendo 4–7 insights accionables
 *       { titulo, detalle, severidad: info|sugerencia|aviso }.
 *    3. Invoca el CLI de Claude Code usando la SUSCRIPCIÓN (Max), es decir
 *       SIN --bare y SIN ANTHROPIC_API_KEY (no usa API de pago):
 *         claude -p "<PROMPT>" --output-format json --model sonnet \
 *                --permission-mode dontAsk
 *    4. Parsea la respuesta de forma tolerante (texto extra / vallas ```).
 *    5. Escribe insights.json junto a index.html y resume por consola.
 *
 *  Degradación: si `claude` no está, o falla, o el JSON de entrada no
 *  existe, NO rompe nada (sale con mensaje claro). La web sigue funcionando
 *  sin insights.json (estado vacío con instrucciones).
 *
 *  Uso:
 *    node ai-insights.mjs [ruta-al-finance.json]   (por defecto ./finance.json)
 *    node ai-insights.mjs -                          (lee el JSON por stdin)
 * ========================================================================= */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(SCRIPT_DIR, 'insights.json');
const MODEL = 'sonnet';
const CLAUDE_ARGS = [
  '--output-format', 'json',
  '--model', MODEL,
  '--permission-mode', 'dontAsk',
];

/* ---------- utilidades de salida (sin dependencias) -------------------- */
const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch (_) { return ''; }
}

/* ---------- 1) cargar el estado financiero ----------------------------- */
function loadFinance() {
  const arg = process.argv[2];
  let raw;
  let where;
  if (arg === '-') {
    where = 'stdin';
    raw = readStdin();
  } else {
    const p = arg ? resolve(arg) : join(SCRIPT_DIR, 'finance.json');
    where = p;
    if (!existsSync(p)) {
      warn('⚠️  No se encontró el JSON de entrada: ' + p);
      warn('   Exporta los datos desde la web (botón «📤 Exportar datos para IA»)');
      warn('   o pásale una ruta:  node ai-insights.mjs ./finance.json');
      process.exit(1);
    }
    raw = readFileSync(p, 'utf8');
  }
  try {
    const fin = JSON.parse(raw);
    if (!fin || typeof fin !== 'object') throw new Error('no es un objeto');
    return fin;
  } catch (e) {
    warn('⚠️  El JSON de entrada (' + where + ') no es válido: ' + e.message);
    process.exit(1);
  }
}

/* ---------- 2) construir el prompt (mismo texto que app.js) ------------ */
function buildPrompt(fin) {
  const rate = (fin.currency && fin.currency.gbpToEur) || '?';
  const taxYear = fin.taxYear || '2024/25';
  // finance.json antiguos (sin "jurisdiction") eran siempre de Reino Unido.
  const where = fin.jurisdiction === 'GIB' ? 'Gibraltar (sistema GIBS)' : 'Reino Unido';
  return [
    'Eres un asesor financiero personal. Analiza este resumen de nómina de',
    where + ' (año fiscal ' + taxYear + ') con sus gastos mensuales.',
    'Responde EXCLUSIVAMENTE con un array JSON de entre 4 y 7 objetos, sin',
    'texto adicional ni markdown ni explicación. Cada objeto debe ser:',
    '{"titulo": string breve, "detalle": string accionable de 1-2 frases,',
    '"severidad": "info" | "sugerencia" | "aviso"}.',
    'Aconseja sobre ahorro, pensión, impuestos y gastos usando las cifras',
    '(importes en £ y su equivalente aproximado en €, tasa 1£=' + rate + '€).',
    'Escribe en español, claro y directo.',
    '',
    'DATOS (JSON):',
    JSON.stringify(fin),
  ].join('\n');
}

/* ---------- 3) invocar el CLI de Claude (suscripción Max) -------------- */
function runClaude(prompt) {
  // Clonamos el entorno y BORRAMOS ANTHROPIC_API_KEY: así el CLI usa la
  // sesión/suscripción Max en vez de la API de pago. Tampoco usamos --bare.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;

  const args = ['-p', prompt, ...CLAUDE_ARGS];
  const res = spawnSync('claude', args, {
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120000,
  });

  if (res.error) {
    if (res.error.code === 'ENOENT') {
      warn('ℹ️  El CLI «claude» no está disponible en este entorno.');
      warn('   No se ha generado insights.json (la web degrada con elegancia).');
      warn('');
      warn('   Comando exacto que ejecutaría este script:');
      warn('     claude -p "<PROMPT>" ' + CLAUDE_ARGS.join(' '));
      warn('   (sin --bare y sin ANTHROPIC_API_KEY → usa la suscripción Max)');
      warn('');
      warn('   Formato JSON esperado en insights.json:');
      warn('     { "schema":"uk-salary-calculator/insights@1", "generatedAt":ISO,');
      warn('       "model":"' + MODEL + '", "insights":[');
      warn('         {"titulo":"…","detalle":"…","severidad":"info|sugerencia|aviso"}, … ] }');
      process.exit(2);
    }
    warn('⚠️  No se pudo ejecutar «claude»: ' + res.error.message);
    process.exit(2);
  }
  if (res.status !== 0) {
    warn('⚠️  «claude» terminó con código ' + res.status + '.');
    if (res.stderr) warn(String(res.stderr).trim().split('\n').slice(-4).join('\n'));
    warn('   No se sobrescribe insights.json. Reintenta más tarde.');
    process.exit(res.status || 1);
  }
  return String(res.stdout || '');
}

/* ---------- 4) parseo tolerante --------------------------------------- */
// El CLI con --output-format json devuelve un sobre JSON con .result (texto
// del modelo). Dentro puede venir el array con vallas ``` o texto extra.
function extractModelText(stdout) {
  const s = stdout.trim();
  try {
    const env = JSON.parse(s);
    if (env && typeof env === 'object') {
      if (typeof env.result === 'string') return env.result;
      if (Array.isArray(env)) return s;          // ya es el array
      if (Array.isArray(env.insights)) return JSON.stringify(env.insights);
    }
  } catch (_) { /* no era el sobre: tratamos stdout como texto del modelo */ }
  return s;
}

function parseInsights(text) {
  let t = String(text).trim();
  // quita vallas de código ```json … ```
  t = t.replace(/```(?:json)?/gi, '').trim();
  // intenta el array JSON más externo
  const candidates = [];
  const first = t.indexOf('[');
  const last = t.lastIndexOf(']');
  if (first !== -1 && last !== -1 && last > first) {
    candidates.push(t.slice(first, last + 1));
  }
  // o un objeto { "insights": [...] }
  const oFirst = t.indexOf('{');
  const oLast = t.lastIndexOf('}');
  if (oFirst !== -1 && oLast !== -1 && oLast > oFirst) {
    candidates.push(t.slice(oFirst, oLast + 1));
  }
  candidates.push(t);

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      const arr = Array.isArray(parsed)
        ? parsed
        : (parsed && Array.isArray(parsed.insights) ? parsed.insights : null);
      if (Array.isArray(arr)) return arr;
    } catch (_) { /* siguiente candidato */ }
  }
  return null;
}

const SEV = new Set(['info', 'sugerencia', 'aviso']);
function normalize(arr) {
  return arr
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      titulo: String(x.titulo == null ? '' : x.titulo).trim().slice(0, 120),
      detalle: String(x.detalle == null ? '' : x.detalle).trim().slice(0, 600),
      severidad: SEV.has(x.severidad) ? x.severidad : 'info',
    }))
    .filter((x) => x.titulo && x.detalle)
    .slice(0, 7);
}

/* ---------- 5) main ---------------------------------------------------- */
function main() {
  const fin = loadFinance();
  const prompt = buildPrompt(fin);
  log('🧮 Estado financiero leído (esquema ' + (fin.schema || 'desconocido') + ').');
  log('🤖 Invocando Claude (' + MODEL + ', suscripción Max, sin API key)…');

  const stdout = runClaude(prompt);
  const text = extractModelText(stdout);
  const raw = parseInsights(text);

  if (!raw || !raw.length) {
    warn('⚠️  No se pudo extraer un array de insights de la respuesta.');
    warn('   Respuesta (primeros 400 car.):');
    warn('   ' + String(text).slice(0, 400).replace(/\n/g, '\n   '));
    process.exit(3);
  }

  const insights = normalize(raw);
  if (insights.length < 4) {
    warn('⚠️  Sólo se obtuvieron ' + insights.length +
      ' insights válidos (se esperaban 4–7). Se guardan igualmente.');
  }

  const payload = {
    schema: 'uk-salary-calculator/insights@1',
    generatedAt: new Date().toISOString(),
    model: MODEL,
    source: 'claude-code-cli (suscripción Max, sin API key)',
    insights,
  };
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  log('');
  log('✅ insights.json escrito: ' + OUT_PATH);
  log('   ' + insights.length + ' insights:');
  insights.forEach((it, i) => {
    const tag = { info: 'ℹ️ ', sugerencia: '💡', aviso: '⚠️ ' }[it.severidad] || 'ℹ️ ';
    log('   ' + (i + 1) + '. ' + tag + ' [' + it.severidad + '] ' + it.titulo);
  });
  log('');
  log('   Recarga la web (o pulsa «🔄 Recargar insights») para verlos.');
}

main();
