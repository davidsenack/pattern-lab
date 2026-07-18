'use strict';

/* ————— Pattern Lab · candle sketchpad ————— */

const AXIS_W = 64;			// price axis width, px
const XAXIS_H = 24;			// bar-index axis height, px
const STORE_KEY = 'patternlab.v1';

/* ————— themes (candle pairs CVD-validated per surface) ————— */

const THEME_KEY = 'patternlab.theme';

const THEMES = {
	graphite: {
		label: 'Graphite',
		css: {
			bg: '#0e1217', chrome: '#141922', 'chrome-2': '#1a2029', hairline: '#232b37',
			ink: '#dee4ec', 'ink-2': '#8b96a5', 'ink-3': '#5a6575',
			up: '#2fa88c', down: '#e5484d', accent: '#5b8def', 'accent-soft': 'rgba(91,141,239,.14)',
			level: '#d9a44a', tline: '#8b7cf6', danger: '#e5484d',
		},
		chart: { grid: 'rgba(255,255,255,0.05)', crossLine: 'rgba(255,255,255,0.13)', axisText: '#5a6575', crossText: '#dee4ec', pill: '#c8d4e6', note: '#a9b4c4' },
	},
	midnight: {
		label: 'Midnight',
		css: {
			bg: '#090d20', chrome: '#111634', 'chrome-2': '#1b2247', hairline: '#2a3358',
			ink: '#e8ebf6', 'ink-2': '#9aa4c6', 'ink-3': '#5e688e',
			up: '#1fa88f', down: '#f0525f', accent: '#7d8cff', 'accent-soft': 'rgba(125,140,255,.18)',
			level: '#e6b455', tline: '#a98cff', danger: '#f0525f',
		},
		chart: { grid: 'rgba(130,150,255,0.08)', crossLine: 'rgba(180,192,255,0.2)', axisText: '#5e688e', crossText: '#e8ebf6', pill: '#ccd4f5', note: '#aab3d4' },
	},
	paper: {
		label: 'Paper',
		css: {
			bg: '#f5f4f0', chrome: '#fdfdfb', 'chrome-2': '#ecebe5', hairline: '#dedcd4',
			ink: '#232830', 'ink-2': '#5c6470', 'ink-3': '#9aa0aa',
			up: '#0c8266', down: '#c93a3f', accent: '#3565d6', 'accent-soft': 'rgba(53,101,214,.12)',
			level: '#9a7418', tline: '#6a55c9', danger: '#c93a3f',
		},
		chart: { grid: 'rgba(0,0,0,0.055)', crossLine: 'rgba(0,0,0,0.2)', axisText: '#9aa0aa', crossText: '#232830', pill: '#ffffff', note: '#4a5361' },
	},
	fjord: {
		label: 'Fjord',
		css: {
			bg: '#242933', chrome: '#2b3140', 'chrome-2': '#333a4a', hairline: '#3d4557',
			ink: '#e5e9f0', 'ink-2': '#9aa5b8', 'ink-3': '#6c7689',
			up: '#2fa48d', down: '#c25b63', accent: '#7fa3cf', 'accent-soft': 'rgba(127,163,207,.16)',
			level: '#ebcb8b', tline: '#b48ead', danger: '#c25b63',
		},
		chart: { grid: 'rgba(255,255,255,0.06)', crossLine: 'rgba(255,255,255,0.16)', axisText: '#6c7689', crossText: '#e5e9f0', pill: '#d8dee9', note: '#aeb8c9' },
	},
};

let COL = {};
let themeName = 'graphite';

function applyTheme(name) {
	const t = THEMES[name] || THEMES.graphite;
	themeName = THEMES[name] ? name : 'graphite';
	for (const [k, v] of Object.entries(t.css)) {
		document.documentElement.style.setProperty('--' + k, v);
	}
	COL = {
		up: t.css.up, down: t.css.down, accent: t.css.accent,
		level: t.css.level, tline: t.css.tline,
		chrome: t.css.chrome, hairline: t.css.hairline, bg: t.css.bg,
		...t.chart,
	};
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.content = t.css.chrome;
	try { localStorage.setItem(THEME_KEY, themeName); } catch (e) { /* session only */ }
	document.querySelectorAll('[data-theme]').forEach(b =>
		b.classList.toggle('active', b.dataset.theme === themeName));
	if (typeof requestRender === 'function') requestRender();
}

function savedTheme() {
	try { return localStorage.getItem(THEME_KEY) || 'graphite'; } catch (e) { return 'graphite'; }
}

const svg = document.getElementById('chart');
const stage = document.getElementById('stage');
const inspectorEl = document.getElementById('inspector');
const emptyEl = document.getElementById('empty');
const hintEl = document.getElementById('hint');
const readoutEl = document.getElementById('readout');
const cursorTagEl = document.getElementById('cursorTag');

/* ————— state ————— */

let doc = { candles: [], levels: [], lines: [], arrows: [], texts: [] };
let lastPointerType = 'mouse';
let view = { pMin: 98, pMax: 105, xOff: -1.5, slotW: 46 };
let tool = 'select';
let sel = null;				// { type, id } — single selection (drives the props bar + handles)
let marquee = [];			// [{ type, id }] — multi-selection from a box drag
let hover = null;			// hit result { type, id, part }
let cursor = null;			// { x, y } in svg coords
let gesture = null;
let palDrag = null;			// { shape, x, y, over, moved } — dragging from the shape rail
let pendingLine = null;		// { type, id, pre } — line/arrow awaiting its second click
let editingTextId = null;	// text label currently open in the inline HTML editor
let undoStack = [];
let redoStack = [];
let W = 800, H = 500;		// plot area (svg minus axes)
let idSeq = 1;
let renderQueued = false;
let inspectorEditing = false;

const uid = () => 'e' + (idSeq++);

/* ————— transforms ————— */

const range = () => view.pMax - view.pMin;
const priceToY = p => (view.pMax - p) / range() * H;
const yToPrice = y => view.pMax - y / H * range();
const slotToX = s => (s + 0.5 - view.xOff) * view.slotW;	// center of slot s
const xToSlotF = x => x / view.slotW + view.xOff - 0.5;
const bodyW = () => clamp(view.slotW * 0.62, 3, 42);

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function niceStep(raw) {
	const p = Math.pow(10, Math.floor(Math.log10(raw)));
	const m = raw / p;
	return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

function dpFor(step) {
	for (let dp = 0; dp <= 6; dp++) {
		const v = step * Math.pow(10, dp);
		if (Math.abs(Math.round(v) - v) < 1e-6) return dp;
	}
	return 6;
}

function gridStep() { return niceStep(range() / Math.max(2, H / 48)); }
function readoutDp() {
	const ov = doc.axis && doc.axis.priceDp;
	if (ov != null) return clamp(ov, 0, 6);
	return clamp(dpFor(gridStep()) + 1, 2, 5);
}
const fmt = (p, dp) => p.toFixed(dp === undefined ? readoutDp() : dp);

/* effective decimals for the price axis (respects manual override) */
function axisPriceDp() {
	const ov = doc.axis && doc.axis.priceDp;
	return ov != null ? clamp(ov, 0, 6) : dpFor(gridStep());
}

/* ————— x-axis (bar-index vs time) ————— */

const TF_PRESETS = [
	{ v: 1, label: '1m' }, { v: 5, label: '5m' }, { v: 15, label: '15m' },
	{ v: 30, label: '30m' }, { v: 60, label: '1h' }, { v: 240, label: '4h' },
	{ v: 1440, label: '1D' }, { v: 10080, label: '1W' },
];

function defaultAxis() {
	return { xMode: 'index', tf: 5, clock: '09:30', date: '2024-01-01', priceDp: null };
}

/* copy only the style/state fields that are actually set */
function styleOf(v) {
	const o = {};
	if (v.color) o.color = v.color;
	if (v.width != null) o.width = +v.width;
	if (v.dash != null) o.dash = !!v.dash;
	if (v.size != null) o.size = +v.size;
	if (v.locked) o.locked = true;
	return o;
}

/* colors from imports/links are untrusted and land in SVG attributes —
   accept only #rgb / #rrggbb hex */
function cleanColor(s) {
	return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s || '') ? s : undefined;
}

function importStyle(v) {
	const o = {};
	const c = cleanColor(v && v.color);
	if (c) o.color = c;
	if (v && isFinite(+v.width)) o.width = clamp(+v.width, 0.5, 12);
	if (v && typeof v.dash === 'boolean') o.dash = v.dash;
	if (v && isFinite(+v.size)) o.size = clamp(+v.size, 6, 60);
	if (v && v.locked === true) o.locked = true;
	return o;
}

function sanitizeAxis(a) {
	const d = defaultAxis();
	if (!a || typeof a !== 'object') return d;
	if (a.xMode === 'time' || a.xMode === 'index') d.xMode = a.xMode;
	if (TF_PRESETS.some(t => t.v === +a.tf)) d.tf = +a.tf;
	if (typeof a.clock === 'string' && /^\d{1,2}:\d{2}$/.test(a.clock)) d.clock = a.clock;
	if (typeof a.date === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(a.date)) d.date = a.date;
	if (a.priceDp === null) d.priceDp = null;
	else if (isFinite(+a.priceDp) && +a.priceDp >= 0 && +a.priceDp <= 6) d.priceDp = +a.priceDp;
	return d;
}

/* default weights, px */
const DEF_W = { level: 1, line: 1.6, arrow: 1.8 };
const DEF_TEXT_SIZE = 13;

/* small padlock glyph drawn on locked objects */
function lockGlyph(x, y) {
	const c = COL.axisText;
	return `<g transform="translate(${(x - 4).toFixed(1)},${(y - 5).toFixed(1)})" opacity="0.9">` +
		`<rect x="0" y="4" width="8" height="5.6" rx="1.2" fill="${c}"/>` +
		`<path d="M1.5 4 V2.7 a2.5 2.5 0 0 1 5 0 V4" fill="none" stroke="${c}" stroke-width="1.1"/></g>`;
}

/* pick dark or light ink for text sitting on a solid color */
function contrastInk(hex) {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
	if (!m) return '#0e1217';
	const n = parseInt(m[1], 16);
	const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
	return lum > 0.58 ? '#0e1217' : '#ffffff';
}

const pad2 = n => (n < 10 ? '0' : '') + n;

function parseClock(s) {
	const m = String(s || '').match(/^(\d{1,2}):(\d{2})/);
	if (!m) return 570; // 09:30
	return (+m[1]) * 60 + (+m[2]);
}

function parseDateUTC(s) {
	const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (!m) return Date.UTC(2024, 0, 1);
	return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

/* format a real epoch-seconds timestamp for the given timeframe */
function fmtStamp(t, tf) {
	const d = new Date(t * 1000);
	if (tf < 1440) return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
	return pad2(d.getUTCMonth() + 1) + '/' + pad2(d.getUTCDate());
}

/* label for a bar index under the current axis config */
function xLabel(slot) {
	const ax = doc.axis;
	if (!ax || ax.xMode !== 'time') return String(slot);
	const tf = ax.tf || 5;
	/* real market data carries its own timestamp per bar */
	const c = doc.candles.find(k => k.slot === slot && k.t != null);
	if (c) return fmtStamp(c.t, tf);
	if (tf < 1440) {
		let mins = parseClock(ax.clock) + slot * tf;
		mins = ((mins % 1440) + 1440) % 1440;
		return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
	}
	const days = tf === 10080 ? slot * 7 : slot;
	const d = new Date(parseDateUTC(ax.date) + days * 86400000);
	return pad2(d.getUTCMonth() + 1) + '/' + pad2(d.getUTCDate());
}

/* min px between x labels — time labels are wider than bar indices */
function xLabelGap() {
	return (doc.axis && doc.axis.xMode === 'time') ? 62 : 52;
}

/* ————— seed ————— */

function seedDoc() {
	const c = (slot, o, h, l, cl) => ({ id: uid(), slot, o, h, l, c: cl });
	return {
		candles: [
			c(0, 100.00, 101.30, 99.60, 100.90),
			c(1, 100.90, 101.40, 100.10, 100.40),
			c(2, 100.40, 101.90, 100.20, 101.60),
			c(3, 101.60, 102.00, 100.80, 101.10),
			c(4, 101.10, 101.70, 100.30, 101.30),
			c(5, 101.30, 103.00, 101.20, 102.60),
			c(6, 102.60, 103.10, 102.00, 102.30),
			c(7, 102.30, 103.60, 102.10, 103.40),
		],
		levels: [{ id: uid(), price: 101.90 }],
		lines: [{ id: uid(), x1: 0, p1: 99.60, x2: 5, p2: 101.20 }],
		arrows: [{ id: uid(), x1: 6.7, p1: 103.85, x2: 5.25, p2: 103.2 }],
		texts: [{ id: uid(), x: 7.6, p: 104.05, text: 'breakout' }],
	};
}

function normalizeDoc(d) {
	for (const k of ['candles', 'levels', 'lines', 'arrows', 'texts']) {
		if (!Array.isArray(d[k])) d[k] = [];
	}
	d.axis = Object.assign(defaultAxis(), d.axis || {});
	return d;
}

/* ————— persistence & undo ————— */

const snap = () => JSON.stringify(doc);

function save() {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify({ doc, view, idSeq }));
	} catch (e) { /* storage unavailable — session only */ }
}

function load() {
	try {
		const raw = localStorage.getItem(STORE_KEY);
		if (!raw) return false;
		const data = JSON.parse(raw);
		if (!data.doc || !Array.isArray(data.doc.candles)) return false;
		doc = normalizeDoc(data.doc);
		if (data.view) view = data.view;
		idSeq = data.idSeq || 1000;
		return true;
	} catch (e) { return false; }
}

function pushUndo(pre) {
	undoStack.push(pre);
	if (undoStack.length > 100) undoStack.shift();
	redoStack = [];
	save();
	requestRender();
}

function mutate(fn) {
	const pre = snap();
	fn();
	if (snap() !== pre) pushUndo(pre);
}

function undo() {
	if (!undoStack.length) return;
	redoStack.push(snap());
	doc = normalizeDoc(JSON.parse(undoStack.pop()));
	afterHistory();
}

function redo() {
	if (!redoStack.length) return;
	undoStack.push(snap());
	doc = normalizeDoc(JSON.parse(redoStack.pop()));
	afterHistory();
}

function afterHistory() {
	if (sel && !findSel()) sel = null;
	marquee = marquee.filter(m => findByHit(m));
	hover = null;
	save();
	buildInspector();
	if (typeof renderAxisPanel === 'function') renderAxisPanel();
	requestRender();
}

function inMarquee(id) { return marquee.some(m => m.id === id); }

function poolFor(type) {
	return { candle: doc.candles, level: doc.levels, line: doc.lines, arrow: doc.arrows, text: doc.texts }[type];
}

function findSel() {
	if (!sel) return null;
	return poolFor(sel.type).find(e => e.id === sel.id) || null;
}

/* ————— hit testing ————— */

function hitTol() { return lastPointerType === 'touch' ? 13 : 7; }

function textBox(t) {
	const size = t.size || DEF_TEXT_SIZE;
	const label = t.text || 'Text';
	const halfW = Math.max(16, label.length * size * 0.29) + 5;
	return { cx: slotToX(t.x), cy: priceToY(t.p), halfW, halfH: size * 0.62 + 4 };
}

function hitTest(x, y) {
	const TOL = hitTol();
	const lineEnds = (ln, type) => {
		const pts = [['p1', slotToX(ln.x1), priceToY(ln.p1)], ['p2', slotToX(ln.x2), priceToY(ln.p2)]];
		for (const [part, px, py] of pts) {
			if (Math.hypot(x - px, y - py) <= TOL + 2) return { type, id: ln.id, part };
		}
		return null;
	};
	// endpoints of the selected line/arrow take priority
	if (sel && (sel.type === 'line' || sel.type === 'arrow')) {
		const ln = findSel();
		if (ln) { const h = lineEnds(ln, sel.type); if (h) return h; }
	}

	// text labels sit above everything
	for (const t of doc.texts) {
		const b = textBox(t);
		if (Math.abs(x - b.cx) <= b.halfW + 2 && Math.abs(y - b.cy) <= b.halfH + 2) {
			return { type: 'text', id: t.id, part: 'body' };
		}
	}

	// candles — explicit handles first (body-edge pills, wick-tip dots), then
	// anywhere on the candle = move. Pills outrank tips so a flush wick can be
	// re-created by shrinking the body away from it.
	for (const c of doc.candles) {
		const cx = slotToX(c.slot);
		if (Math.abs(x - cx) > Math.max(bodyW() / 2, TOL + 1)) continue;
		const yH = priceToY(c.h), yL = priceToY(c.l);
		const bt = priceToY(Math.max(c.o, c.c)), bb = priceToY(Math.min(c.o, c.c));
		const zones = [
			['bodyTop', Math.abs(y - bt) - 0.5],
			['bodyBottom', Math.abs(y - bb) - 0.5],
			['high', Math.abs(y - yH)],
			['low', Math.abs(y - yL)],
		].filter(z => z[1] <= TOL).sort((a, b) => a[1] - b[1]);
		if (zones.length) return { type: 'candle', id: c.id, part: zones[0][0] };
		if (y > yH - 3 && y < yL + 3) return { type: 'candle', id: c.id, part: 'body' };
	}

	// levels
	for (const lv of doc.levels) {
		if (Math.abs(y - priceToY(lv.price)) <= TOL - 2) return { type: 'level', id: lv.id, part: 'line' };
	}

	// trendlines & arrows: endpoints, then segments
	for (const [pool, type] of [[doc.lines, 'line'], [doc.arrows, 'arrow']]) {
		for (const ln of pool) {
			const h = lineEnds(ln, type);
			if (h) return h;
		}
	}
	for (const [pool, type] of [[doc.lines, 'line'], [doc.arrows, 'arrow']]) {
		for (const ln of pool) {
			const d = distSeg(x, y, slotToX(ln.x1), priceToY(ln.p1), slotToX(ln.x2), priceToY(ln.p2));
			if (d <= TOL - 2) return { type, id: ln.id, part: 'seg' };
		}
	}
	return null;
}

function distSeg(px, py, x1, y1, x2, y2) {
	const dx = x2 - x1, dy = y2 - y1;
	const len2 = dx * dx + dy * dy;
	const t = len2 ? clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1) : 0;
	return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/* ————— marquee (box) selection geometry ————— */

function rectsOverlap(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) {
	return ax0 <= bx1 && ax1 >= bx0 && ay0 <= by1 && ay1 >= by0;
}

function ptInRect(px, py, x0, y0, x1, y1) {
	return px >= x0 && px <= x1 && py >= y0 && py <= y1;
}

function segSeg(a, b, c, d, e, f, g, h) {
	const ccw = (x1, y1, x2, y2, x3, y3) => (y3 - y1) * (x2 - x1) - (y2 - y1) * (x3 - x1);
	const d1 = ccw(a, b, c, d, e, f), d2 = ccw(a, b, c, d, g, h);
	const d3 = ccw(e, f, g, h, a, b), d4 = ccw(e, f, g, h, c, d);
	return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function segRect(px0, py0, px1, py1, x0, y0, x1, y1) {
	if (ptInRect(px0, py0, x0, y0, x1, y1) || ptInRect(px1, py1, x0, y0, x1, y1)) return true;
	return segSeg(px0, py0, px1, py1, x0, y0, x1, y0) ||
		segSeg(px0, py0, px1, py1, x1, y0, x1, y1) ||
		segSeg(px0, py0, px1, py1, x1, y1, x0, y1) ||
		segSeg(px0, py0, px1, py1, x0, y1, x0, y0);
}

/* objects whose screen footprint intersects the drag box */
function objectsInBox(ax, ay, bx, by) {
	const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
	const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
	const out = [], bw = bodyW();
	for (const c of doc.candles) {
		const cx = slotToX(c.slot);
		if (rectsOverlap(cx - bw / 2, priceToY(c.h), cx + bw / 2, priceToY(c.l), x0, y0, x1, y1)) out.push({ type: 'candle', id: c.id });
	}
	for (const lv of doc.levels) {
		const y = priceToY(lv.price);
		if (y >= y0 && y <= y1) out.push({ type: 'level', id: lv.id });
	}
	for (const [pool, type] of [[doc.lines, 'line'], [doc.arrows, 'arrow']]) {
		for (const ln of pool) {
			if (segRect(slotToX(ln.x1), priceToY(ln.p1), slotToX(ln.x2), priceToY(ln.p2), x0, y0, x1, y1)) out.push({ type, id: ln.id });
		}
	}
	for (const t of doc.texts) {
		const b = textBox(t);
		if (rectsOverlap(b.cx - b.halfW, b.cy - b.halfH, b.cx + b.halfW, b.cy + b.halfH, x0, y0, x1, y1)) out.push({ type: 'text', id: t.id });
	}
	return out;
}

/* ————— element ops ————— */

function avgRange() {
	if (!doc.candles.length) return range() / 6;
	return doc.candles.reduce((s, c) => s + (c.h - c.l), 0) / doc.candles.length;
}

function roundTick(v) {
	const t = niceStep(avgRange() / 40);
	return Math.round(v / t) * t;
}

function freeSlot(want) {
	const used = new Set(doc.candles.map(c => c.slot));
	if (!used.has(want)) return want;
	for (let d = 1; d < 500; d++) {
		if (!used.has(want + d)) return want + d;
		if (!used.has(want - d)) return want - d;
	}
	return want;
}

function addCandleAt(x, y) {
	const slot = freeSlot(Math.round(xToSlotF(x)));
	const p = yToPrice(y);
	const r = avgRange() || range() / 6;
	const c = {
		id: uid(), slot,
		o: roundTick(p - r * 0.22),
		c: roundTick(p + r * 0.22),
		h: roundTick(p + r * 0.5),
		l: roundTick(p - r * 0.5),
	};
	mutate(() => doc.candles.push(c));
	sel = { type: 'candle', id: c.id };
	buildInspector();
}

function deleteSelection() {
	if (marquee.length) {
		const ids = new Set(marquee.map(m => findByHit(m)).filter(el => el && !el.locked).map(el => el.id));
		const lockedCount = marquee.length - ids.size;
		if (!ids.size) { flashHint('Those objects are locked — unlock them first'); return; }
		mutate(() => {
			for (const k of ['candles', 'levels', 'lines', 'arrows', 'texts']) {
				doc[k] = doc[k].filter(e => !ids.has(e.id));
			}
		});
		marquee = []; sel = null; hover = null;
		buildInspector();
		flashHint(`Deleted ${ids.size} object${ids.size > 1 ? 's' : ''}${lockedCount ? ` (${lockedCount} locked, kept)` : ''}`);
		return;
	}
	if (!sel) return;
	const el = findSel();
	if (el && el.locked) { flashHint('That object is locked — unlock it first'); return; }
	mutate(() => {
		for (const k of ['candles', 'levels', 'lines', 'arrows', 'texts']) {
			doc[k] = doc[k].filter(e => e.id !== sel.id);
		}
	});
	sel = null;
	hover = null;
	buildInspector();
}

function flipCandle(c) {
	if (c.locked) return;
	mutate(() => { const t = c.o; c.o = c.c; c.c = t; });
	buildInspector();
}

function toggleLock(target) {
	const el = target ? findByHit(target) : findSel();
	if (!el) return;
	mutate(() => { if (el.locked) delete el.locked; else el.locked = true; });
	buildInspector();
	requestRender();
	flashHint(el.locked ? 'Locked' : 'Unlocked');
}

function lockMarquee() {
	if (!marquee.length) return;
	const els = marquee.map(m => findByHit(m)).filter(Boolean);
	const anyUnlocked = els.some(el => !el.locked);	// lock all if any unlocked, else unlock all
	mutate(() => els.forEach(el => { if (anyUnlocked) el.locked = true; else delete el.locked; }));
	buildInspector();
	requestRender();
	flashHint(anyUnlocked ? `Locked ${els.length} objects` : `Unlocked ${els.length} objects`);
}

function clearSelection() {
	sel = null; marquee = []; hover = null;
	buildInspector();
	requestRender();
}

function duplicateObj(target) {
	const t = target || sel;
	if (!t) return;
	const el = findByHit(t);
	if (!el) return;
	const copy = JSON.parse(JSON.stringify(el));
	copy.id = uid();
	delete copy.locked;
	const off = avgRange() * 0.25;
	if (t.type === 'candle') { copy.slot = freeSlot(el.slot + 1); }
	else if (t.type === 'level') { copy.price = el.price - off; }
	else if (t.type === 'text') { copy.p = el.p - off; }
	else { copy.p1 = el.p1 - off; copy.p2 = el.p2 - off; }
	mutate(() => poolFor(t.type).push(copy));
	sel = { type: t.type, id: copy.id };
	buildInspector();
	requestRender();
}

function clearDrawings() {
	const had = doc.levels.length + doc.lines.length + doc.arrows.length + doc.texts.length;
	if (!had) { flashHint('No drawings to clear'); return; }
	mutate(() => { doc.levels = []; doc.lines = []; doc.arrows = []; doc.texts = []; });
	sel = null; hover = null; marquee = [];
	buildInspector();
	requestRender();
	flashHint(`Cleared ${had} drawing${had > 1 ? 's' : ''} — undo to restore`);
}

function clearAll() {
	if (doc.candles.length + doc.levels.length + doc.lines.length + doc.arrows.length + doc.texts.length === 0) {
		flashHint('Canvas is already empty'); return;
	}
	mutate(() => { doc = normalizeDoc({ axis: doc.axis }); });
	sel = null; hover = null; marquee = [];
	buildInspector();
	requestRender();
	flashHint('Cleared everything — undo to restore');
}

/* ————— gestures ————— */

function applyGesture(x, y) {
	const g = gesture;
	const dP = yToPrice(y) - yToPrice(g.y0);

	if (g.mode === 'pan') {
		view.xOff = g.v0.xOff - (x - g.x0) / view.slotW;
		const dPr = (y - g.y0) / H * (g.v0.pMax - g.v0.pMin);
		view.pMin = g.v0.pMin + dPr;
		view.pMax = g.v0.pMax + dPr;
		return;
	}
	if (g.mode === 'yscale') {
		const f = Math.exp((y - g.y0) * 0.004);
		const c = (g.v0.pMin + g.v0.pMax) / 2;
		const half = (g.v0.pMax - g.v0.pMin) / 2 * f;
		view.pMin = c - half;
		view.pMax = c + half;
		return;
	}
	if (g.mode === 'xscale') {
		const anchor = xToSlotF(g.x0);
		view.slotW = clamp(g.v0.slotW * Math.exp(-(x - g.x0) * 0.004), 5, 130);
		view.xOff = anchor + 0.5 - g.x0 / view.slotW;
		return;
	}
	if (g.mode === 'marquee') {
		g.x1 = x; g.y1 = y;
		marquee = objectsInBox(g.x0, g.y0, x, y);	// live highlight while dragging
		return;
	}
	if (g.mode === 'group') {
		const dS = (x - g.x0) / view.slotW;
		for (const m of g.orig) {
			const el = doc[({ candle: 'candles', level: 'levels', line: 'lines', arrow: 'arrows', text: 'texts' })[m.type]].find(e => e.id === m.snap.id);
			if (!el || el.locked) continue;			// locked members stay put
			const o = m.snap;
			if (m.type === 'candle') {
				el.o = o.o + dP; el.h = o.h + dP; el.l = o.l + dP; el.c = o.c + dP;
				el.slot = o.slot + Math.round(dS);
			} else if (m.type === 'level') {
				el.price = o.price + dP;
			} else if (m.type === 'text') {
				el.x = o.x + dS; el.p = o.p + dP;
			} else {
				el.x1 = o.x1 + dS; el.p1 = o.p1 + dP; el.x2 = o.x2 + dS; el.p2 = o.p2 + dP;
			}
		}
		return;
	}

	const el = findByHit(g.hit);
	if (!el) return;

	if (g.hit.type === 'candle') {
		const o = g.orig;
		switch (g.hit.part) {
			case 'body': {
				el.o = o.o + dP; el.c = o.c + dP; el.h = o.h + dP; el.l = o.l + dP;
				const ds = Math.round((x - g.x0) / view.slotW);
				const target = o.slot + ds;
				if (target !== el.slot) {
					const occ = doc.candles.find(k => k.slot === target && k.id !== el.id);
					if (occ) occ.slot = el.slot;
					el.slot = target;
				}
				break;
			}
			case 'bodyTop': case 'bodyBottom': {
				el[g.field] = o[g.field] + dP;
				el.h = Math.max(o.h, el.o, el.c);
				el.l = Math.min(o.l, el.o, el.c);
				break;
			}
			case 'high':
				el.h = Math.max(o.h + dP, Math.max(el.o, el.c));
				break;
			case 'low':
				el.l = Math.min(o.l + dP, Math.min(el.o, el.c));
				break;
		}
	} else if (g.hit.type === 'level') {
		el.price = g.orig.price + dP;
	} else if (g.hit.type === 'text') {
		el.x = g.orig.x + (x - g.x0) / view.slotW;
		el.p = g.orig.p + dP;
	} else if (g.hit.type === 'line' || g.hit.type === 'arrow') {
		const o = g.orig;
		if (g.hit.part === 'p1') { el.x1 = xToSlotF(x); el.p1 = yToPrice(y); }
		else if (g.hit.part === 'p2') { el.x2 = xToSlotF(x); el.p2 = yToPrice(y); }
		else {
			const dS = (x - g.x0) / view.slotW;
			el.x1 = o.x1 + dS; el.x2 = o.x2 + dS;
			el.p1 = o.p1 + dP; el.p2 = o.p2 + dP;
		}
	}
	if (!inspectorEditing) syncInspectorValues();
}

function findByHit(hit) {
	return poolFor(hit.type).find(e => e.id === hit.id) || null;
}

/* ————— pointer events ————— */

function evPos(e) {
	const r = svg.getBoundingClientRect();
	return { x: e.clientX - r.left, y: e.clientY - r.top };
}

/* drop an in-progress (first-click-placed) line/arrow that never got its
   second point */
function cancelPendingLine() {
	if (!pendingLine) return;
	const { type, id } = pendingLine;
	pendingLine = null;
	const key = type === 'line' ? 'lines' : 'arrows';
	doc[key] = doc[key].filter(l => l.id !== id);
	if (sel && sel.id === id) sel = null;
	buildInspector();
}

svg.addEventListener('pointerdown', e => {
	svg.focus({ preventScroll: true });
	lastPointerType = e.pointerType || 'mouse';
	const { x, y } = evPos(e);
	const pre = snap();

	if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
		gesture = { mode: 'pan', x0: x, y0: y, v0: { ...view }, pre, rightClick: e.button === 2 };
		svg.setPointerCapture(e.pointerId);
		return;
	}
	if (e.button !== 0) return;

	if (x > W && y <= H) {
		gesture = { mode: 'yscale', x0: x, y0: y, v0: { ...view }, pre };
	} else if (y > H && x <= W) {
		gesture = { mode: 'xscale', x0: x, y0: y, v0: { ...view }, pre };
	} else if (tool === 'candle') {
		addCandleAt(x, y);
	} else if (tool === 'level') {
		const lv = { id: uid(), price: roundTick(yToPrice(y)) };
		mutate(() => doc.levels.push(lv));
		sel = { type: 'level', id: lv.id };
		buildInspector();
	} else if (tool === 'line' || tool === 'arrow') {
		const type = tool === 'line' ? 'line' : 'arrow';
		if (pendingLine && pendingLine.type === type) {
			/* second click — finalize the endpoint */
			const ln = poolFor(type).find(l => l.id === pendingLine.id);
			if (ln) {
				ln.x2 = xToSlotF(x); ln.p2 = yToPrice(y);
				if (Math.hypot(slotToX(ln.x2) - slotToX(ln.x1), priceToY(ln.p2) - priceToY(ln.p1)) < 6) {
					ln.x2 = ln.x1 + (type === 'arrow' ? 1.4 : 2);	// degenerate → default length
				}
				if (snap() !== pendingLine.pre) pushUndo(pendingLine.pre);
			}
			pendingLine = null;
		} else {
			/* first click — drop the start point, second point tracks the cursor */
			cancelPendingLine();
			const ln = { id: uid(), x1: xToSlotF(x), p1: yToPrice(y), x2: xToSlotF(x), p2: yToPrice(y) };
			poolFor(type).push(ln);
			sel = { type, id: ln.id };
			pendingLine = { type, id: ln.id, pre };
			buildInspector();
		}
	} else if (tool === 'text') {
		const t = { id: uid(), x: xToSlotF(x), p: yToPrice(y), text: '' };
		doc.texts.push(t);
		sel = { type: 'text', id: t.id };
		buildInspector();
		setTool('select');
		startTextEdit(t.id, true, pre);
	} else {
		const hit = hitTest(x, y);
		if (hit && marquee.length && marquee.some(m => m.id === hit.id)) {
			/* grab a member of the box-selection → move the whole group */
			sel = null;
			gesture = { mode: 'group', x0: x, y0: y, pre, orig: marquee.map(m => ({ type: m.type, snap: { ...findByHit(m) } })) };
			buildInspector();
		} else if (hit) {
			if (hit.type === 'candle') dismissTip();
			marquee = [];
			sel = { type: hit.type, id: hit.id };
			const el = findByHit(hit);
			if (el && el.locked) {
				/* locked: selectable (so you can unlock it) but immovable */
				buildInspector();
			} else {
				const g = { mode: 'drag', hit, x0: x, y0: y, orig: { ...el }, pre };
				if (hit.part === 'bodyTop') g.field = el.c >= el.o ? 'c' : 'o';
				if (hit.part === 'bodyBottom') g.field = el.c >= el.o ? 'o' : 'c';
				gesture = g;
				buildInspector();
			}
		} else {
			/* empty space: rubber-band a selection box (alt/right/middle-drag still pans) */
			gesture = { mode: 'marquee', x0: x, y0: y, x1: x, y1: y };
		}
	}
	if (gesture) svg.setPointerCapture(e.pointerId);
	requestRender();
});

svg.addEventListener('pointermove', e => {
	const p = evPos(e);
	cursor = p;
	if (gesture) {
		applyGesture(p.x, p.y);
	} else if (pendingLine) {
		const ln = poolFor(pendingLine.type).find(l => l.id === pendingLine.id);
		if (ln) { ln.x2 = xToSlotF(p.x); ln.p2 = yToPrice(p.y); }
	} else {
		hover = (tool === 'select' && p.x <= W && p.y <= H) ? hitTest(p.x, p.y) : null;
	}
	updateCursorStyle(p);
	requestRender();
});

svg.addEventListener('pointerleave', () => {
	cursor = null;
	hover = null;
	requestRender();
});

svg.addEventListener('pointerup', e => {
	if (!gesture) return;
	const g = gesture;
	gesture = null;
	const p = evPos(e);
	/* right-click without a drag: in a drawing tool → back to the pointer;
	   in the pointer tool → open the context menu */
	if (g.rightClick && Math.hypot(p.x - g.x0, p.y - g.y0) < 5) {
		if (tool !== 'select') {
			setTool('select');
		} else {
			const hit = (p.x <= W && p.y <= H) ? hitTest(p.x, p.y) : null;
			if (hit && marquee.length && inMarquee(hit.id)) {
				showContextMenu(e.clientX, e.clientY, hit, { x: p.x, y: p.y }, true);
			} else {
				if (hit) { marquee = []; sel = { type: hit.type, id: hit.id }; buildInspector(); }
				showContextMenu(e.clientX, e.clientY, hit, { x: p.x, y: p.y }, false);
			}
		}
		requestRender();
		return;
	}
	if (g.mode === 'marquee') {
		if (Math.hypot(p.x - g.x0, p.y - g.y0) < 5) {
			sel = null; marquee = [];		// click on empty → clear selection
		} else {
			const boxed = objectsInBox(g.x0, g.y0, p.x, p.y);
			if (boxed.length === 1) { sel = boxed[0]; marquee = []; }
			else { marquee = boxed; sel = null; }
		}
		buildInspector();
		requestRender();
		return;
	}
	if ((g.mode === 'drag' || g.mode === 'group') && snap() !== g.pre) pushUndo(g.pre);
	else save();
	requestRender();
});

svg.addEventListener('dblclick', e => {
	const { x, y } = evPos(e);
	if (x > W || y > H) return;
	const hit = hitTest(x, y);
	const hitEl = hit && findByHit(hit);
	if (hit && hitEl && hitEl.locked) {
		sel = { type: hit.type, id: hit.id };
		buildInspector();
	} else if (hit && hit.type === 'candle') {
		const c = findByHit(hit);
		if (c) flipCandle(c);
	} else if (hit && hit.type === 'text') {
		sel = { type: 'text', id: hit.id };
		startTextEdit(hit.id);
	} else if (!hit && tool === 'select') {
		addCandleAt(x, y);
	}
	requestRender();
});

svg.addEventListener('contextmenu', e => e.preventDefault());

svg.addEventListener('wheel', e => {
	e.preventDefault();
	closeContextMenu();
	const { x, y } = evPos(e);
	/* Firefox reports deltas in lines (deltaMode 1) or pages (2), not pixels —
	   normalize so zoom speed matches across browsers */
	const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1;
	const dx = e.deltaX * unit, dy = e.deltaY * unit;
	if (e.ctrlKey || e.metaKey) {
		const anchor = xToSlotF(x);
		view.slotW = clamp(view.slotW * Math.exp(-dy * 0.002), 5, 130);
		view.xOff = anchor + 0.5 - x / view.slotW;
	} else {
		if (dx) view.xOff += dx / view.slotW;
		if (dy) {
			if (e.shiftKey) {
				view.xOff += dy / view.slotW;
			} else {
				const p = yToPrice(y);
				const f = Math.exp(dy * 0.0012);
				if (range() * f > 1e-6 && range() * f < 1e9) {
					view.pMax = p + (view.pMax - p) * f;
					view.pMin = p - (p - view.pMin) * f;
				}
			}
		}
	}
	scheduleSave();
	requestRender();
}, { passive: false });

let saveTimer = null;
function scheduleSave() {
	clearTimeout(saveTimer);
	saveTimer = setTimeout(save, 400);
}

function updateCursorStyle(p) {
	let cur = 'crosshair';
	if (gesture) {
		cur = gesture.mode === 'pan' ? 'grabbing'
			: gesture.mode === 'yscale' ? 'ns-resize'
			: gesture.mode === 'xscale' ? 'ew-resize'
			: gesture.mode === 'marquee' ? 'crosshair'
			: gesture.mode === 'group' ? 'grabbing'
			: gesture.hit && gesture.hit.part === 'body' ? 'grabbing'
			: cursorFor(gesture.hit);
	} else if (p.x > W && p.y <= H) cur = 'ns-resize';
	else if (p.y > H && p.x <= W) cur = 'ew-resize';
	else if (hover && inMarquee(hover.id)) cur = 'move';
	else if (hover) cur = cursorFor(hover);
	svg.style.cursor = cur;
}

function cursorFor(hit) {
	if (!hit) return 'crosshair';
	const el = findByHit(hit);
	if (el && el.locked) return 'default';
	if (hit.type === 'candle') return hit.part === 'body' ? 'grab' : 'ns-resize';
	if (hit.type === 'level') return 'ns-resize';
	if (hit.type === 'text') return hit.part === 'body' ? 'grab' : 'move';
	return 'move';
}

/* ————— keyboard ————— */

window.addEventListener('keydown', e => {
	if (!confirmEl.hidden) {
		if (e.key === 'Escape') closeConfirm();
		else if (e.key === 'Enter') acceptConfirm();
		return;
	}
	if (!marketEl.hidden) {
		if (e.key === 'Escape') closeMarket();
		return;
	}
	const tag = (e.target.tagName || '').toLowerCase();
	if (tag === 'input' || tag === 'textarea') {
		if (e.key === 'Escape') {
			e.target.blur();
			if (!modalEl.hidden) closeModal();
		}
		return;
	}
	const mod = e.metaKey || e.ctrlKey;
	if (mod && e.key.toLowerCase() === 'z') {
		e.preventDefault();
		e.shiftKey ? redo() : undo();
		return;
	}
	if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
	if (mod) return;

	if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); toggleHelp(); return; }
	switch (e.key) {
		case 'v': case 'V': setTool('select'); break;
		case 'c': case 'C': setTool('candle'); break;
		case 'l': case 'L': setTool('level'); break;
		case 't': case 'T': setTool('line'); break;
		case 'a': case 'A': setTool('arrow'); break;
		case 'x': case 'X': setTool('text'); break;
		case 'f': case 'F': fitView(); break;
		case 'Escape':
			if (ctxOpen) closeContextMenu();
			else if (!helpEl.hidden) toggleHelp(false);
			else if (!modalEl.hidden) closeModal();
			else if (openMenu) closeMenus();
			else if (pendingLine) { cancelPendingLine(); requestRender(); }
			else if (marquee.length) clearSelection();
			else if (tool !== 'select') setTool('select');
			else { sel = null; buildInspector(); requestRender(); }
			break;
		case 'Delete': case 'Backspace':
			e.preventDefault();
			deleteSelection();
			requestRender();
			break;
		case 'ArrowUp': case 'ArrowDown': {
			const el = findSel();
			if (!el) break;
			e.preventDefault();
			const d = (e.key === 'ArrowUp' ? 1 : -1) * gridStep() / 10;
			mutate(() => {
				if (sel.type === 'candle') { el.o += d; el.h += d; el.l += d; el.c += d; }
				else if (sel.type === 'level') el.price += d;
				else if (sel.type === 'text') el.p += d;
				else { el.p1 += d; el.p2 += d; }
			});
			syncInspectorValues();
			break;
		}
	}
});

/* ————— tools ————— */

const toolButtons = [...document.querySelectorAll('[data-tool]')];
const HINTS = {
	select: 'Drag a candle to move it · pull the wick dots & body-edge pills to reshape · double-click adds or flips · press ? for help',
	candle: 'Click to place a candle · Esc when done',
	level: 'Click at a price to drop a horizontal level · Esc when done',
	line: 'Click for the start, click again for the end · right-click or Esc to finish',
	arrow: 'Click for the start, click again for the end · right-click or Esc to finish',
	text: 'Click where you want a label, then type · Esc when done',
};

function setTool(t) {
	if (t !== tool) cancelPendingLine();
	tool = t;
	toolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool === t));
	hintEl.textContent = HINTS[t];
	hover = null;
	buildInspector();	// show/hide the props bar for the current tool
	requestRender();
}

toolButtons.forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);
document.getElementById('btnFit').addEventListener('click', fitView);
document.getElementById('btnPng').addEventListener('click', exportPng);

/* clear dropdown */
const clearPanel = document.getElementById('panelClear');
wireMenuToggle(document.getElementById('btnClear'), clearPanel);
const trashSmall = '<svg viewBox="0 0 16 16"><path d="M2.8 4.5h10.4M6.3 4.5V3a.8.8 0 0 1 .8-.8h1.8a.8.8 0 0 1 .8.8v1.5M4.2 4.5l.6 8.3a1 1 0 0 0 1 .95h4.4a1 1 0 0 0 1-.95l.6-8.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
clearPanel.innerHTML =
	`<button class="clear-item" id="clrDraw">${trashSmall}Clear drawings</button>` +
	`<button class="clear-item danger" id="clrAll">${trashSmall}Clear all</button>`;
clearPanel.querySelector('#clrDraw').addEventListener('click', () => { clearDrawings(); closeMenus(); });
clearPanel.querySelector('#clrAll').addEventListener('click', () => { closeMenus(); clearAllConfirm(); });

/* ————— right-click context menu ————— */

const ctxEl = document.getElementById('ctxMenu');
let ctxOpen = false;

const ICON = {
	lock: '<svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
	unlock: '<svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.2-1" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
	dup: '<svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 5.5V4a1.4 1.4 0 0 0-1.4-1.4H4A1.4 1.4 0 0 0 2.6 4v5.1A1.4 1.4 0 0 0 4 10.5h1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
	del: '<svg viewBox="0 0 16 16"><path d="M2.8 4.5h10.4M6.3 4.5V3a.8.8 0 0 1 .8-.8h1.8a.8.8 0 0 1 .8.8v1.5M4.2 4.5l.6 8.3a1 1 0 0 0 1 .95h4.4a1 1 0 0 0 1-.95l.6-8.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
	add: '<svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
	trash: trashSmall,
};

const OBJ_NAME = { candle: 'candle', level: 'level', line: 'trendline', arrow: 'arrow', text: 'label' };

function closeContextMenu() {
	if (!ctxOpen) return;
	ctxEl.hidden = true;
	ctxEl.innerHTML = '';
	ctxOpen = false;
}

function showContextMenu(clientX, clientY, hit, svgPos, group) {
	closeMenus();
	const items = [];
	if (group) {
		items.push({ label: `Lock / unlock ${marquee.length}`, icon: ICON.lock, act: lockMarquee });
		items.push({ label: `Delete ${marquee.length} selected`, icon: ICON.del, danger: true, act: () => { deleteSelection(); requestRender(); } });
		items.push({ label: 'Deselect', act: clearSelection });
		items.push({ sep: true });
	} else if (hit) {
		const el = findByHit(hit);
		const locked = !!(el && el.locked);
		items.push({ label: locked ? 'Unlock' : 'Lock', icon: locked ? ICON.unlock : ICON.lock, act: () => toggleLock(hit) });
		items.push({ label: 'Duplicate', icon: ICON.dup, act: () => duplicateObj(hit) });
		if (!locked) items.push({ label: 'Delete ' + (OBJ_NAME[hit.type] || 'object'), icon: ICON.del, danger: true, act: () => { sel = { type: hit.type, id: hit.id }; deleteSelection(); requestRender(); } });
		items.push({ sep: true });
	} else {
		items.push({ label: 'Add candle here', icon: ICON.add, act: () => addCandleAt(svgPos.x, svgPos.y) });
		items.push({ sep: true });
	}
	items.push({ label: 'Clear drawings', icon: ICON.trash, act: clearDrawings });
	items.push({ label: 'Clear all', icon: ICON.trash, danger: true, act: clearAllConfirm });

	ctxEl.innerHTML = items.map((it, i) => it.sep
		? '<div class="ctx-sep"></div>'
		: `<button class="ctx-item${it.danger ? ' danger' : ''}" role="menuitem" data-i="${i}">${it.icon || ''}${escHtml(it.label)}</button>`).join('');
	ctxEl.hidden = false;
	ctxOpen = true;

	const r = ctxEl.getBoundingClientRect();
	let x = clientX, y = clientY;
	if (x + r.width > window.innerWidth - 6) x = window.innerWidth - r.width - 6;
	if (y + r.height > window.innerHeight - 6) y = window.innerHeight - r.height - 6;
	ctxEl.style.left = Math.max(6, x) + 'px';
	ctxEl.style.top = Math.max(6, y) + 'px';

	ctxEl.querySelectorAll('.ctx-item').forEach(btn => {
		btn.addEventListener('click', () => { const it = items[+btn.dataset.i]; closeContextMenu(); it.act(); });
	});
}

function fitView() {
	let pLo = Infinity, pHi = -Infinity, sLo = Infinity, sHi = -Infinity;
	for (const c of doc.candles) {
		pLo = Math.min(pLo, c.l); pHi = Math.max(pHi, c.h);
		sLo = Math.min(sLo, c.slot); sHi = Math.max(sHi, c.slot);
	}
	for (const lv of doc.levels) { pLo = Math.min(pLo, lv.price); pHi = Math.max(pHi, lv.price); }
	for (const ln of [...doc.lines, ...doc.arrows]) {
		pLo = Math.min(pLo, ln.p1, ln.p2); pHi = Math.max(pHi, ln.p1, ln.p2);
		sLo = Math.min(sLo, ln.x1, ln.x2); sHi = Math.max(sHi, ln.x1, ln.x2);
	}
	for (const t of doc.texts) {
		pLo = Math.min(pLo, t.p); pHi = Math.max(pHi, t.p);
		sLo = Math.min(sLo, t.x); sHi = Math.max(sHi, t.x);
	}
	if (!isFinite(pLo)) { view = { pMin: 98, pMax: 105, xOff: -1.5, slotW: 46 }; requestRender(); return; }
	if (!isFinite(sLo)) { sLo = 0; sHi = 8; }
	const pad = Math.max((pHi - pLo) * 0.15, 0.5);
	view.pMin = pLo - pad;
	view.pMax = pHi + pad;
	view.slotW = clamp(W / (sHi - sLo + 5), 12, 80);
	view.xOff = sLo - 2;
	scheduleSave();
	requestRender();
}

/* ————— shape palette ————— */

/* offsets from an anchor price, in units of one average candle range;
   `cs` is the candle sequence, one bar per entry */
const SHAPES = [
	{ key: 'bull', name: 'Bull candle', cs: [{ o: -0.30, c: 0.30, h: 0.50, l: -0.50 }] },
	{ key: 'bear', name: 'Bear candle', cs: [{ o: 0.30, c: -0.30, h: 0.50, l: -0.50 }] },
	{ key: 'maru-bull', name: 'Bull marubozu', cs: [{ o: -0.50, c: 0.50, h: 0.50, l: -0.50 }] },
	{ key: 'maru-bear', name: 'Bear marubozu', cs: [{ o: 0.50, c: -0.50, h: 0.50, l: -0.50 }] },
	{ key: 'doji', name: 'Doji', cs: [{ o: 0, c: 0, h: 0.50, l: -0.50 }] },
	{ key: 'dragonfly', name: 'Dragonfly doji', cs: [{ o: 0.42, c: 0.42, h: 0.48, l: -0.55 }] },
	{ key: 'gravestone', name: 'Gravestone doji', cs: [{ o: -0.42, c: -0.42, h: 0.55, l: -0.48 }] },
	{ key: 'hammer', name: 'Hammer', cs: [{ o: 0.22, c: 0.45, h: 0.50, l: -0.55 }] },
	{ key: 'star', name: 'Shooting star', cs: [{ o: -0.22, c: -0.45, h: 0.55, l: -0.50 }] },
	{ key: 'inv-hammer', name: 'Inverted hammer', cs: [{ o: -0.45, c: -0.22, h: 0.55, l: -0.50 }] },
	{ key: 'hanging', name: 'Hanging man', cs: [{ o: 0.45, c: 0.22, h: 0.50, l: -0.55 }] },
	{ key: 'spin', name: 'Spinning top', cs: [{ o: -0.14, c: 0.14, h: 0.50, l: -0.50 }] },
	{ key: 'longleg', name: 'Long-legged doji', cs: [{ o: 0, c: 0, h: 0.78, l: -0.78 }] },
	{ key: 'highwave', name: 'High-wave candle', cs: [{ o: -0.12, c: 0.12, h: 0.72, l: -0.72 }] },
];

const PATTERNS = [
	{ key: 'engulf-bull', name: 'Bullish engulfing', cs: [
		{ o: 0.15, c: -0.15, h: 0.25, l: -0.25 },
		{ o: -0.25, c: 0.45, h: 0.55, l: -0.35 },
	] },
	{ key: 'engulf-bear', name: 'Bearish engulfing', cs: [
		{ o: -0.15, c: 0.15, h: 0.25, l: -0.25 },
		{ o: 0.25, c: -0.45, h: 0.35, l: -0.55 },
	] },
	{ key: 'morning-star', name: 'Morning doji star', cs: [
		{ o: 0.55, c: -0.15, h: 0.65, l: -0.25 },
		{ o: -0.42, c: -0.38, h: -0.18, l: -0.62 },
		{ o: -0.25, c: 0.50, h: 0.60, l: -0.35 },
	] },
	{ key: 'evening-star', name: 'Evening doji star', cs: [
		{ o: -0.55, c: 0.15, h: 0.25, l: -0.65 },
		{ o: 0.42, c: 0.38, h: 0.62, l: 0.18 },
		{ o: 0.25, c: -0.50, h: 0.35, l: -0.60 },
	] },
	{ key: 'harami-bull', name: 'Bullish harami', cs: [
		{ o: 0.40, c: -0.40, h: 0.50, l: -0.50 },
		{ o: -0.15, c: 0.15, h: 0.25, l: -0.25 },
	] },
	{ key: 'harami-bear', name: 'Bearish harami', cs: [
		{ o: -0.40, c: 0.40, h: 0.50, l: -0.50 },
		{ o: 0.15, c: -0.15, h: 0.25, l: -0.25 },
	] },
	{ key: 'soldiers', name: 'Three white soldiers', cs: [
		{ o: -0.60, c: -0.10, h: 0.00, l: -0.70 },
		{ o: -0.25, c: 0.25, h: 0.35, l: -0.35 },
		{ o: 0.10, c: 0.60, h: 0.70, l: 0.00 },
	] },
	{ key: 'crows', name: 'Three black crows', cs: [
		{ o: 0.60, c: 0.10, h: 0.70, l: 0.00 },
		{ o: 0.25, c: -0.25, h: 0.35, l: -0.35 },
		{ o: -0.10, c: -0.60, h: 0.00, l: -0.70 },
	] },
	{ key: 'piercing', name: 'Piercing line', cs: [
		{ o: 0.40, c: -0.40, h: 0.50, l: -0.50 },
		{ o: -0.55, c: 0.12, h: 0.22, l: -0.62 },
	] },
	{ key: 'dark-cloud', name: 'Dark cloud cover', cs: [
		{ o: -0.40, c: 0.40, h: 0.50, l: -0.50 },
		{ o: 0.55, c: -0.12, h: 0.62, l: -0.22 },
	] },
	{ key: 'tweezer-bottom', name: 'Tweezer bottom', cs: [
		{ o: 0.30, c: -0.30, h: 0.40, l: -0.55 },
		{ o: -0.30, c: 0.30, h: 0.40, l: -0.55 },
	] },
	{ key: 'tweezer-top', name: 'Tweezer top', cs: [
		{ o: -0.30, c: 0.30, h: 0.55, l: -0.40 },
		{ o: 0.30, c: -0.30, h: 0.55, l: -0.40 },
	] },
	{ key: 'kicker-bull', name: 'Bullish kicker', cs: [
		{ o: 0.05, c: -0.45, h: 0.05, l: -0.45 },
		{ o: 0.20, c: 0.72, h: 0.72, l: 0.20 },
	] },
	{ key: 'kicker-bear', name: 'Bearish kicker', cs: [
		{ o: -0.05, c: 0.45, h: 0.45, l: -0.05 },
		{ o: -0.20, c: -0.72, h: -0.20, l: -0.72 },
	] },
	{ key: 'rising-three', name: 'Rising three methods', cs: [
		{ o: -0.60, c: 0.30, h: 0.40, l: -0.70 },
		{ o: 0.20, c: 0.02, h: 0.26, l: -0.05 },
		{ o: 0.06, c: -0.14, h: 0.12, l: -0.20 },
		{ o: -0.06, c: -0.26, h: 0.00, l: -0.32 },
		{ o: -0.20, c: 0.58, h: 0.68, l: -0.26 },
	] },
	{ key: 'falling-three', name: 'Falling three methods', cs: [
		{ o: 0.60, c: -0.30, h: 0.70, l: -0.40 },
		{ o: -0.20, c: -0.02, h: 0.05, l: -0.26 },
		{ o: -0.06, c: 0.14, h: 0.20, l: -0.12 },
		{ o: 0.06, c: 0.26, h: 0.32, l: 0.00 },
		{ o: 0.20, c: -0.58, h: 0.26, l: -0.68 },
	] },
];

/* 'append' pins the first bar's open to the anchor (tape continuity);
   'drop' centers the pattern's full span on the anchor (cursor price) */
function shapeCandles(sh, anchor, mode) {
	const r = avgRange() || range() / 6;
	let shift;
	if (mode === 'append') {
		shift = anchor - sh.cs[0].o * r;
	} else {
		const hi = Math.max(...sh.cs.map(k => k.h));
		const lo = Math.min(...sh.cs.map(k => k.l));
		shift = anchor - (hi + lo) / 2 * r;
	}
	return sh.cs.map(k => ({
		o: roundTick(k.o * r + shift),
		c: roundTick(k.c * r + shift),
		h: roundTick(k.h * r + shift),
		l: roundTick(k.l * r + shift),
	}));
}

function shapeIcon(sh) {
	const n = sh.cs.length;
	const w = n === 1 ? 22 : 11 * n + 2;
	const maxAbs = Math.max(...sh.cs.map(k => Math.max(Math.abs(k.h), Math.abs(k.l))));
	const sc = Math.min(26, 14 / maxAbs);
	const y = v => (16 - v * sc).toFixed(1);
	let body = '';
	sh.cs.forEach((k, i) => {
		const cx = n === 1 ? 11 : 6.5 + i * 11;
		const bw2 = n === 1 ? 4.5 : 3.6;
		const col = k.c >= k.o ? 'var(--up)' : 'var(--down)';
		const bh = Math.max(Math.abs(k.o - k.c) * sc, 1.6).toFixed(1);
		body += `<line x1="${cx}" y1="${y(k.h)}" x2="${cx}" y2="${y(k.l)}" stroke="${col}" stroke-width="1.4"/>` +
			`<rect x="${(cx - bw2).toFixed(1)}" y="${y(Math.max(k.o, k.c))}" width="${bw2 * 2}" height="${bh}" rx="1" fill="${col}"/>`;
	});
	return `<svg width="${w}" height="32" viewBox="0 0 ${w} 32" aria-hidden="true">${body}</svg>`;
}

/* nearest starting slot whose whole run of n slots is free */
function freeRun(want, n) {
	const used = new Set(doc.candles.map(c => c.slot));
	const fits = s => { for (let i = 0; i < n; i++) if (used.has(s + i)) return false; return true; };
	for (let d = 0; d < 500; d++) {
		if (fits(want + d)) return want + d;
		if (d && fits(want - d)) return want - d;
	}
	return want;
}

function placeShape(sh, slot, anchor, mode) {
	const start = freeRun(slot, sh.cs.length);
	const added = shapeCandles(sh, anchor, mode).map((v, i) => ({ id: uid(), slot: start + i, ...v }));
	mutate(() => doc.candles.push(...added));
	sel = { type: 'candle', id: added[added.length - 1].id };
	/* keep the new bars in view */
	const cx = slotToX(added[added.length - 1].slot);
	if (cx > W - 30) view.xOff += (cx - (W - 30)) / view.slotW;
	if (cx < 10) view.xOff -= (10 - cx) / view.slotW;
	buildInspector();
	requestRender();
}

function appendShape(sh) {
	const last = doc.candles.reduce((a, c) => (!a || c.slot > a.slot) ? c : a, null);
	const slot = last ? last.slot + 1 : Math.round(xToSlotF(W * 0.3));
	const anchor = last ? last.c : (view.pMin + view.pMax) / 2;
	placeShape(sh, slot, anchor, last ? 'append' : 'drop');
}

const SHORT = {
	'bull': 'Bull', 'bear': 'Bear', 'maru-bull': 'Marubozu', 'maru-bear': 'Marubozu',
	'doji': 'Doji', 'dragonfly': 'Dragonfly', 'gravestone': 'Gravestone',
	'hammer': 'Hammer', 'star': 'Shooting star', 'inv-hammer': 'Inv. hammer', 'hanging': 'Hanging man',
	'spin': 'Spinning top', 'longleg': 'Long doji', 'highwave': 'High wave',
	'engulf-bull': 'Bull engulfing', 'engulf-bear': 'Bear engulfing',
	'morning-star': 'Morning star', 'evening-star': 'Evening star',
	'harami-bull': 'Bull harami', 'harami-bear': 'Bear harami',
	'soldiers': 'Soldiers', 'crows': 'Crows',
	'piercing': 'Piercing', 'dark-cloud': 'Dark cloud',
	'tweezer-bottom': 'Tweezer bot.', 'tweezer-top': 'Tweezer top',
	'kicker-bull': 'Bull kicker', 'kicker-bear': 'Bear kicker',
	'rising-three': 'Rising 3', 'falling-three': 'Falling 3',
};

let openMenu = null;		// { panel, btn }

function closeMenus() {
	if (!openMenu) return;
	openMenu.panel.hidden = true;
	openMenu.btn.classList.remove('open');
	openMenu.btn.setAttribute('aria-expanded', 'false');
	openMenu = null;
}

function buildMenu(btnId, panelId, list) {
	const btn = document.getElementById(btnId);
	const panel = document.getElementById(panelId);
	for (const sh of list) {
		const item = document.createElement('button');
		item.className = 'mitem';
		item.title = `${sh.name} — click to append, drag onto the chart`;
		item.setAttribute('aria-label', sh.name);
		item.innerHTML = shapeIcon(sh) + `<span>${SHORT[sh.key] || sh.name}</span>`;
		item.addEventListener('pointerdown', e => {
			e.preventDefault();
			item.setPointerCapture(e.pointerId);
			palDrag = { shape: sh, x: 0, y: 0, over: false, moved: false, sx: e.clientX, sy: e.clientY };
		});
		item.addEventListener('pointermove', e => {
			if (!palDrag) return;
			if (Math.hypot(e.clientX - palDrag.sx, e.clientY - palDrag.sy) > 4) palDrag.moved = true;
			const r = svg.getBoundingClientRect();
			palDrag.x = e.clientX - r.left;
			palDrag.y = e.clientY - r.top;
			palDrag.over = palDrag.x >= 0 && palDrag.x <= W && palDrag.y >= 0 && palDrag.y <= H;
			requestRender();
		});
		item.addEventListener('pointerup', () => {
			if (!palDrag) return;
			const d = palDrag;
			palDrag = null;
			if (d.over && d.moved) placeShape(d.shape, Math.round(xToSlotF(d.x)), yToPrice(d.y), 'drop');
			else if (!d.moved) appendShape(d.shape);
			closeMenus();
			requestRender();
		});
		item.addEventListener('lostpointercapture', () => {
			if (palDrag) { palDrag = null; requestRender(); }
		});
		panel.appendChild(item);
	}
	wireMenuToggle(btn, panel);
}

function wireMenuToggle(btn, panel) {
	btn.addEventListener('click', () => {
		const wasOpen = openMenu && openMenu.panel === panel;
		closeMenus();
		if (!wasOpen) {
			panel.hidden = false;
			btn.classList.add('open');
			btn.setAttribute('aria-expanded', 'true');
			openMenu = { panel, btn };
		}
	});
}

buildMenu('btnShapes', 'panelShapes', SHAPES);
buildMenu('btnPatterns', 'panelPatterns', PATTERNS);

/* close menus on outside click */
document.addEventListener('pointerdown', e => {
	if (openMenu && !e.target.closest('.menu-wrap')) closeMenus();
	if (ctxOpen && !e.target.closest('.ctx-menu')) closeContextMenu();
});

/* ————— pattern library ————— */

const LIB_KEY = 'patternlab.lib.v1';
const libPanel = document.getElementById('panelLibrary');
wireMenuToggle(document.getElementById('btnLibrary'), libPanel);

function loadLib() {
	try { return JSON.parse(localStorage.getItem(LIB_KEY)) || []; }
	catch (e) { return []; }
}

function saveLib(lib) {
	try { localStorage.setItem(LIB_KEY, JSON.stringify(lib)); }
	catch (e) { flashHint('Could not save — browser storage unavailable'); }
}

function remapIds(d) {
	const clone = normalizeDoc(JSON.parse(JSON.stringify(d)));
	for (const k of ['candles', 'levels', 'lines', 'arrows', 'texts']) {
		for (const el of clone[k]) el.id = uid();
	}
	return clone;
}

function renderLibrary() {
	const lib = loadLib();
	const rows = lib.length
		? lib.map((e, i) => `
			<div class="lib-row" data-i="${i}" role="button" tabindex="0" title="Load “${escHtml(e.name)}”">
				<span class="name">${escHtml(e.name)}</span>
				<span class="meta">${e.doc.candles.length} bars</span>
				<button class="del" data-del="${i}" title="Delete" aria-label="Delete ${escHtml(e.name)}">
					<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
				</button>
			</div>`).join('')
		: '<div class="lib-empty">Nothing saved yet — name the current canvas and hit Save.</div>';
	libPanel.innerHTML = `
		<div class="lib-save">
			<input id="libName" type="text" placeholder="Name this pattern" maxlength="40">
			<button id="libSave" class="ghost-btn">Save</button>
		</div>
		<div class="lib-list">${rows}</div>
		<div class="lib-divider"></div>
		<button id="ioMarket" class="ghost-btn lib-market">↓ Load market data…</button>
		<div class="lib-io">
			<button id="ioImport" class="ghost-btn">Import…</button>
			<button id="ioCsv" class="ghost-btn">CSV</button>
			<button id="ioJson" class="ghost-btn">JSON</button>
		</div>`;

	const nameInput = libPanel.querySelector('#libName');
	const doSave = () => {
		const name = nameInput.value.trim() || `Pattern ${loadLib().length + 1}`;
		const lib2 = loadLib().filter(e => e.name !== name);
		lib2.unshift({ name, savedAt: Date.now(), doc: JSON.parse(snap()) });
		saveLib(lib2);
		renderLibrary();
		libPanel.querySelector('#libName').value = name;
		flashHint(`Saved “${name}” — ${doc.candles.length} bars`);
	};
	libPanel.querySelector('#libSave').addEventListener('click', doSave);
	nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });

	libPanel.querySelectorAll('.lib-row').forEach(row => {
		const open = () => {
			const e = loadLib()[+row.dataset.i];
			if (!e) return;
			mutate(() => { doc = remapIds(e.doc); });
			sel = null; hover = null; marquee = [];
			buildInspector();
			renderAxisPanel();
			fitView();
			closeMenus();
			flashHint(`Loaded “${e.name}” — undo restores your previous canvas`);
		};
		row.addEventListener('click', ev => { if (!ev.target.closest('.del')) open(); });
		row.addEventListener('keydown', ev => { if (ev.key === 'Enter') open(); });
	});
	libPanel.querySelectorAll('.del').forEach(btn => {
		btn.addEventListener('click', ev => {
			ev.stopPropagation();
			const lib2 = loadLib();
			const [gone] = lib2.splice(+btn.dataset.del, 1);
			saveLib(lib2);
			renderLibrary();
			if (gone) flashHint(`Deleted “${gone.name}”`);
		});
	});

	libPanel.querySelector('#ioMarket').addEventListener('click', () => { closeMenus(); openMarket(); });
	libPanel.querySelector('#ioImport').addEventListener('click', () => { closeMenus(); openModal(); });
	libPanel.querySelector('#ioCsv').addEventListener('click', () => { exportCsv(); closeMenus(); });
	libPanel.querySelector('#ioJson').addEventListener('click', () => { exportJson(); closeMenus(); });
}

function escHtml(s) {
	return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

let hintTimer = null;
function flashHint(msg) {
	hintEl.textContent = msg;
	clearTimeout(hintTimer);
	hintTimer = setTimeout(() => { hintEl.textContent = HINTS[tool]; }, 3000);
}

renderLibrary();

/* ————— data export / import ————— */

const numOut = v => +v.toFixed(6);

function download(filename, text, mime) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(new Blob([text], { type: mime }));
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function sortedCandles() {
	return [...doc.candles].sort((a, b) => a.slot - b.slot);
}

function exportCsv() {
	const rows = sortedCandles().map(c => `${c.slot},${numOut(c.o)},${numOut(c.h)},${numOut(c.l)},${numOut(c.c)}`);
	download('pattern.csv', 'bar,open,high,low,close\n' + rows.join('\n') + '\n', 'text/csv');
	flashHint(`Exported ${rows.length} bars to pattern.csv`);
}

function exportJson() {
	const seg = l => ({ x1: numOut(l.x1), p1: numOut(l.p1), x2: numOut(l.x2), p2: numOut(l.p2), ...styleOf(l) });
	const data = {
		axis: { ...doc.axis },
		candles: sortedCandles().map(c => ({ slot: c.slot, o: numOut(c.o), h: numOut(c.h), l: numOut(c.l), c: numOut(c.c), ...(c.t != null ? { t: c.t } : {}), ...styleOf(c) })),
		levels: doc.levels.map(l => ({ price: numOut(l.price), ...styleOf(l) })),
		lines: doc.lines.map(seg),
		arrows: doc.arrows.map(seg),
		texts: doc.texts.map(t => ({ x: numOut(t.x), p: numOut(t.p), text: t.text, ...styleOf(t) })),
	};
	download('pattern.json', JSON.stringify(data, null, '\t') + '\n', 'application/json');
	flashHint(`Exported ${data.candles.length} bars to pattern.json`);
}

const MAX_IMPORT = 300;
const num = v => parseFloat(v);

function parseImport(text) {
	const t = text.trim();
	if (!t) throw new Error('Nothing to import — paste rows or choose a file.');
	let candles, levels = [], lines = [], arrows = [], texts = [], axis, note = '';
	const segs = a => (Array.isArray(a) ? a : [])
		.map(v => ({ x1: num(v.x1), p1: num(v.p1), x2: num(v.x2), p2: num(v.p2), ...importStyle(v) }))
		.filter(v => isFinite(v.x1) && isFinite(v.p1) && isFinite(v.x2) && isFinite(v.p2));

	if (t[0] === '{' || t[0] === '[') {
		let data;
		try { data = JSON.parse(t); }
		catch (e) { throw new Error('Invalid JSON: ' + e.message); }
		const arr = Array.isArray(data) ? data : data.candles;
		if (!Array.isArray(arr)) throw new Error('JSON must be an array of candles or an object with a "candles" array.');
		candles = arr.map(k => ({
			slot: Number.isFinite(k.slot) ? k.slot : undefined,
			o: num(k.o ?? k.open), h: num(k.h ?? k.high), l: num(k.l ?? k.low), c: num(k.c ?? k.close),
			...(isFinite(+k.t) ? { t: +k.t } : {}),
			...importStyle(k),
		}));
		if (!Array.isArray(data) && Array.isArray(data.levels)) {
			levels = data.levels.map(v => ({ price: num(v.price ?? v), ...importStyle(v) })).filter(v => isFinite(v.price));
		}
		if (!Array.isArray(data)) {
			lines = segs(data.lines);
			arrows = segs(data.arrows);
			if (data.axis) axis = sanitizeAxis(data.axis);
			if (Array.isArray(data.texts)) {
				texts = data.texts
					.map(v => ({ x: num(v.x), p: num(v.p), text: String(v.text == null ? '' : v.text).slice(0, 60), ...importStyle(v) }))
					.filter(v => isFinite(v.x) && isFinite(v.p));
			}
		}
	} else {
		const first = t.slice(0, t.indexOf('\n') === -1 ? t.length : t.indexOf('\n'));
		const delim = [',', ';', '\t'].reduce((best, d) =>
			first.split(d).length > first.split(best).length ? d : best, ',');
		const rows = t.split(/\r?\n/).map(r => r.trim()).filter(Boolean).map(r => r.split(delim).map(f => f.trim()));
		const head = rows[0].map(f => f.toLowerCase());
		const col = names => head.findIndex(h => names.some(n => h === n || h.includes(n)));
		const iO = col(['open']), iH = col(['high']), iL = col(['low']), iC = col(['close', 'last']);
		if (iO >= 0 && iH >= 0 && iL >= 0 && iC >= 0) {
			candles = rows.slice(1).map(f => ({ o: num(f[iO]), h: num(f[iH]), l: num(f[iL]), c: num(f[iC]) }));
		} else {
			const numeric = rows.filter(f => f.filter(v => isFinite(parseFloat(v))).length === 4);
			if (!numeric.length) {
				throw new Error('Couldn’t detect columns. Use a header row naming open/high/low/close, or bare 4-column o,h,l,c rows.');
			}
			candles = numeric.map(f => {
				const v = f.map(parseFloat).filter(isFinite);
				return { o: v[0], h: v[1], l: v[2], c: v[3] };
			});
		}
	}

	const skipped = candles.length;
	candles = candles.filter(k => [k.o, k.h, k.l, k.c].every(isFinite));
	const bad = skipped - candles.length;
	if (!candles.length) throw new Error('No valid bars found in that data.');
	if (candles.length > MAX_IMPORT) {
		note = ` (kept last ${MAX_IMPORT} of ${candles.length})`;
		candles = candles.slice(-MAX_IMPORT);
	}
	if (bad) note += ` (${bad} unreadable row${bad > 1 ? 's' : ''} skipped)`;
	for (const k of candles) {
		k.h = Math.max(k.h, k.o, k.c);
		k.l = Math.min(k.l, k.o, k.c);
	}
	return { candles, levels, lines, arrows, texts, axis, note };
}

function doImport(text) {
	const r = parseImport(text);
	mutate(() => {
		doc = normalizeDoc({
			axis: r.axis || doc.axis,
			candles: r.candles.map((v, i) => ({ id: uid(), slot: v.slot !== undefined ? v.slot : i, o: v.o, h: v.h, l: v.l, c: v.c, ...(v.t != null ? { t: v.t } : {}), ...importStyle(v) })),
			levels: r.levels.map(v => ({ id: uid(), price: v.price, ...styleOf(v) })),
			lines: r.lines.map(v => ({ id: uid(), x1: v.x1, p1: v.p1, x2: v.x2, p2: v.p2, ...styleOf(v) })),
			arrows: r.arrows.map(v => ({ id: uid(), x1: v.x1, p1: v.p1, x2: v.x2, p2: v.p2, ...styleOf(v) })),
			texts: r.texts.map(v => ({ id: uid(), x: v.x, p: v.p, text: v.text, ...(v.color ? { color: v.color } : {}), ...(v.size ? { size: v.size } : {}) })),
		});
	});
	sel = null; hover = null; marquee = [];
	buildInspector();
	renderAxisPanel();
	fitView();
	return r;
}

/* modal wiring */
const modalEl = document.getElementById('modal');
const modalText = document.getElementById('modalText');
const modalErr = document.getElementById('modalErr');
const fileInput = document.getElementById('fileInput');

function openModal() {
	modalEl.hidden = false;
	modalErr.hidden = true;
	modalText.focus();
}

function closeModal() {
	modalEl.hidden = true;
	modalText.value = '';
	modalErr.hidden = true;
	fileInput.value = '';
}

function runImport() {
	try {
		const r = doImport(modalText.value);
		closeModal();
		flashHint(`Imported ${r.candles.length} bars${r.note} — undo restores your previous canvas`);
	} catch (err) {
		modalErr.textContent = err.message;
		modalErr.hidden = false;
	}
}

document.getElementById('modalImport').addEventListener('click', runImport);
document.getElementById('modalCancel').addEventListener('click', closeModal);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalFile').addEventListener('click', () => fileInput.click());
modalEl.addEventListener('pointerdown', e => { if (e.target === modalEl) closeModal(); });

fileInput.addEventListener('change', () => {
	const f = fileInput.files && fileInput.files[0];
	if (!f) return;
	const reader = new FileReader();
	reader.onload = () => {
		modalText.value = String(reader.result);
		runImport();
	};
	reader.readAsText(f);
});

/* ————— confirm dialog ————— */

const confirmEl = document.getElementById('confirm');
let confirmCb = null;

function askConfirm(title, msg, okLabel, onOk) {
	document.getElementById('confirmTitle').textContent = title;
	document.getElementById('confirmMsg').textContent = msg;
	document.getElementById('confirmOk').textContent = okLabel;
	confirmCb = onOk;
	confirmEl.hidden = false;
	requestAnimationFrame(() => document.getElementById('confirmOk').focus());
}

function closeConfirm() { confirmEl.hidden = true; confirmCb = null; }
function acceptConfirm() { const cb = confirmCb; closeConfirm(); if (cb) cb(); }

document.getElementById('confirmOk').addEventListener('click', acceptConfirm);
document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
document.getElementById('confirmClose').addEventListener('click', closeConfirm);
confirmEl.addEventListener('pointerdown', e => { if (e.target === confirmEl) closeConfirm(); });

function clearAllConfirm() {
	const n = doc.candles.length + doc.levels.length + doc.lines.length + doc.arrows.length + doc.texts.length;
	if (!n) { flashHint('Canvas is already empty'); return; }
	askConfirm('Clear everything?', `This removes all ${n} object${n > 1 ? 's' : ''} on the canvas. You can undo it afterward.`, 'Clear all', clearAll);
}

/* ————— market data (Yahoo Finance via CORS proxy) ————— */

const marketEl = document.getElementById('market');
const marketErr = document.getElementById('marketErr');
const marketLoadBtn = document.getElementById('marketLoad');
const IV_TF = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '60m': 60, '1d': 1440, '1wk': 10080, '1mo': 10080 };

function openMarket() {
	marketEl.hidden = false;
	marketErr.hidden = true;
	const inp = document.getElementById('mktSymbol');
	requestAnimationFrame(() => { inp.focus(); inp.select(); });
}

function closeMarket() { marketEl.hidden = true; }

const PROXIES = [
	u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
	u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
	u => `https://thingproxy.freeboard.io/fetch/${u}`,
];

async function fetchYahoo(symbol, interval, range) {
	const yurl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
	let lastErr;
	for (const proxy of PROXIES) {
		try {
			const res = await fetch(proxy(yurl), { headers: { Accept: 'application/json' } });
			if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
			const data = await res.json();
			if (data && data.chart) return data;
			lastErr = new Error('Unexpected response');
		} catch (e) { lastErr = e; }
	}
	throw lastErr || new Error('All data proxies failed');
}

function parseYahoo(data, symbol) {
	const chart = data.chart;
	if (chart.error) throw new Error(chart.error.description || 'Symbol not found');
	const r = chart.result && chart.result[0];
	if (!r || !r.timestamp || !r.indicators || !r.indicators.quote) {
		throw new Error(`No data for “${symbol}”. Check the symbol and try again.`);
	}
	const ts = r.timestamp, q = r.indicators.quote[0];
	const rows = [];
	for (let i = 0; i < ts.length; i++) {
		const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
		if ([o, h, l, c].every(v => typeof v === 'number' && isFinite(v))) {
			rows.push({ t: ts[i], o, h, l, c });
		}
	}
	if (!rows.length) throw new Error(`No usable candles for “${symbol}”.`);
	return rows;
}

/* fetch + parse + clamp — shared by the modal and the first-visit preload */
async function getMarketRows(symbol, interval, range) {
	const data = await fetchYahoo(symbol, interval, range);
	let rows = parseYahoo(data, symbol);
	const total = rows.length;
	if (rows.length > MAX_IMPORT) rows = rows.slice(-MAX_IMPORT);
	for (const k of rows) { k.h = Math.max(k.h, k.o, k.c); k.l = Math.min(k.l, k.o, k.c); }
	return { rows, total };
}

function marketDoc(rows, interval, baseAxis) {
	const tf = IV_TF[interval] || 1440;
	return normalizeDoc({
		axis: { ...(baseAxis || defaultAxis()), xMode: 'time', tf },
		candles: rows.map((k, i) => ({ id: uid(), slot: i, o: k.o, h: k.h, l: k.l, c: k.c, t: k.t })),
	});
}

function marketSpan(rows, interval) {
	const tf = IV_TF[interval] || 1440;
	return `${fmtStamp(rows[0].t, tf)}–${fmtStamp(rows[rows.length - 1].t, tf)}`;
}

async function loadMarket() {
	const symbol = document.getElementById('mktSymbol').value.trim();
	const interval = document.getElementById('mktInterval').value;
	const range = document.getElementById('mktRange').value;
	if (!symbol) { marketErr.textContent = 'Enter a symbol.'; marketErr.hidden = false; return; }

	marketErr.hidden = true;
	marketLoadBtn.textContent = 'Loading…';
	marketLoadBtn.disabled = true;
	document.querySelector('.market-form').classList.add('busy');
	try {
		const { rows, total } = await getMarketRows(symbol, interval, range);
		mutate(() => { doc = marketDoc(rows, interval, doc.axis); });
		sel = null; hover = null; marquee = [];
		buildInspector();
		renderAxisPanel();
		fitView();
		closeMarket();
		const note = total > rows.length ? ` (last ${rows.length} of ${total})` : '';
		flashHint(`Loaded ${symbol.toUpperCase()} — ${rows.length} bars ${marketSpan(rows, interval)}${note} · undo restores your canvas`);
	} catch (e) {
		marketErr.textContent = /Failed to fetch|NetworkError|proxies/.test(String(e.message))
			? 'Could not reach the data service. It may be rate-limited — try again in a moment.'
			: e.message;
		marketErr.hidden = false;
	} finally {
		marketLoadBtn.textContent = 'Load';
		marketLoadBtn.disabled = false;
		document.querySelector('.market-form').classList.remove('busy');
	}
}

/* first-visit preload: replace the synthetic seed with real candles.
   Runs only when nothing was saved/shared and the user hasn't edited yet. */
const PRELOAD = { symbol: 'AAPL', interval: '1d', range: '3mo' };
async function preloadMarket() {
	flashHint('Loading live market data…');
	try {
		const { rows } = await getMarketRows(PRELOAD.symbol, PRELOAD.interval, PRELOAD.range);
		if (!rows.length || undoStack.length) return;	// user already started editing → leave them be
		doc = marketDoc(rows, PRELOAD.interval);
		undoStack = []; redoStack = [];					// clean slate — no undo back to the seed
		sel = null; hover = null; marquee = [];
		buildInspector();
		renderAxisPanel();
		fitView();
		save();											// becomes their canvas; a failed fetch stays unsaved and retries next visit
		flashHint(`Loaded ${PRELOAD.symbol} — ${rows.length} bars ${marketSpan(rows, PRELOAD.interval)} · draw on real price action, or Library → Load market data for another`);
	} catch (e) {
		if (hintEl.textContent === 'Loading live market data…') hintEl.textContent = HINTS[tool];
	}
}

marketLoadBtn.addEventListener('click', loadMarket);
document.getElementById('marketCancel').addEventListener('click', closeMarket);
document.getElementById('marketClose').addEventListener('click', closeMarket);
marketEl.addEventListener('pointerdown', e => { if (e.target === marketEl) closeMarket(); });
document.getElementById('mktSymbol').addEventListener('keydown', e => { if (e.key === 'Enter') loadMarket(); });

/* ————— inline text editor ————— */

function startTextEdit(id, isNew, preSnap) {
	const t = doc.texts.find(e => e.id === id);
	if (!t) return;
	editingTextId = id;
	const pre = preSnap || snap();
	requestRender();

	const inp = document.createElement('input');
	inp.type = 'text';
	inp.className = 'text-edit';
	inp.value = t.text;
	inp.maxLength = 60;
	inp.spellcheck = false;
	inp.setAttribute('aria-label', 'Label text');
	stage.appendChild(inp);

	const place = () => {
		const cx = slotToX(t.x), cy = priceToY(t.p);
		inp.style.left = cx + 'px';
		inp.style.top = cy + 'px';
	};
	place();

	/* The SVG holds keyboard focus (tabindex=0); the click that opened this
	   editor can re-focus it and fire a spurious blur. Defer focus past the
	   click, and until then treat any blur as noise rather than a commit. */
	let done = false;
	let ready = false;
	const finish = commit => {
		if (done) return;
		done = true;
		editingTextId = null;
		const cur = doc.texts.find(e => e.id === id);
		if (cur) {
			if (commit) cur.text = inp.value.trim();
			if ((!commit && isNew) || (commit && !cur.text)) {
				doc.texts = doc.texts.filter(e => e.id !== id);
				if (sel && sel.id === id) sel = null;
			}
		}
		inp.remove();
		if (snap() !== pre) pushUndo(pre); else save();
		buildInspector();
		requestRender();
	};

	inp.addEventListener('input', () => { t.text = inp.value; });
	inp.addEventListener('keydown', ev => {
		ev.stopPropagation();
		if (ev.key === 'Enter') finish(true);
		else if (ev.key === 'Escape') finish(false);
	});
	inp.addEventListener('blur', () => {
		if (!ready) { requestAnimationFrame(() => { if (!done) { inp.focus(); inp.select(); } }); return; }
		finish(true);
	});

	requestAnimationFrame(() => {
		inp.focus();
		inp.select();
		requestAnimationFrame(() => { ready = true; });
	});
}

/* ————— inspector: style controls ————— */

const W_PRESETS = { level: [1, 1.75, 2.5, 3.5], line: [1.6, 2.4, 3.2, 4.5], arrow: [1.8, 2.6, 3.6, 4.8] };
const SIZE_PRESETS = [13, 16, 20, 26];

function effColor(type, el) {
	if (type === 'candle') return el.color || (el.c >= el.o ? COL.up : COL.down);
	if (type === 'level') return el.color || COL.level;
	if (type === 'text') return el.color || COL.crossText;
	return el.color || COL.tline;			// line, arrow
}

function isDashed(type, el) {
	return type === 'level' ? el.dash !== false : !!el.dash;
}

/* horizontal props-bar control groups */
function pColor(type, el) {
	const has = !!el.color;
	return `<span class="p-group"><span class="p-lbl">Colour</span>` +
		`<span class="color-wrap"><input type="color" class="color-in" data-style="color" value="${effColor(type, el)}" aria-label="Colour">` +
		`<button class="reset-btn${has ? '' : ' hidden'}" data-reset="color" title="Reset to theme colour">↺</button></span></span>`;
}

function pWeight(type, el) {
	const wp = W_PRESETS[type];
	const cur = el.width != null ? el.width : wp[0];
	const btns = wp.map(v =>
		`<button class="seg-btn${Math.abs(v - cur) < 0.01 ? ' active' : ''}" data-style="width" data-val="${v}" title="${v}px" aria-label="Weight ${v}px">` +
		`<span class="wbar" style="height:${v}px"></span></button>`).join('');
	return `<span class="p-group"><span class="p-lbl">Weight</span><div class="seg">${btns}</div></span>`;
}

function pDash(type, el) {
	const on = isDashed(type, el);
	return `<span class="p-group"><span class="p-lbl">Line</span><div class="seg">` +
		`<button class="seg-btn${on ? '' : ' active'}" data-style="dash" data-val="0" aria-label="Solid line"><span class="dashbar solid"></span></button>` +
		`<button class="seg-btn${on ? ' active' : ''}" data-style="dash" data-val="1" aria-label="Dashed line"><span class="dashbar dashed"></span></button>` +
		`</div></span>`;
}

function pSize(el) {
	const cur = el.size || DEF_TEXT_SIZE;
	const btns = SIZE_PRESETS.map((v, i) =>
		`<button class="seg-btn${Math.abs(v - cur) < 0.01 ? ' active' : ''}" data-style="size" data-val="${v}" aria-label="Size ${v}">` +
		`<span style="font-size:${9 + i * 2.5}px;line-height:1">A</span></button>`).join('');
	return `<span class="p-group"><span class="p-lbl">Size</span><div class="seg">${btns}</div></span>`;
}

function pStyle(type, el) {
	if (type === 'text') return pColor(type, el) + pSize(el);
	if (type === 'candle') return pColor(type, el);
	return pColor(type, el) + pWeight(type, el) + pDash(type, el);	// level, line, arrow
}

/* ————— inspector ————— */

function buildInspector() {
	const el = findSel();
	inspectorEl.hidden = false;		// the bar is always docked so the chart never reflows
	const trashSvg = '<svg viewBox="0 0 16 16"><path d="M2.8 4.5h10.4M6.3 4.5V3a.8.8 0 0 1 .8-.8h1.8a.8.8 0 0 1 .8.8v1.5M4.2 4.5l.6 8.3a1 1 0 0 0 1 .95h4.4a1 1 0 0 0 1-.95l.6-8.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

	/* multi-selection from a box drag */
	if (marquee.length && tool === 'select') {
		const lockIcon = '<svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
		inspectorEl.innerHTML =
			`<span class="p-dot" style="background:${COL.accent}"></span>` +
			`<span class="p-title">${marquee.length} objects selected</span><span class="p-div"></span>` +
			`<span class="p-empty">Drag any one to move them together</span>` +
			`<span class="p-spacer"></span>` +
			`<button class="p-btn" data-gact="lock" title="Lock / unlock all">${lockIcon}</button>` +
			`<button class="p-btn wide" data-gact="clear">Deselect</button>` +
			`<button class="p-btn danger" data-gact="del" title="Delete selected">${trashSvg}</button>`;
		inspectorEl.querySelector('[data-gact="lock"]').addEventListener('click', lockMarquee);
		inspectorEl.querySelector('[data-gact="clear"]').addEventListener('click', clearSelection);
		inspectorEl.querySelector('[data-gact="del"]').addEventListener('click', () => { deleteSelection(); requestRender(); });
		updateReadout();
		return;
	}

	/* it's an editing surface — populated only in the pointer tool with a
	   selection; otherwise a muted placeholder keeps the layout stable */
	if (!el || tool !== 'select') {
		const msg = tool !== 'select'
			? 'Switch to the pointer tool to edit objects'
			: 'Select an object to edit its properties · right-click for actions';
		inspectorEl.innerHTML = `<span class="p-empty">${msg}</span>`;
		updateReadout();
		return;
	}

	const dot = `<span class="p-dot" style="background:${effColor(sel.type, el)}"></span>`;
	const numField = (k, label) => `<div class="field"><label>${label}</label><input type="number" step="0.25" data-k="${k}" value="${fmt(el[k])}"></div>`;
	const lockIcon = '<svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
	const lockBtn = `<button class="p-btn" data-act="lock" title="Lock" aria-label="Lock">${lockIcon}</button>`;
	const delBtn = `<button class="p-btn danger" data-act="del" title="Delete — ⌫" aria-label="Delete">${trashSvg}</button>`;
	const div = '<span class="p-div"></span>';

	/* locked object: read-only strip with just an Unlock action */
	if (el.locked) {
		const name = { candle: `Candle · bar ${el.slot}`, level: 'Price level', line: 'Trendline', arrow: 'Arrow', text: 'Label' }[sel.type];
		inspectorEl.innerHTML = `${dot}<span class="p-title">${name}</span>${div}` +
			`<span class="p-locked">${lockIcon}<span>Locked — can't be moved or deleted</span></span>` +
			`<span class="p-spacer"></span><button class="p-btn wide" data-act="unlock">Unlock</button>`;
		inspectorEl.hidden = false;
		inspectorEl.querySelector('[data-act="unlock"]').addEventListener('click', () => toggleLock());
		updateReadout();
		return;
	}

	let mid = '', actions = '';
	if (sel.type === 'candle') {
		mid = `<div class="p-fields">${['o', 'h', 'l', 'c'].map(k => numField(k, k.toUpperCase())).join('')}</div>${div}${pStyle('candle', el)}`;
		actions = `<button class="p-btn wide" data-act="flip">Flip</button>${lockBtn}${delBtn}`;
	} else if (sel.type === 'level') {
		mid = `<div class="p-fields">${numField('price', '@')}</div>${div}${pStyle('level', el)}`;
		actions = `${lockBtn}${delBtn}`;
	} else if (sel.type === 'text') {
		mid = pStyle('text', el);
		actions = `<button class="p-btn wide" data-act="edit">Edit text</button>${lockBtn}${delBtn}`;
	} else {
		const from = sel.type === 'arrow' ? 'From' : 'P1', to = sel.type === 'arrow' ? 'To' : 'P2';
		mid = `<div class="p-fields">${numField('p1', from)}${numField('p2', to)}</div>${div}${pStyle(sel.type, el)}`;
		actions = `${lockBtn}${delBtn}`;
	}
	const title = { candle: `Candle · bar ${el.slot}`, level: 'Price level', line: 'Trendline', arrow: 'Arrow', text: 'Label' }[sel.type];
	inspectorEl.innerHTML = `${dot}<span class="p-title">${title}</span>${div}${mid}<span class="p-spacer"></span>${actions}`;
	inspectorEl.hidden = false;

	inspectorEl.querySelectorAll('input[data-k]').forEach(inp => {
		inp.addEventListener('focus', () => { inspectorEditing = true; inp.dataset.pre = snap(); inp.select(); });
		inp.addEventListener('input', () => {
			const el2 = findSel();
			if (!el2) return;
			const v = parseFloat(inp.value);
			if (!isFinite(v)) return;
			el2[inp.dataset.k] = v;
			if (sel.type === 'candle') {
				el2.h = Math.max(el2.h, el2.o, el2.c);
				el2.l = Math.min(el2.l, el2.o, el2.c);
			}
			requestRender();
		});
		inp.addEventListener('blur', () => {
			inspectorEditing = false;
			if (inp.dataset.pre && snap() !== inp.dataset.pre) pushUndo(inp.dataset.pre);
			delete inp.dataset.pre;
			buildInspector();
			requestRender();
		});
		inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
	});

	/* live color picker: apply on input, commit one undo step on change */
	const colorIn = inspectorEl.querySelector('input[data-style="color"]');
	if (colorIn) {
		colorIn.addEventListener('input', () => {
			const el2 = findSel();
			if (!el2) return;
			if (!colorIn.dataset.pre) colorIn.dataset.pre = snap();
			el2.color = colorIn.value;
			const dot = inspectorEl.querySelector('.p-dot');
			if (dot) dot.style.background = colorIn.value;
			const reset = inspectorEl.querySelector('[data-reset="color"]');
			if (reset) reset.classList.remove('hidden');
			requestRender();
		});
		colorIn.addEventListener('change', () => {
			if (colorIn.dataset.pre && snap() !== colorIn.dataset.pre) pushUndo(colorIn.dataset.pre);
			delete colorIn.dataset.pre;
		});
	}

	/* segmented style buttons: weight, dash, size */
	inspectorEl.querySelectorAll('.seg-btn[data-style]').forEach(btn => {
		btn.addEventListener('click', () => {
			const el2 = findSel();
			if (!el2) return;
			const key = btn.dataset.style, raw = btn.dataset.val;
			const pre = snap();
			if (key === 'width') el2.width = +raw;
			else if (key === 'size') el2.size = +raw;
			else if (key === 'dash') el2.dash = raw === '1';
			if (snap() !== pre) pushUndo(pre);
			buildInspector();
			requestRender();
		});
	});

	const resetColor = inspectorEl.querySelector('[data-reset="color"]');
	if (resetColor) resetColor.addEventListener('click', () => {
		const el2 = findSel();
		if (!el2 || !el2.color) return;
		const pre = snap();
		delete el2.color;
		pushUndo(pre);
		buildInspector();
		requestRender();
	});

	inspectorEl.querySelectorAll('[data-act]').forEach(btn => {
		btn.addEventListener('click', () => {
			const el2 = findSel();
			if (!el2) return;
			if (btn.dataset.act === 'del') { deleteSelection(); requestRender(); }
			else if (btn.dataset.act === 'flip') { flipCandle(el2); requestRender(); }
			else if (btn.dataset.act === 'edit') { startTextEdit(sel.id); }
			else if (btn.dataset.act === 'lock') { toggleLock(); }
		});
	});
	updateReadout();
}

function syncInspectorValues() {
	const el = findSel();
	if (!el || inspectorEl.hidden) return;
	inspectorEl.querySelectorAll('input[data-k]').forEach(inp => {
		if (document.activeElement !== inp) inp.value = fmt(el[inp.dataset.k]);
	});
	const dot = inspectorEl.querySelector('.p-dot');
	if (dot && sel.type === 'candle') dot.style.background = effColor('candle', el);
	const title = inspectorEl.querySelector('.p-title');
	if (title && sel.type === 'candle') title.textContent = `Candle · bar ${el.slot}`;
}

function updateReadout() {
	const el = findSel();
	if (marquee.length) {
		readoutEl.innerHTML = `<span><b>${marquee.length}</b> selected</span>`;
		return;
	}
	if (el && sel.type === 'candle') {
		const up = el.c >= el.o;
		readoutEl.innerHTML =
			`<span>O <b>${fmt(el.o)}</b></span><span>H <b>${fmt(el.h)}</b></span>` +
			`<span>L <b>${fmt(el.l)}</b></span><span>C <b>${fmt(el.c)}</b></span>` +
			`<span class="${up ? 'u' : 'd'}">${up ? '▲' : '▼'} ${fmt(Math.abs(el.c - el.o))}</span>`;
	} else if (el && sel.type === 'level') {
		readoutEl.innerHTML = `<span>Level <b>${fmt(el.price)}</b></span>`;
	} else if (el && sel.type === 'line') {
		readoutEl.innerHTML = `<span>Line <b>${fmt(el.p1)}</b> → <b>${fmt(el.p2)}</b></span>`;
	} else if (el && sel.type === 'arrow') {
		readoutEl.innerHTML = `<span>Arrow <b>${fmt(el.p1)}</b> → <b>${fmt(el.p2)}</b></span>`;
	} else if (el && sel.type === 'text') {
		readoutEl.innerHTML = `<span>Label <b>${escHtml(el.text || '(empty)')}</b></span>`;
	} else {
		readoutEl.innerHTML = `<span>${doc.candles.length} bars</span>`;
	}
}

/* ————— rendering ————— */

function requestRender() {
	if (renderQueued) return;
	renderQueued = true;
	requestAnimationFrame(() => {
		renderQueued = false;
		render();
	});
}

function render() {
	svg.innerHTML = buildScene(true);
	emptyEl.hidden = ['candles', 'levels', 'lines', 'arrows', 'texts'].some(k => doc[k].length > 0);
	updateReadout();
	if (cursor && cursor.x <= W && cursor.y <= H) {
		cursorTagEl.textContent = fmt(yToPrice(cursor.y));
	} else {
		cursorTagEl.textContent = '';
	}
}

function buildScene(ui) {
	const parts = [];
	const dp = axisPriceDp();

	/* grid — horizontal price lines */
	const step = gridStep();
	const p0 = Math.ceil(view.pMin / step) * step;
	for (let p = p0; p <= view.pMax + 1e-9; p += step) {
		const y = priceToY(p);
		parts.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="${COL.grid}"/>`);
		parts.push(`<text x="${W + 8}" y="${(y + 3.5).toFixed(1)}" fill="${COL.axisText}" font-family="ui-monospace,Menlo,monospace" font-size="10.5">${p.toFixed(dp)}</text>`);
	}

	/* grid — vertical slot lines + x-axis labels (bar index or time) */
	let n = 1;
	const gap = xLabelGap();
	while (n * view.slotW < gap) n *= n < 5 ? 5 : 2;
	const s0 = Math.ceil(view.xOff / n) * n;
	const xEdge = W - (doc.axis && doc.axis.xMode === 'time' ? 20 : 12);
	for (let s = s0; slotToX(s) <= W; s += n) {
		const x = slotToX(s);
		if (x < 0) continue;
		parts.push(`<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}" stroke="${COL.grid}"/>`);
		if (x <= xEdge) parts.push(`<text x="${x.toFixed(1)}" y="${H + 15}" fill="${COL.axisText}" font-family="ui-monospace,Menlo,monospace" font-size="10" text-anchor="middle">${xLabel(s)}</text>`);
	}

	/* levels (behind candles) */
	for (const lv of doc.levels) {
		const y = priceToY(lv.price);
		if (y < -10 || y > H + 10) continue;
		const isSel = sel && sel.id === lv.id;
		const isHov = hover && hover.id === lv.id;
		const col = lv.color || COL.level;
		const base = lv.width != null ? lv.width : DEF_W.level;
		const w = (isSel || isHov ? 0.6 : 0) + base;
		const op = isSel ? 1 : 0.78;
		const dash = lv.dash === false ? '' : ' stroke-dasharray="7 5"';
		parts.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="${col}" stroke-width="${w}"${dash} opacity="${op}"/>`);
		if (ui) {
			parts.push(tag(W, y, fmt(lv.price), col, contrastInk(col)));
			if (isSel && !lv.locked && !inMarquee(lv.id)) parts.push(`<circle cx="${W / 2}" cy="${y.toFixed(1)}" r="4" fill="${COL.bg}" stroke="${COL.accent}" stroke-width="1.5"/>`);
		}
	}

	/* trendlines */
	for (const ln of doc.lines) {
		const x1 = slotToX(ln.x1), y1 = priceToY(ln.p1);
		const x2 = slotToX(ln.x2), y2 = priceToY(ln.p2);
		const isSel = sel && sel.id === ln.id;
		const isHov = hover && hover.id === ln.id;
		const col = ln.color || COL.tline;
		const w = (ln.width != null ? ln.width : DEF_W.line) + (isSel || isHov ? 0.5 : 0);
		const dash = ln.dash ? ` stroke-dasharray="${(w * 3).toFixed(1)} ${(w * 2.6).toFixed(1)}"` : '';
		parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="${w.toFixed(1)}" stroke-linecap="round"${dash} opacity="${isSel ? 1 : 0.9}"/>`);
		if (ui && (isSel || isHov) && !ln.locked && !inMarquee(ln.id)) {
			for (const [px, py] of [[x1, y1], [x2, y2]]) {
				parts.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" fill="${COL.bg}" stroke="${isSel ? COL.accent : col}" stroke-width="1.5"/>`);
			}
		}
	}

	/* arrows */
	for (const ar of doc.arrows) {
		const x1 = slotToX(ar.x1), y1 = priceToY(ar.p1);
		const x2 = slotToX(ar.x2), y2 = priceToY(ar.p2);
		const isSel = sel && sel.id === ar.id;
		const isHov = hover && hover.id === ar.id;
		const col = ar.color || COL.tline;
		const w = (ar.width != null ? ar.width : DEF_W.arrow) + (isSel || isHov ? 0.4 : 0);
		const ang = Math.atan2(y2 - y1, x2 - x1);
		const hl = 8 + w * 2.2;				// arrowhead length scales with weight
		const ha = 0.42;					// half-angle
		const bx = x2 - Math.cos(ang) * hl * 0.82;	// line stops short of the tip
		const by = y2 - Math.sin(ang) * hl * 0.82;
		const p1x = x2 - Math.cos(ang - ha) * hl, p1y = y2 - Math.sin(ang - ha) * hl;
		const p2x = x2 - Math.cos(ang + ha) * hl, p2y = y2 - Math.sin(ang + ha) * hl;
		const dash = ar.dash ? ` stroke-dasharray="${(w * 3).toFixed(1)} ${(w * 2.6).toFixed(1)}"` : '';
		parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${col}" stroke-width="${w.toFixed(1)}" stroke-linecap="round"${dash} opacity="${isSel ? 1 : 0.92}"/>`);
		parts.push(`<path d="M${x2.toFixed(1)} ${y2.toFixed(1)} L${p1x.toFixed(1)} ${p1y.toFixed(1)} L${p2x.toFixed(1)} ${p2y.toFixed(1)} Z" fill="${col}" opacity="${isSel ? 1 : 0.92}"/>`);
		if (ui && (isSel || isHov) && !ar.locked && !inMarquee(ar.id)) {
			for (const [px, py] of [[x1, y1], [x2, y2]]) {
				parts.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" fill="${COL.bg}" stroke="${isSel ? COL.accent : col}" stroke-width="1.5"/>`);
			}
		}
	}

	/* candles */
	const bw = bodyW();
	for (const c of doc.candles) {
		const cx = slotToX(c.slot);
		if (cx < -bw || cx > W + bw) continue;
		const up = c.c >= c.o;
		const col = c.color || (up ? COL.up : COL.down);
		const yH = priceToY(c.h), yL = priceToY(c.l);
		const bt = priceToY(Math.max(c.o, c.c));
		let bb = priceToY(Math.min(c.o, c.c));
		if (bb - bt < 1.2) bb = bt + 1.2;
		const isSel = sel && sel.id === c.id;
		const isHov = hover && hover.id === c.id;

		parts.push(`<line x1="${cx.toFixed(1)}" y1="${yH.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yL.toFixed(1)}" stroke="${col}" stroke-width="1.4"/>`);
		parts.push(`<rect x="${(cx - bw / 2).toFixed(1)}" y="${bt.toFixed(1)}" width="${bw.toFixed(1)}" height="${(bb - bt).toFixed(1)}" rx="1" fill="${col}"/>`);

		if (ui && (isSel || isHov) && !c.locked && !inMarquee(c.id)) {
			const em = part =>
				(isHov && hover.part === part) ||
				(gesture && gesture.hit && gesture.hit.id === c.id && gesture.hit.part === part);
			const hw = Math.max(bw / 2 + 4, 9);
			parts.push(`<rect x="${(cx - hw).toFixed(1)}" y="${(bt - 1.5).toFixed(1)}" width="${hw * 2}" height="${(bb - bt + 3).toFixed(1)}" rx="3" fill="none" stroke="${COL.accent}" stroke-width="${isSel ? 1.4 : 1}" opacity="${isSel ? 0.9 : 0.45}"/>`);
			/* wick handles */
			for (const [part, wy] of [['high', yH], ['low', yL]]) {
				const e = em(part);
				parts.push(`<circle cx="${cx.toFixed(1)}" cy="${wy.toFixed(1)}" r="${e ? 4.6 : 3.4}" fill="${e ? COL.accent : COL.bg}" stroke="${COL.accent}" stroke-width="1.5"/>`);
			}
			/* body edge handles */
			for (const [part, by] of [['bodyTop', bt], ['bodyBottom', bb]]) {
				const e = em(part);
				const pw = e ? 15 : 10, ph = e ? 4.4 : 3;
				parts.push(`<rect x="${(cx - pw / 2).toFixed(1)}" y="${(by - ph / 2).toFixed(1)}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="${e ? COL.accent : COL.pill}" ${e ? '' : `stroke="${COL.accent}" stroke-width="1"`}/>`);
			}
		}
	}

	/* text labels (above candles) */
	for (const t of doc.texts) {
		if (editingTextId === t.id) continue;		// hidden while the HTML editor is open
		const cx = slotToX(t.x), cy = priceToY(t.p);
		const isSel = sel && sel.id === t.id;
		const isHov = hover && hover.id === t.id;
		const size = t.size || DEF_TEXT_SIZE;
		const label = t.text || 'Text';
		const col = t.text ? (t.color || COL.crossText) : COL.axisText;
		if (ui && (isSel || isHov)) {
			const b = textBox(t);
			parts.push(`<rect x="${(cx - b.halfW).toFixed(1)}" y="${(cy - b.halfH).toFixed(1)}" width="${(b.halfW * 2).toFixed(1)}" height="${(b.halfH * 2).toFixed(1)}" rx="4" fill="${COL.chrome}" stroke="${isSel ? COL.accent : COL.hairline}" stroke-width="${isSel ? 1.4 : 1}"/>`);
		}
		parts.push(`<text x="${cx.toFixed(1)}" y="${(cy + size * 0.34).toFixed(1)}" fill="${col}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="${size}" font-weight="500" text-anchor="middle" font-style="${t.text ? 'normal' : 'italic'}">${escHtml(label)}</text>`);
	}

	/* lock badges on locked objects */
	if (ui) {
		for (const c of doc.candles) if (c.locked) {
			const x = slotToX(c.slot); if (x >= 0 && x <= W) parts.push(lockGlyph(x, priceToY(c.h) - 9));
		}
		for (const lv of doc.levels) if (lv.locked) {
			const y = priceToY(lv.price); if (y >= 0 && y <= H) parts.push(lockGlyph(14, y - 9));
		}
		for (const ln of [...doc.lines, ...doc.arrows]) if (ln.locked) {
			const mx = (slotToX(ln.x1) + slotToX(ln.x2)) / 2, my = (priceToY(ln.p1) + priceToY(ln.p2)) / 2;
			if (mx >= 0 && mx <= W && my >= 0 && my <= H) parts.push(lockGlyph(mx, my - 9));
		}
		for (const t of doc.texts) if (t.locked && editingTextId !== t.id) {
			const b = textBox(t); const x = b.cx + b.halfW + 7;
			if (x >= 0 && x <= W && b.cy >= 0 && b.cy <= H) parts.push(lockGlyph(x, b.cy));
		}
	}

	/* marquee: highlight boxed members + the live drag rectangle */
	if (ui && marquee.length) {
		for (const m of marquee) {
			const el = findByHit(m);
			if (!el) continue;
			let a, b2, c2, d2;
			if (m.type === 'candle') { const cx = slotToX(el.slot), hw = bodyW() / 2 + 3; a = cx - hw; b2 = priceToY(el.h) - 3; c2 = cx + hw; d2 = priceToY(el.l) + 3; }
			else if (m.type === 'level') { const y = priceToY(el.price); a = 1; b2 = y - 4; c2 = W - 1; d2 = y + 4; }
			else if (m.type === 'text') { const bx = textBox(el); a = bx.cx - bx.halfW - 2; b2 = bx.cy - bx.halfH - 2; c2 = bx.cx + bx.halfW + 2; d2 = bx.cy + bx.halfH + 2; }
			else { const xa = slotToX(el.x1), xb = slotToX(el.x2), ya = priceToY(el.p1), yb = priceToY(el.p2); a = Math.min(xa, xb) - 4; b2 = Math.min(ya, yb) - 4; c2 = Math.max(xa, xb) + 4; d2 = Math.max(ya, yb) + 4; }
			parts.push(`<rect x="${a.toFixed(1)}" y="${b2.toFixed(1)}" width="${(c2 - a).toFixed(1)}" height="${(d2 - b2).toFixed(1)}" rx="3" fill="${COL.accent}" fill-opacity="0.07" stroke="${COL.accent}" stroke-width="1" stroke-dasharray="3 3"/>`);
		}
	}
	if (ui && gesture && gesture.mode === 'marquee') {
		const x0 = Math.min(gesture.x0, gesture.x1), y0 = Math.min(gesture.y0, gesture.y1);
		const w2 = Math.abs(gesture.x1 - gesture.x0), h2 = Math.abs(gesture.y1 - gesture.y0);
		parts.push(`<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w2.toFixed(1)}" height="${h2.toFixed(1)}" fill="${COL.accent}" fill-opacity="0.08" stroke="${COL.accent}" stroke-width="1" stroke-dasharray="4 3"/>`);
	}

	/* palette drop ghost */
	if (ui && palDrag && palDrag.over) {
		const ghosts = shapeCandles(palDrag.shape, yToPrice(palDrag.y), 'drop');
		const s0g = Math.round(xToSlotF(palDrag.x));
		let ghost = '';
		ghosts.forEach((g, i) => {
			const gx = slotToX(s0g + i);
			const col = g.c >= g.o ? COL.up : COL.down;
			const bt2 = priceToY(Math.max(g.o, g.c));
			let bb2 = priceToY(Math.min(g.o, g.c));
			if (bb2 - bt2 < 1.2) bb2 = bt2 + 1.2;
			ghost += `<line x1="${gx.toFixed(1)}" y1="${priceToY(g.h).toFixed(1)}" x2="${gx.toFixed(1)}" y2="${priceToY(g.l).toFixed(1)}" stroke="${col}" stroke-width="1.4"/>` +
				`<rect x="${(gx - bw / 2).toFixed(1)}" y="${bt2.toFixed(1)}" width="${bw.toFixed(1)}" height="${(bb2 - bt2).toFixed(1)}" rx="1" fill="${col}"/>`;
		});
		parts.push(`<g opacity="0.55">${ghost}</g>`);
		parts.push(tag(W, palDrag.y, fmt(yToPrice(palDrag.y)), COL.hairline, COL.crossText));
	}

	/* crosshair */
	if (ui && cursor && !gesture && !palDrag && cursor.x <= W && cursor.y <= H) {
		const s = Math.round(xToSlotF(cursor.x));
		const cx = slotToX(s);
		if (cx >= 0 && cx <= W) {
			const lab = xLabel(s);
			const halfW = Math.max(14, lab.length * 3.4 + 6);
			parts.push(`<line x1="${cx.toFixed(1)}" y1="0" x2="${cx.toFixed(1)}" y2="${H}" stroke="${COL.crossLine}" stroke-dasharray="3 4"/>`);
			parts.push(`<rect x="${(cx - halfW).toFixed(1)}" y="${H + 3}" width="${(halfW * 2).toFixed(1)}" height="16" rx="4" fill="${COL.hairline}"/>`);
			parts.push(`<text x="${cx.toFixed(1)}" y="${H + 14.5}" fill="${COL.crossText}" font-family="ui-monospace,Menlo,monospace" font-size="10" text-anchor="middle">${lab}</text>`);
		}
		const y = cursor.y;
		parts.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="${COL.crossLine}" stroke-dasharray="3 4"/>`);
		parts.push(tag(W, y, fmt(yToPrice(y)), COL.hairline, COL.crossText));
	}

	/* axis hairlines */
	parts.push(`<line x1="${W}" y1="0" x2="${W}" y2="${H + XAXIS_H}" stroke="${COL.hairline}"/>`);
	parts.push(`<line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="${COL.hairline}"/>`);

	return parts.join('');
}

function tag(xAxis, y, text, bg, fg) {
	const h = 17;
	const yy = clamp(y, h / 2, H - h / 2);
	return `<g><rect x="${xAxis + 2}" y="${(yy - h / 2).toFixed(1)}" width="${AXIS_W - 5}" height="${h}" rx="4" fill="${bg}"/>` +
		`<text x="${xAxis + AXIS_W / 2 - 1}" y="${(yy + 3.5).toFixed(1)}" fill="${fg}" font-family="ui-monospace,Menlo,monospace" font-size="10.5" text-anchor="middle">${text}</text></g>`;
}

/* ————— PNG export ————— */

function exportPng() {
	const fullW = W + AXIS_W, fullH = H + XAXIS_H;
	const inner = buildScene(false);
	const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${fullW}" height="${fullH}" viewBox="0 0 ${fullW} ${fullH}">` +
		`<rect width="${fullW}" height="${fullH}" fill="${COL.bg}"/>` + inner + `</svg>`;
	const img = new Image();
	img.onload = () => {
		const canvas = document.createElement('canvas');
		canvas.width = fullW * 2;
		canvas.height = fullH * 2;
		const ctx = canvas.getContext('2d');
		ctx.scale(2, 2);
		ctx.drawImage(img, 0, 0);
		canvas.toBlob(blob => {
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = 'pattern.png';
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 5000);
		});
	};
	img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
}

/* ————— theme picker ————— */

const themePanel = document.getElementById('panelTheme');
wireMenuToggle(document.getElementById('btnTheme'), themePanel);
for (const [key, t] of Object.entries(THEMES)) {
	const item = document.createElement('button');
	item.className = 'theme-item';
	item.dataset.theme = key;
	item.innerHTML =
		`<span class="theme-swatch">` +
		`<i style="background:${t.css.bg}"></i><i style="background:${t.css.up}"></i>` +
		`<i style="background:${t.css.down}"></i><i style="background:${t.css.accent}"></i></span>` +
		`<span>${t.label}</span>`;
	item.addEventListener('click', () => { applyTheme(key); closeMenus(); });
	themePanel.appendChild(item);
}
applyTheme(savedTheme());

/* ————— axis panel ————— */

const axisPanel = document.getElementById('panelAxis');
wireMenuToggle(document.getElementById('btnAxis'), axisPanel);

function setAxis(patch) {
	const pre = snap();
	doc.axis = Object.assign({}, doc.axis, patch);
	if (snap() !== pre) pushUndo(pre); else save();
	renderAxisPanel();
	requestRender();
}

function renderAxisPanel() {
	const ax = doc.axis || defaultAxis();
	const isTime = ax.xMode === 'time';
	const daily = ax.tf >= 1440;
	const tfOpts = TF_PRESETS.map(t => `<option value="${t.v}"${t.v === ax.tf ? ' selected' : ''}>${t.label}</option>`).join('');
	const dpOpts = ['Auto', 0, 1, 2, 3, 4, 5].map(v => {
		const val = v === 'Auto' ? '' : v;
		const on = (v === 'Auto' && ax.priceDp == null) || v === ax.priceDp;
		return `<option value="${val}"${on ? ' selected' : ''}>${v}</option>`;
	}).join('');

	axisPanel.innerHTML = `
		<div class="axis-sec">
			<span class="axis-h">Time axis</span>
			<div class="seg full">
				<button class="seg-btn${isTime ? '' : ' active'}" data-ax="index">Bars</button>
				<button class="seg-btn${isTime ? ' active' : ''}" data-ax="time">Time</button>
			</div>
			${isTime ? `
			<div class="axis-field"><span class="axis-lbl">Timeframe</span>
				<select id="axTf">${tfOpts}</select></div>
			<div class="axis-field"><span class="axis-lbl">Start</span>
				${daily
					? `<input id="axStart" type="text" value="${escHtml(ax.date)}" placeholder="YYYY-MM-DD" spellcheck="false">`
					: `<input id="axStart" type="text" value="${escHtml(ax.clock)}" placeholder="HH:MM" spellcheck="false">`}
			</div>` : ''}
		</div>
		<div class="axis-sec">
			<span class="axis-h">Price axis</span>
			<div class="axis-field"><span class="axis-lbl">Decimals</span>
				<select id="axDp">${dpOpts}</select></div>
		</div>`;

	axisPanel.querySelectorAll('[data-ax]').forEach(b =>
		b.addEventListener('click', () => setAxis({ xMode: b.dataset.ax })));

	const tf = axisPanel.querySelector('#axTf');
	if (tf) tf.addEventListener('change', () => setAxis({ tf: +tf.value }));

	const start = axisPanel.querySelector('#axStart');
	if (start) {
		const commit = () => setAxis(daily ? { date: start.value.trim() } : { clock: start.value.trim() });
		start.addEventListener('change', commit);
		start.addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); start.blur(); } });
	}

	const dp = axisPanel.querySelector('#axDp');
	if (dp) dp.addEventListener('change', () => setAxis({ priceDp: dp.value === '' ? null : +dp.value }));
}

renderAxisPanel();

/* ————— help overlay ————— */

const helpEl = document.getElementById('help');
function toggleHelp(force) {
	const show = force === undefined ? helpEl.hidden : force;
	helpEl.hidden = !show;
	if (show) closeMenus();
}
document.getElementById('btnHelp').addEventListener('click', () => toggleHelp());
document.getElementById('helpClose').addEventListener('click', () => toggleHelp(false));
helpEl.addEventListener('pointerdown', e => { if (e.target === helpEl) toggleHelp(false); });

/* ————— share by URL ————— */

function encodeDoc(d) {
	const st = el => { const s = styleOf(el); return Object.keys(s).length ? s : undefined; };
	const seg = l => { const s = st(l); const base = [numOut(l.x1), numOut(l.p1), numOut(l.x2), numOut(l.p2)]; return s ? [...base, s] : base; };
	const payload = {
		x: { ...d.axis },
		c: sortedCandles().map(c => { const s = st(c); const base = [c.slot, numOut(c.o), numOut(c.h), numOut(c.l), numOut(c.c)]; return s ? [...base, s] : base; }),
		v: d.levels.map(l => { const s = st(l); return s ? [numOut(l.price), s] : numOut(l.price); }),
		l: d.lines.map(seg),
		a: d.arrows.map(seg),
		t: d.texts.map(x => { const s = st(x); const base = [numOut(x.x), numOut(x.p), x.text]; return s ? [...base, s] : base; }),
	};
	const json = JSON.stringify(payload);
	return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeDoc(str) {
	const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
	const json = decodeURIComponent(escape(atob(b64)));
	const p = JSON.parse(json);
	const seg = a => ({ id: uid(), x1: +a[0], p1: +a[1], x2: +a[2], p2: +a[3], ...importStyle(a[4]) });
	return normalizeDoc({
		axis: p.x ? sanitizeAxis(p.x) : undefined,
		candles: (p.c || []).map(a => ({ id: uid(), slot: +a[0], o: +a[1], h: +a[2], l: +a[3], c: +a[4], ...importStyle(a[5]) })),
		levels: (p.v || []).map(v => Array.isArray(v)
			? { id: uid(), price: +v[0], ...importStyle(v[1]) }
			: { id: uid(), price: +v }),
		lines: (p.l || []).map(seg),
		arrows: (p.a || []).map(seg),
		texts: (p.t || []).map(a => ({ id: uid(), x: +a[0], p: +a[1], text: String(a[2] || '').slice(0, 60), ...importStyle(a[3]) })),
	});
}

async function shareLink() {
	const url = location.origin + location.pathname + '#p=' + encodeDoc(doc);
	try {
		history.replaceState(null, '', url);
	} catch (e) { /* file:// blocks replaceState */ }
	let copied = false;
	try {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			await navigator.clipboard.writeText(url);
			copied = true;
		}
	} catch (e) { /* fall through */ }
	if (url.length > 8000) {
		flashHint('Link copied, but it is very long — for big charts, export JSON instead');
	} else {
		flashHint(copied ? 'Shareable link copied to clipboard' : 'Shareable link is in your address bar — copy it');
	}
}
document.getElementById('btnShare').addEventListener('click', shareLink);

function loadFromHash() {
	const m = location.hash.match(/[#&]p=([^&]+)/);
	if (!m) return false;
	try {
		doc = decodeDoc(m[1]);
		return true;
	} catch (e) { return false; }
}

/* ————— small-screen notice ————— */

const smallEl = document.getElementById('smallScreen');
document.getElementById('smallDismiss').addEventListener('click', () => {
	document.body.classList.remove('show-small');
	try { sessionStorage.setItem('patternlab.dismissedSmall', '1'); } catch (e) {}
});
function checkSmallScreen() {
	let dismissed = false;
	try { dismissed = sessionStorage.getItem('patternlab.dismissedSmall') === '1'; } catch (e) {}
	const small = Math.min(window.innerWidth, window.innerHeight) < 600 || window.innerWidth < 720;
	document.body.classList.toggle('show-small', small && !dismissed);
}
window.addEventListener('resize', checkSmallScreen);
checkSmallScreen();

/* ————— first-visit tip ————— */

const TIP_KEY = 'patternlab.tipSeen';
const tipEl = document.getElementById('firstTip');
let tipShowing = false;

function tipSeen() {
	try { return localStorage.getItem(TIP_KEY) === '1'; } catch (e) { return true; }
}

function showFirstTip() {
	if (tipSeen() || tipShowing || !doc.candles.length) return;
	tipEl.hidden = false;
	tipShowing = true;
}

function dismissTip() {
	if (!tipShowing) return;
	tipShowing = false;
	try { localStorage.setItem(TIP_KEY, '1'); } catch (e) { /* ignore */ }
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (reduce) { tipEl.hidden = true; return; }
	tipEl.classList.add('leaving');
	tipEl.addEventListener('animationend', () => {
		tipEl.hidden = true;
		tipEl.classList.remove('leaving');
	}, { once: true });
}

document.getElementById('tipDismiss').addEventListener('click', dismissTip);

/* ————— boot ————— */

function measure() {
	const r = stage.getBoundingClientRect();
	W = Math.max(100, r.width - AXIS_W);
	H = Math.max(100, r.height - XAXIS_H);
}

new ResizeObserver(() => { measure(); requestRender(); }).observe(stage);

measure();
let firstVisit = false;
if (loadFromHash()) {
	/* shared link wins; clear it from storage-independent state and fit */
	idSeq = Math.max(idSeq, 1000);
	fitView();
	save();
} else if (!load()) {
	/* genuine first visit — show the seed instantly, then swap in live data
	   (?noload keeps the static seed, e.g. for automated tests) */
	doc = normalizeDoc(seedDoc());
	fitView();
	firstVisit = !/[?&]noload\b/.test(location.search);
	if (!firstVisit) save();
}
measure();
setTool('select');
buildInspector();
renderAxisPanel();
requestRender();
showFirstTip();
if (firstVisit) preloadMarket();

/* debug/test handle */
window.__lab = {
	get doc() { return doc; },
	get view() { return view; },
	get sel() { return sel; },
	get marquee() { return marquee; },
	get tool() { return tool; },
};
