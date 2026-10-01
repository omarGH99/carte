// The menu engine.
//
// One page, any restaurant. Everything specific to a brand -- dishes,
// translations, prices, hours, the illustration style -- lives in
// brands/<id>.json, and its palette in css/themes.css. The engine reads the
// brand's `layout` and renders one of three menu forms:
//
//   editorial -- a hero dish per chapter, thumbnail rows with dot leaders
//   print     -- set like a printed card: centred heads, text-led rows
//   cards     -- an illustrated grid, app-like
//
// No framework and no build step: the page is a few KB of HTML, CSS and JS,
// and the dish art is drawn in the browser from one-line specs (see art.js).

import { LANGUAGES, UI, CURRENCIES, ALLERGENS, DIETS } from './i18n.js';
import { dishSvg, tileFor, UID } from './art.js';

const BRANDS = window.MENU_BRANDS || {};
const BRAND_ID = window.MENU_BRAND || Object.keys(BRANDS)[0];
const RTL = new Set(['ku', 'ar']);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const KEYS = {
  brand: 'menu.brand',
  lang: 'menu.lang',
  avoid: 'menu.avoid',
  diet: 'menu.diet',
  list: (brand) => `menu.${brand}.list`,
};

const el = (id) => document.getElementById(id);

const dom = {
  root: document.documentElement,
  demoText: el('demo-text'),
  demoBrands: el('demo-brands'),
  heroMark: el('hero-mark'),
  heroKicker: el('hero-kicker'),
  heroName: el('hero-name'),
  heroKind: el('hero-kind'),
  heroSub: el('hero-sub'),
  heroStatus: el('hero-status'),
  heroCue: el('hero-cue'),
  heroCueText: el('hero-cue-text'),
  bar: el('bar'),
  barMark: el('bar-mark'),
  langs: el('langs'),
  groups: el('groups'),
  rail: el('rail'),
  contentsOpen: el('contents-open'),
  contentsLabel: el('contents-label'),
  searchOpen: el('search-open'),
  filterOpen: el('filter-open'),
  filterDot: el('filter-dot'),
  infoOpen: el('info-open'),
  alertBar: el('alert-bar'),
  main: el('main'),
  footName: el('foot-name'),
  footAddress: el('foot-address'),
  footPrices: el('foot-prices'),
  footNote: el('foot-note'),
  footCredit: el('foot-credit'),
  printMenu: el('print-menu'),
  toTop: el('to-top'),
  tray: el('tray'),
  trayCount: el('tray-count'),
  trayText: el('tray-text'),
  trayTotal: el('tray-total'),
  toast: el('toast'),
  sheetWrap: el('sheet-wrap'),
  sheetAlert: el('sheet-alert'),
  sheetMedia: el('sheet-media'),
  sheetName: el('sheet-name'),
  sheetPrice: el('sheet-price'),
  sheetTags: el('sheet-tags'),
  sheetDesc: el('sheet-desc'),
  sheetFacts: el('sheet-facts'),
  sheetFoot: el('sheet-foot'),
  searchWrap: el('search-wrap'),
  searchPanel: el('search-panel'),
  searchInput: el('search-input'),
  searchCancel: el('search-cancel'),
  results: el('results'),
  searchEmpty: el('search-empty'),
  filterWrap: el('filter-wrap'),
  filterTitle: el('filter-title'),
  filterClear: el('filter-clear'),
  filterDone: el('filter-done'),
  filterBody: el('filter-body'),
  contentsWrap: el('contents-wrap'),
  contentsTitle: el('contents-title'),
  contentsClose: el('contents-close'),
  contentsBody: el('contents-body'),
  listWrap: el('list-wrap'),
  listTitle: el('list-title'),
  listClear: el('list-clear'),
  listClose: el('list-close'),
  listLead: el('list-lead'),
  listItems: el('list-items'),
  listFoot: el('list-foot'),
  serverWrap: el('server-wrap'),
  serverTitle: el('server-title'),
  serverItems: el('server-items'),
  serverTotal: el('server-total'),
  serverNote: el('server-note'),
  infoWrap: el('info-wrap'),
  infoTitle: el('info-title'),
  infoClose: el('info-close'),
  infoBody: el('info-body'),
};

const state = {
  brand: null,
  lang: 'en',
  t: UI.en,
  group: null,
  avoid: new Set(),
  diet: new Set(),
  // `${itemId}|${variantIndex}` -> quantity
  list: new Map(),
  sheet: { id: null, variant: 0 },
  printing: false,
  spy: null,
};

/* ---------- storage ----------
   Every read and write is guarded: private browsing, blocked storage and
   embedded previews all throw, and the menu must still work without it. */

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not persisted */ }
  },
};

/* ---------- helpers ---------- */

const tr = (field) => (field && typeof field === 'object'
  ? field[state.lang] ?? field.en ?? ''
  : field ?? '');

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const esc = (field) => escapeHtml(tr(field));

function currency() {
  return CURRENCIES[state.brand.currency] || { en: state.brand.currency, decimals: 0 };
}

const numberFormat = () => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: currency().decimals,
  maximumFractionDigits: currency().decimals,
});

// Numerals are isolated so "12,000" never reorders inside Arabic or Kurdish.
const amount = (v) => `<bdi dir="ltr">${numberFormat().format(v)}</bdi>`;
const money = (v) => `${amount(v)} <span class="cur">${escapeHtml(currency()[state.lang] || currency().en)}</span>`;

const variants = (item) => item.prices || [{ label: null, price: item.price }];
const priceOf = (item, v = 0) => variants(item)[v]?.price ?? item.price;

function priceLine(item) {
  return variants(item).map((p) => amount(p.price)).join('<span class="slash"> / </span>');
}

function sizeLine(item) {
  return item.prices ? item.prices.map((p) => escapeHtml(tr(p.label))).join(' / ') : '';
}

const spiceLevel = (item) => {
  const tag = (item.tags || []).find((t) => t.startsWith('spicy'));
  return tag ? Number(tag.split(':')[1] || 1) : 0;
};
const hasTag = (item, tag) => (item.tags || []).includes(tag);

const catOf = (item) => state.brand.categories.find((c) => c.id === item.cat);
const itemById = (id) => state.brand.items.find((i) => i.id === id);

function numeral(index) {
  const n = state.brand.numerals;
  if (Array.isArray(n)) return n[index] || String(index + 1);
  if (n === 'roman') return ROMAN[index] || String(index + 1);
  return '';
}

/* ---------- art ----------
   Each dish is drawn once per brand and the string reused. Every copy put
   in the page gets its own clip-path id. */

const artCache = new Map();
let artSerial = 0;

function art(item) {
  if (!artCache.has(item.id)) {
    const tile = item.tile || catOf(item)?.tile;
    artCache.set(item.id, dishSvg(item, state.brand.art, tile));
  }
  artSerial += 1;
  return artCache.get(item.id).replaceAll(UID, `clip${artSerial}`);
}

/* ---------- motion ----------
   The dish builds itself layer by layer the first time it is opened (the
   choreography is in menu.css). Once per dish per visit: a second look is
   for reading, not for a show. */

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const plated = new Set();

function plate(svg, id) {
  if (!svg || plated.has(id) || reducedMotion()) return;
  plated.add(id);
  svg.classList.add('play');
  // Dropping the class afterwards leaves the plain, final drawing behind,
  // whatever the browser made of the animation.
  setTimeout(() => svg.classList.remove('play'), 3200);
}

// A small copy of the dish arcs down into the list bar.
function fly(svg) {
  if (!svg || reducedMotion() || dom.tray.hidden) return;
  const from = svg.getBoundingClientRect();
  const to = dom.trayCount.getBoundingClientRect();
  if (!from.width) return;
  const ghost = svg.cloneNode(true);
  ghost.classList.add('flyer');
  Object.assign(ghost.style, {
    left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
  });
  document.body.append(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const k = 26 / from.width;
  ghost.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.15 - 40}px) scale(${Math.max(k, 0.5)})`, opacity: 1, offset: 0.4 },
    { transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 0.4 },
  ], { duration: 700, easing: 'cubic-bezier(0.5, 0, 0.7, 1)' }).onfinish = () => {
    ghost.remove();
    dom.tray.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 280 });
  };
}

function bump(selector) {
  if (reducedMotion()) return;
  for (const node of document.querySelectorAll(selector)) {
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  }
}

/* ---------- time ---------- */

function now() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: state.brand.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, min: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// A day's opening as minutes from that day's midnight. Closing at or before
// opening means the service runs past midnight into the next day.
function span(day) {
  const hours = state.brand.hours[DAY_KEYS[day]];
  if (!hours) return null;
  const open = toMin(hours[0]);
  let close = toMin(hours[1]);
  if (close <= open) close += 1440;
  return { open, close, hours };
}

function openState() {
  try {
    const { day, min } = now();
    const today = span(day);
    if (today && min >= today.open && min < today.close) return { open: true, until: today.hours[1] };
    const yesterday = span((day + 6) % 7);
    if (yesterday && yesterday.close > 1440 && min < yesterday.close - 1440) {
      return { open: true, until: yesterday.hours[1] };
    }
    for (let ahead = 0; ahead < 8; ahead += 1) {
      const d = (day + ahead) % 7;
      const s = span(d);
      if (!s || (ahead === 0 && s.open <= min)) continue;
      return { open: false, ahead, day: d, at: s.hours[0] };
    }
  } catch { /* unknown timezone: say nothing rather than something wrong */ }
  return null;
}

function statusText() {
  const s = openState();
  if (!s) return null;
  const t = state.t;
  if (s.open) return { open: true, label: t.openNow, detail: t.openUntil(t.clock(s.until)) };
  const at = t.clock(s.at);
  const detail = s.ahead === 0 ? t.opensToday(at)
    : s.ahead === 1 ? t.opensTomorrow(at)
      : t.opensOn(t.days[s.day], at);
  return { open: false, label: t.closedNow, detail };
}

// Breakfast until noon, lunch from noon: a category can carry a window.
function serving(cat) {
  if (!cat.serves) return null;
  const [from, to] = cat.serves;
  let on = true;
  try {
    const { min } = now();
    on = min >= toMin(from) && min < toMin(to);
  } catch { /* leave it on */ }
  return { on, text: state.t.served(state.t.clock(from), state.t.clock(to)) };
}

/* ---------- filters ---------- */

function passesDiet(item) {
  for (const diet of state.diet) {
    if (diet === 'veg' && !(hasTag(item, 'veg') || hasTag(item, 'vegan'))) return false;
    if (diet === 'vegan' && !hasTag(item, 'vegan')) return false;
    if (diet === 'gf' && !hasTag(item, 'gf')) return false;
  }
  return true;
}

const hits = (item) => (item.allergens || []).filter((a) => state.avoid.has(a));
const allergenName = (key) => tr(ALLERGENS[key]) || key;

function warnText(item) {
  const found = hits(item);
  return found.length ? `${state.t.contains}: ${found.map(allergenName).join(', ')}` : '';
}

const filterCount = () => state.avoid.size + state.diet.size;

/* ---------- small marks ---------- */

const CHILI = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.2 1.4c-.2 1.2-.9 1.9-1.9 2.2l.6 1C11.6 4.4 12.6 3 12.6 1.4z"/><path d="M9.4 4.4c-1.3.3-1.8 1.7-2.2 3.2C6.4 10.4 4.4 12.6 1.4 13.8c4 .8 8.4-.7 10.4-3.7 1.6-2.5 1.1-5.1-.6-5.9-.6-.2-1.2-.1-1.8.2z"/></svg>';

function marks(item) {
  const t = state.t;
  const out = [];
  const spice = spiceLevel(item);
  if (spice) {
    out.push(`<span class="mk mk-spicy" role="img" aria-label="${escapeHtml(t.spicyLevel(spice))}" title="${escapeHtml(t.spicyLevel(spice))}">${CHILI.repeat(spice)}</span>`);
  }
  if (hasTag(item, 'vegan')) out.push(`<span class="mk mk-diet" title="${escapeHtml(t.tags.vegan)}" aria-label="${escapeHtml(t.tags.vegan)}" role="img">VG</span>`);
  else if (hasTag(item, 'veg')) out.push(`<span class="mk mk-diet" title="${escapeHtml(t.tags.veg)}" aria-label="${escapeHtml(t.tags.veg)}" role="img">V</span>`);
  if (hasTag(item, 'gf')) out.push(`<span class="mk mk-diet" title="${escapeHtml(t.tags.gf)}" aria-label="${escapeHtml(t.tags.gf)}" role="img">GF</span>`);
  if (hasTag(item, 'new')) out.push(`<span class="mk mk-new">${escapeHtml(t.tags.new)}</span>`);
  return out.length ? `<span class="marks">${out.join('')}</span>` : '';
}

/* ---------- my list ----------
   Something to show the server, not an order: no account, no network. */

const listKey = (id, v) => `${id}|${v}`;

function loadList() {
  const saved = store.get(KEYS.list(state.brand.id), []);
  state.list = new Map((Array.isArray(saved) ? saved : [])
    .filter(([key, qty]) => itemById(key.split('|')[0]) && qty > 0));
}

const saveList = () => store.set(KEYS.list(state.brand.id), [...state.list]);

function qtyOfItem(id) {
  let n = 0;
  for (const [key, qty] of state.list) if (key.split('|')[0] === id) n += qty;
  return n;
}

function changeQty(id, v, delta) {
  const key = listKey(id, v);
  const qty = Math.max(0, (state.list.get(key) || 0) + delta);
  if (qty) state.list.set(key, qty); else state.list.delete(key);
  saveList();
  syncAddButtons(id);
  renderTray();
}

function listLines() {
  // Menu order, not tap order: it reads better to a server that way.
  const lines = [];
  for (const item of state.brand.items) {
    variants(item).forEach((variant, v) => {
      const qty = state.list.get(listKey(item.id, v));
      if (qty) lines.push({ item, v, qty, variant });
    });
  }
  return lines;
}

const listTotal = (lines) => lines.reduce((sum, l) => sum + l.qty * l.variant.price, 0);

function addButton(item) {
  const n = qtyOfItem(item.id);
  const label = n ? state.t.inList(n) : state.t.add;
  return `<button type="button" class="add${n ? ' on' : ''}" data-add="${item.id}" aria-label="${escapeHtml(`${label}: ${tr(item.name)}`)}">${n ? `<span>${n}</span>` : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>'}</button>`;
}

function syncAddButtons(id) {
  const item = itemById(id);
  for (const button of document.querySelectorAll(`[data-add="${id}"]`)) {
    button.outerHTML = addButton(item);
  }
  if (state.sheet.id === id && !dom.sheetWrap.hidden) renderSheetFoot();
}

function renderTray() {
  const lines = listLines();
  const count = lines.reduce((n, l) => n + l.qty, 0);
  dom.tray.hidden = count === 0;
  document.body.classList.toggle('has-tray', count > 0);
  if (!count) return;
  dom.trayCount.textContent = count;
  dom.trayText.textContent = state.t.myList;
  dom.trayTotal.innerHTML = amount(listTotal(lines));
}

function renderList() {
  const t = state.t;
  const lines = listLines();
  dom.listTitle.textContent = t.myList;
  dom.listLead.textContent = lines.length ? t.listLead : t.listEmpty;
  dom.listClear.textContent = t.clearAll;
  dom.listClear.hidden = lines.length === 0;
  dom.listClose.textContent = t.close;
  dom.listItems.innerHTML = lines.map(({ item, v, qty, variant }) => `
    <li class="line">
      <span class="line-art">${art(item)}</span>
      <span class="line-text">
        <span class="line-name">${esc(item.name)}</span>
        ${variant.label ? `<span class="line-variant">${esc(variant.label)}</span>` : ''}
        <span class="line-price">${money(variant.price * qty)}</span>
      </span>
      <span class="stepper">
        <button type="button" data-step="-1" data-id="${item.id}" data-v="${v}" aria-label="${escapeHtml(t.remove)}">−</button>
        <output>${qty}</output>
        <button type="button" data-step="1" data-id="${item.id}" data-v="${v}" aria-label="${escapeHtml(t.addShort)}">+</button>
      </span>
    </li>`).join('');
  dom.listFoot.innerHTML = lines.length ? `
    <p class="list-sum"><span>${escapeHtml(t.total)}</span><strong>${money(listTotal(lines))}</strong></p>
    <button type="button" class="btn btn-solid" id="show-server">${escapeHtml(t.showServer)}</button>` : '';
}

function renderServer() {
  const t = state.t;
  const lines = listLines();
  dom.serverTitle.textContent = t.serverTitle;
  dom.serverItems.innerHTML = lines.map(({ item, qty, variant }) => `
    <li><span class="server-qty"><bdi dir="ltr">${qty}×</bdi></span>
      <span class="server-name">${esc(item.name)}${variant.label ? ` <small>${esc(variant.label)}</small>` : ''}</span></li>`).join('');
  dom.serverTotal.innerHTML = `${escapeHtml(t.total)} · ${money(listTotal(lines))}`;
  dom.serverNote.textContent = t.serverNote;
}

/* ---------- menu ---------- */

const groupCategories = (groupId) => state.brand.categories.filter((c) => c.group === groupId);
const categoryItems = (cat) => state.brand.items.filter((i) => i.cat === cat.id);

function rowHtml(item, withThumb) {
  const warn = warnText(item);
  const sizes = sizeLine(item);
  return `
    <li class="row-item">
      <button type="button" class="row${warn ? ' is-flagged' : ''}" data-item="${item.id}">
        ${withThumb ? `<span class="row-thumb">${art(item)}</span>` : ''}
        <span class="row-text">
          <span class="row-top">
            <span class="row-name">${esc(item.name)}</span>
            ${marks(item)}
            <span class="leader"></span>
            <span class="row-price">${priceLine(item)}</span>
          </span>
          ${item.desc ? `<span class="row-desc">${esc(item.desc)}</span>` : ''}
          ${sizes ? `<span class="row-sizes">${sizes}</span>` : ''}
          ${warn ? `<span class="warn-strip">${escapeHtml(warn)}</span>` : ''}
        </span>
      </button>
      ${addButton(item)}
    </li>`;
}

function signatureHtml(item) {
  const warn = warnText(item);
  return `
    <div class="sig-wrap">
      <button type="button" class="sig" data-item="${item.id}">
        <span class="sig-art">${art(item)}</span>
        <span class="sig-text">
          <span class="sig-tag">${escapeHtml(state.t.signature)}</span>
          <span class="sig-name">${esc(item.name)}</span>
          ${item.desc ? `<span class="sig-desc">${esc(item.desc)}</span>` : ''}
          <span class="sig-meta"><span class="sig-price">${priceLine(item)} <small>${escapeHtml(currency()[state.lang] || currency().en)}</small></span>${marks(item)}</span>
          ${warn ? `<span class="sig-warn">${escapeHtml(warn)}</span>` : ''}
        </span>
      </button>
      ${addButton(item)}
    </div>`;
}

function cardHtml(item) {
  const warn = warnText(item);
  const badge = hasTag(item, 'pick') ? state.t.tags.pick : '';
  return `
    <li class="card${warn ? ' is-flagged' : ''}">
      <button type="button" class="card-hit" data-item="${item.id}">
        <span class="card-art">${art(item)}${badge ? `<span class="card-badge">${escapeHtml(badge)}</span>` : ''}</span>
        <span class="card-name">${esc(item.name)}</span>
        ${item.desc ? `<span class="card-desc">${esc(item.desc)}</span>` : ''}
        <span class="card-foot">
          <span class="card-price">${item.prices ? `<small>${escapeHtml(state.t.from)}</small>${amount(Math.min(...item.prices.map((p) => p.price)))}` : amount(item.price)}</span>
          ${marks(item)}
        </span>
        ${warn ? `<span class="warn-strip">${escapeHtml(warn)}</span>` : ''}
      </button>
      ${addButton(item)}
    </li>`;
}

function chapterHtml(cat, index) {
  const layout = state.brand.layout;
  const all = categoryItems(cat);
  const items = all.filter(passesDiet);
  const hidden = all.length - items.length;
  const serve = serving(cat);
  const num = numeral(index);

  let body = '';
  if (layout === 'cards') {
    body = `<ul class="cards">${items.map(cardHtml).join('')}</ul>`;
  } else {
    const pick = items.find((i) => hasTag(i, 'pick'));
    const rest = items.filter((i) => i !== pick);
    body = `${pick ? signatureHtml(pick) : ''}
      ${rest.length ? `<ul class="rows">${rest.map((i) => rowHtml(i, layout === 'editorial')).join('')}</ul>` : ''}`;
  }

  // A flat placeholder height makes a 3-dish chapter and a 9-dish one look
  // the same to the layout engine, so jumps past unrendered chapters land
  // short. Estimate from what is actually in it.
  const estimate = layout === 'cards'
    ? 140 + Math.ceil(items.length / 2) * 300
    : 160 + (items.some((i) => hasTag(i, 'pick')) ? 460 : 0) + items.length * 92;

  return `
    <section class="chapter${serve && !serve.on ? ' is-resting' : ''}" id="ch-${cat.id}" aria-labelledby="h-${cat.id}"
             style="contain-intrinsic-size: auto ${estimate}px">
      <div class="chapter-head">
        ${num ? `<span class="numeral" aria-hidden="true">${escapeHtml(num)}</span>` : ''}
        <h2 id="h-${cat.id}">${esc(cat.name)}</h2>
        ${cat.note ? `<p class="chapter-note">${esc(cat.note)}</p>` : ''}
        ${serve ? `<p class="chapter-serve${serve.on ? '' : ' off'}">${escapeHtml(serve.text)}${serve.on ? '' : ` · ${escapeHtml(state.t.notServing)}`}</p>` : ''}
      </div>
      ${body}
      ${hidden ? `<p class="chapter-hidden">${escapeHtml(state.t.hidden(hidden))}</p>` : ''}
    </section>`;
}

function renderMenu() {
  artSerial = 0;
  if (state.printing) {
    dom.main.innerHTML = state.brand.groups.map((g) => `
      <h2 class="print-group">${esc(g.name)}</h2>
      ${groupCategories(g.id).map(chapterHtml).join('')}`).join('');
    return;
  }

  const cats = groupCategories(state.group);
  dom.main.innerHTML = cats.map(chapterHtml).join('');
  dom.rail.innerHTML = cats.map((cat, i) =>
    `<button type="button" data-jump="${cat.id}" aria-current="${i === 0}">${esc(cat.name)}</button>`).join('');
  renderAlertBar();
  observeChapters();
}

function renderAlertBar() {
  const n = filterCount();
  dom.filterDot.hidden = n === 0;
  dom.filterOpen.classList.toggle('on', n > 0);
  dom.filterOpen.setAttribute('aria-label', n ? state.t.filtersActive(n) : state.t.filters);
  if (!n) { dom.alertBar.hidden = true; return; }

  const items = groupCategories(state.group).flatMap(categoryItems);
  const flagged = items.filter((i) => passesDiet(i) && hits(i).length).length;
  const hidden = items.filter((i) => !passesDiet(i)).length;
  const parts = [];
  if (state.avoid.size) parts.push(state.t.flagged(flagged));
  if (hidden) parts.push(state.t.hidden(hidden));
  dom.alertBar.hidden = parts.length === 0;
  dom.alertBar.innerHTML = `<button type="button" id="alert-open">${parts.map(escapeHtml).join(' · ')}</button>`;
}

/* ---------- scroll position ---------- */

// The bar's height changes with language and wrapping; the alert bar and
// every chapter's scroll margin key off it. Measure rather than guess.
function syncBarHeight() {
  dom.root.style.setProperty('--bar-h', `${dom.bar.offsetHeight}px`);
}

function observeChapters() {
  syncBarHeight();
  if (state.spy) state.spy.disconnect();
  state.spy = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!visible) return;
    const id = visible.target.id.replace('ch-', '');
    for (const chip of dom.rail.querySelectorAll('[data-jump]')) {
      const on = chip.dataset.jump === id;
      chip.setAttribute('aria-current', String(on));
      if (on) {
        // Scroll the rail itself, not the page: scrollIntoView would also
        // nudge the window while the reader is mid-scroll.
        const rail = dom.rail;
        const target = chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2;
        rail.scrollTo({ left: target, behavior: 'smooth' });
      }
    }
  }, { rootMargin: `-${dom.bar.offsetHeight + 8}px 0px -62% 0px`, threshold: 0 });
  for (const section of dom.main.querySelectorAll('.chapter')) state.spy.observe(section);
}

function jumpTo(categoryId, groupId) {
  if (groupId && groupId !== state.group) {
    state.group = groupId;
    renderGroups();
    renderMenu();
  }
  // `content-visibility: auto` means an unrendered chapter reports its
  // estimated height, so a single scrollIntoView lands short as the chapters
  // in between render. Re-aim over a few frames until it stops moving.
  const settle = (remaining, previous) => {
    const target = el(`ch-${categoryId}`);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: 'auto' });
    const top = Math.round(target.getBoundingClientRect().top);
    if (remaining > 0 && top !== previous) setTimeout(() => settle(remaining - 1, top), 90);
  };
  requestAnimationFrame(() => settle(10, null));
}

/* ---------- contents ---------- */

function renderContents() {
  const t = state.t;
  dom.contentsTitle.textContent = t.contents;
  dom.contentsClose.textContent = t.close;
  dom.contentsBody.innerHTML = state.brand.groups.map((group) => `
    <div class="toc-group">
      <h3>${esc(group.name)}</h3>
      <ul class="toc">
        ${groupCategories(group.id).map((cat, i) => `
          <li><button type="button" data-goto="${cat.id}" data-group="${group.id}">
            ${numeral(i) ? `<span class="toc-num">${escapeHtml(numeral(i))}</span>` : ''}
            <span class="toc-name">${esc(cat.name)}</span>
            <span class="toc-dots"></span>
            <span class="toc-count">${escapeHtml(t.itemCount(categoryItems(cat).length))}</span>
          </button></li>`).join('')}
      </ul>
    </div>`).join('');
}

/* ---------- dish sheet ---------- */

function renderSheet() {
  const item = itemById(state.sheet.id);
  if (!item) return;
  const t = state.t;
  const warn = warnText(item);
  dom.sheetAlert.hidden = !warn;
  dom.sheetAlert.textContent = warn;
  dom.sheetMedia.innerHTML = art(item);
  plate(dom.sheetMedia.querySelector('svg.art'), item.id);
  // On a wide sheet the square art leaves bars either side; fill them with
  // the art's own ground so it reads as one picture.
  dom.sheetMedia.style.background = tileFor(item, state.brand.art, catOf(item)?.tile);
  dom.sheetName.textContent = tr(item.name);
  dom.sheetPrice.innerHTML = money(priceOf(item, state.sheet.variant));
  dom.sheetDesc.textContent = tr(item.desc);
  dom.sheetDesc.hidden = !item.desc;

  const chips = [];
  const spice = spiceLevel(item);
  if (spice) chips.push(`<span class="chip chip-spicy">${CHILI.repeat(spice)} ${escapeHtml(t.spicyLevel(spice))}</span>`);
  for (const tag of ['pick', 'new', 'vegan', 'veg', 'gf']) {
    if (tag === 'veg' && hasTag(item, 'vegan')) continue;
    if (hasTag(item, tag)) chips.push(`<span class="chip">${escapeHtml(t.tags[tag])}</span>`);
  }
  dom.sheetTags.innerHTML = chips.join('');

  const facts = [];
  if (item.prices) {
    facts.push(`
      <div class="fact">
        <h3>${escapeHtml(t.size)}</h3>
        <div class="seg" role="group" aria-label="${escapeHtml(t.size)}">
          ${item.prices.map((p, v) => `<button type="button" data-variant="${v}" aria-pressed="${v === state.sheet.variant}">
            <span>${esc(p.label)}</span><small>${amount(p.price)}</small></button>`).join('')}
        </div>
      </div>`);
  }
  const allergens = item.allergens || [];
  facts.push(`
    <div class="fact">
      <h3>${escapeHtml(t.contains)}</h3>
      ${allergens.length
        ? `<ul class="tag-list">${allergens.map((a) => `<li class="${state.avoid.has(a) ? 'is-flagged' : ''}">${escapeHtml(allergenName(a))}</li>`).join('')}</ul>`
        : `<p class="muted">${escapeHtml(t.noAllergens)}</p>`}
    </div>`);
  if (item.kcal != null) {
    facts.push(`<div class="fact fact-inline"><h3>${escapeHtml(t.calories)}</h3><p><bdi dir="ltr">${item.kcal}</bdi> ${escapeHtml(t.kcal)}</p></div>`);
  }
  const serve = serving(catOf(item));
  if (serve) facts.push(`<p class="chapter-serve${serve.on ? '' : ' off'}">${escapeHtml(serve.text)}${serve.on ? '' : ` · ${escapeHtml(t.notServing)}`}</p>`);
  facts.push(`<p class="fine">${escapeHtml(t.allergyWarning)}</p>`);
  dom.sheetFacts.innerHTML = facts.join('');
  renderSheetFoot();
}

function renderSheetFoot() {
  const t = state.t;
  const item = itemById(state.sheet.id);
  const v = state.sheet.variant;
  const qty = state.list.get(listKey(item.id, v)) || 0;
  dom.sheetFoot.innerHTML = `
    <button type="button" class="btn btn-ghost" id="sheet-share">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>
      <span>${escapeHtml(t.share)}</span></button>
    ${qty ? `
      <span class="stepper stepper-lg">
        <button type="button" data-sheet-step="-1" aria-label="${escapeHtml(t.remove)}">−</button>
        <output>${qty}</output>
        <button type="button" data-sheet-step="1" aria-label="${escapeHtml(t.addShort)}">+</button>
      </span>`
      : `<button type="button" class="btn btn-solid" data-sheet-step="1">${escapeHtml(t.add)} · ${amount(priceOf(item, v))}</button>`}`;
}

function openItem(id, { replace = false } = {}) {
  if (!itemById(id)) return;
  state.sheet = { id, variant: 0 };
  renderSheet();
  if (replace) swapOverlay(dom.sheetWrap, `dish=${id}`);
  else openOverlay(dom.sheetWrap, `dish=${id}`);
  dom.sheetWrap.querySelector('.sheet-body').scrollTop = 0;
}

async function shareItem() {
  const item = itemById(state.sheet.id);
  const url = `${location.origin}${location.pathname}?b=${state.brand.id}#dish=${item.id}`;
  const title = `${tr(item.name)} · ${state.brand.name}`;
  try {
    if (navigator.share) { await navigator.share({ title, url }); return; }
    await navigator.clipboard.writeText(url);
    toast(state.t.linkCopied);
  } catch { /* dismissed */ }
}

/* ---------- search ----------
   Matches every language at once, so a guest can type an English dish name
   into the Arabic menu and still find it. Arabic and Kurdish spellings are
   folded together: alef forms, yeh / keheh variants, teh marbuta, harakat. */

function fold(text) {
  return String(text || '').toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ̀-ͯ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ةە]/g, 'ه')
    .replace(/ڕ/g, 'ر')
    .replace(/ڵ/g, 'ل');
}

let searchIndex = [];

function buildSearchIndex() {
  searchIndex = state.brand.items.map((item) => {
    const cat = catOf(item);
    const text = [item.name, item.desc, cat?.name, cat?.keywords, item.keywords]
      .flatMap((f) => (f && typeof f === 'object' ? Object.values(f) : [f]))
      .join(' ');
    return { item, text: fold(text) };
  });
}

function mark(text, query) {
  const folded = fold(text);
  const at = folded.indexOf(query);
  // Folding can change length (decomposed accents), so only highlight when
  // the positions still line up.
  if (at < 0 || folded.length !== text.length) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, at))}<mark>${escapeHtml(text.slice(at, at + query.length))}</mark>${escapeHtml(text.slice(at + query.length))}`;
}

function runSearch() {
  const query = fold(dom.searchInput.value.trim());
  if (query.length < 2) {
    dom.results.innerHTML = '';
    dom.searchEmpty.hidden = true;
    return;
  }
  const words = query.split(/\s+/);
  const found = searchIndex.filter((e) => words.every((w) => e.text.includes(w))).slice(0, 40);
  dom.searchEmpty.hidden = found.length > 0;
  dom.results.innerHTML = found.map(({ item }) => {
    const warn = warnText(item);
    const name = tr(item.name);
    return `
      <li><button type="button" class="result" data-item="${item.id}">
        <span class="result-art">${art(item)}</span>
        <span class="result-text">
          <span class="result-name">${mark(name, words[0])}</span>
          <span class="result-cat">${esc(catOf(item)?.name)}</span>
          ${warn ? `<span class="result-warn">${escapeHtml(warn)}</span>` : ''}
        </span>
        <span class="result-price">${priceLine(item)}</span>
      </button></li>`;
  }).join('');
}

/* ---------- filter panel ---------- */

function renderFilters() {
  const t = state.t;
  dom.filterTitle.textContent = t.filters;
  dom.filterDone.textContent = t.done;
  dom.filterClear.textContent = t.clear;
  dom.filterClear.hidden = filterCount() === 0;
  dom.filterBody.innerHTML = `
    <h3 class="sub">${escapeHtml(t.diet)}</h3>
    <div class="chips">${DIETS.map((d) => `
      <button type="button" data-diet="${d}" aria-pressed="${state.diet.has(d)}">${escapeHtml(t.tags[d])}</button>`).join('')}</div>
    <p class="muted small">${escapeHtml(t.dietNote)}</p>
    <h3 class="sub">${escapeHtml(t.allergies)}</h3>
    <p class="lead">${escapeHtml(t.allergyIntro)}</p>
    <div class="chips chips-allergy">${Object.keys(ALLERGENS).map((a) => `
      <button type="button" data-allergen="${a}" aria-pressed="${state.avoid.has(a)}">${escapeHtml(allergenName(a))}</button>`).join('')}</div>
    <p class="fine">${escapeHtml(t.allergyWarning)}</p>`;
}

function filtersChanged() {
  store.set(KEYS.avoid, [...state.avoid]);
  store.set(KEYS.diet, [...state.diet]);
  renderFilters();
  renderMenu();
}

/* ---------- info ---------- */

const ICONS = {
  call: '<path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
  maps: '<path d="M12 21s6.5-6.2 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 14.8 12 21 12 21z"/><circle cx="12" cy="10.4" r="2.4"/>',
  whatsapp: '<path d="M12 3.2a8.8 8.8 0 0 0-7.5 13.4L3.2 20.8l4.4-1.2A8.8 8.8 0 1 0 12 3.2z"/><path d="M9.1 8.2c.3 0 .5.5.8 1.2.2.5-.4.8-.5 1.1a6.6 6.6 0 0 0 3.6 3.2c.3 0 .6-.7 1-.6.7.2 1.4.6 1.4.9 0 .8-.7 1.5-1.6 1.5-2.6 0-6-3.4-6-6 0-.9.6-1.6 1.3-1.3z"/>',
  instagram: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.6"/><circle cx="12" cy="12" r="3.7"/><circle cx="17.1" cy="6.9" r="0.6"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

function renderInfo() {
  const t = state.t;
  const b = state.brand;
  const c = b.contact || {};
  const status = statusText();
  const today = (() => { try { return now().day; } catch { return -1; } })();
  // Monday first, the way the week is read here.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const links = [
    ['call', c.phone ? `tel:${c.phone}` : null, c.phoneDisplay ? `${t.call} · ${c.phoneDisplay}` : t.call],
    ['maps', c.maps, t.maps],
    ['whatsapp', c.whatsapp, t.whatsapp],
    ['instagram', c.instagram, t.instagram],
  ].filter(([, href]) => href);

  dom.infoTitle.textContent = t.info;
  dom.infoClose.textContent = t.close;
  dom.infoBody.innerHTML = `
    <div class="info-links">
      ${links.map(([key, href, label]) => `<a href="${escapeHtml(href)}"${href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${icon(key)}<span>${escapeHtml(label)}</span></a>`).join('')}
    </div>
    <div class="info-block">
      <h3>${escapeHtml(t.hours)}</h3>
      ${status ? `<p class="status-line ${status.open ? 'open' : 'shut'}"><span class="dot"></span>${escapeHtml(status.label)} · ${escapeHtml(status.detail)}</p>` : ''}
      <table class="hours">
        ${order.map((d) => {
          const h = b.hours[DAY_KEYS[d]];
          return `<tr${d === today ? ' class="today"' : ''}><th scope="row">${escapeHtml(t.days[d])}${d === today ? ` <small>${escapeHtml(t.today)}</small>` : ''}</th>
            <td>${h ? `<bdi>${escapeHtml(t.clock(h[0]))} – ${escapeHtml(t.clock(h[1]))}</bdi>` : escapeHtml(t.closed)}</td></tr>`;
        }).join('')}
      </table>
    </div>
    <div class="info-block">
      <h3>${escapeHtml(t.address)}</h3>
      <p>${esc(b.place.address)}</p>
    </div>
    ${b.wifi ? `
    <div class="info-block">
      <h3>${escapeHtml(t.wifi)}</h3>
      <p>${escapeHtml(t.network)}: <code>${escapeHtml(b.wifi.ssid)}</code></p>
      <p>${escapeHtml(t.password)}: <code>${escapeHtml(b.wifi.password)}</code>
        <button type="button" class="link" id="copy-wifi">${escapeHtml(t.copy)}</button></p>
    </div>` : ''}`;
}

/* ---------- chrome ---------- */

function renderStatus() {
  const status = statusText();
  dom.heroStatus.hidden = !status;
  if (!status) return;
  dom.heroStatus.className = `hero-status ${status.open ? 'open' : 'shut'}`;
  dom.heroStatus.innerHTML = `<span class="dot"></span>${escapeHtml(status.label)}<span class="hero-next">${escapeHtml(status.detail)}</span>`;
}

function renderGroups() {
  dom.groups.innerHTML = state.brand.groups.map((g) =>
    `<button type="button" data-group="${g.id}" aria-pressed="${g.id === state.group}">${esc(g.name)}</button>`).join('');
}

function renderChrome() {
  const t = state.t;
  const b = state.brand;
  const cur = currency()[state.lang] || currency().en;

  document.title = `${b.name} · ${tr(b.kind)} · ${tr(b.place.city)}`;
  dom.demoText.textContent = t.demo;
  dom.demoBrands.setAttribute('aria-label', t.demoSwitch);
  dom.demoBrands.innerHTML = Object.entries(BRANDS).map(([id, info]) =>
    `<a href="?b=${id}"${id === b.id ? ' aria-current="page"' : ''}>${escapeHtml(info.name)}</a>`).join('');

  dom.heroMark.textContent = b.mark || '';
  dom.heroKicker.textContent = tr(b.place.city);
  dom.heroName.textContent = b.name;
  dom.heroKind.textContent = tr(b.kind);
  dom.heroSub.textContent = tr(b.tagline);
  dom.heroCueText.textContent = t.viewMenu;
  renderStatus();

  dom.barMark.textContent = b.name;
  dom.searchOpen.setAttribute('aria-label', t.search);
  dom.infoOpen.setAttribute('aria-label', t.info);
  dom.contentsLabel.textContent = t.allSections;
  dom.contentsOpen.setAttribute('aria-label', t.contents);
  dom.searchInput.placeholder = t.searchPlaceholder;
  dom.searchInput.setAttribute('aria-label', t.search);
  dom.searchPanel.setAttribute('aria-label', t.search);
  dom.searchCancel.textContent = t.cancel;
  dom.searchEmpty.textContent = t.noResults;
  dom.toTop.setAttribute('aria-label', t.backToTop);
  dom.tray.setAttribute('aria-label', t.myList);
  for (const close of document.querySelectorAll('.sheet-close')) close.setAttribute('aria-label', t.close);

  dom.langs.setAttribute('aria-label', 'Language');
  dom.langs.innerHTML = b.languages.map((code) =>
    `<button type="button" data-lang="${code}" lang="${code}" aria-pressed="${code === state.lang}" title="${escapeHtml(LANGUAGES[code].name)}">${LANGUAGES[code].label}</button>`).join('');
  dom.groups.setAttribute('aria-label', t.contents);
  dom.rail.setAttribute('aria-label', t.contents);
  renderGroups();

  dom.footName.textContent = b.name;
  dom.footAddress.textContent = tr(b.place.address);
  dom.footPrices.textContent = t.pricesIn(cur);
  dom.footNote.textContent = t.footer;
  dom.printMenu.textContent = t.print;
  dom.footCredit.innerHTML = `${escapeHtml(t.madeBy)} · <a href="../">${escapeHtml(t.demo.split(' · ')[0])}</a>`;
}

function applyThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(dom.root).getPropertyValue('--bg').trim();
  if (meta && bg) meta.content = bg;
}

/* ---------- overlays & history ----------
   Every overlay is a history entry, so the phone's back gesture closes the
   sheet instead of leaving the menu. A dish keeps its own URL (#dish=id),
   which is what makes "share this dish" possible. */

const stack = [];

const focusables = (wrap) => [...wrap.querySelectorAll('a[href], button, input, summary')]
  .filter((n) => !n.disabled && n.offsetParent !== null);

function show(wrap) {
  if (!stack.length) state.lastFocus = document.activeElement;
  wrap.hidden = false;
  document.body.classList.add('locked');
  // Focus the search box if there is one, otherwise the dialog itself:
  // landing on its first button would put "Clear all" one keypress away.
  const dialog = wrap.querySelector('[role="dialog"]');
  if (dialog) dialog.tabIndex = -1;
  const target = wrap.querySelector('input') || dialog;
  if (target) target.focus({ preventScroll: true });
}

function hide(wrap) {
  wrap.hidden = true;
  if (!stack.length) {
    document.body.classList.remove('locked');
    state.lastFocus?.focus?.({ preventScroll: true });
  }
}

const baseUrl = () => `${location.pathname}${location.search}`;

function openOverlay(wrap, hash = '') {
  if (stack.includes(wrap)) return;
  stack.push(wrap);
  show(wrap);
  history.pushState({ overlay: stack.length }, '', hash ? `#${hash}` : baseUrl());
}

// Replace the top overlay (search -> dish) without growing the history.
function swapOverlay(wrap, hash = '') {
  const top = stack.pop();
  if (top) top.hidden = true;
  stack.push(wrap);
  show(wrap);
  history.replaceState({ overlay: stack.length }, '', hash ? `#${hash}` : baseUrl());
}

const closeTop = () => { if (stack.length) history.back(); };

window.addEventListener('popstate', () => {
  const top = stack.pop();
  if (top) hide(top);
});

let toastTimer;
function toast(text) {
  dom.toast.textContent = text;
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 1800);
}

/* ---------- language ---------- */

function setLanguage(code) {
  const lang = state.brand.languages.includes(code) ? code : state.brand.languages[0];
  state.lang = lang;
  state.t = UI[lang];
  store.set(KEYS.lang, lang);
  dom.root.lang = lang;
  dom.root.dir = RTL.has(lang) ? 'rtl' : 'ltr';
  renderChrome();
  renderMenu();
  renderTray();
  if (!dom.sheetWrap.hidden) renderSheet();
  if (!dom.filterWrap.hidden) renderFilters();
  if (!dom.infoWrap.hidden) renderInfo();
}

function pickLanguage() {
  const stored = store.get(KEYS.lang, null);
  if (stored && state.brand.languages.includes(stored)) return stored;
  for (const tag of navigator.languages || []) {
    const code = tag.toLowerCase().split('-')[0];
    if (code === 'ckb' || code === 'ku') return 'ku';
    if (code === 'ar') return 'ar';
  }
  return 'en';
}

/* ---------- events ---------- */

function bind() {
  dom.langs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (b) setLanguage(b.dataset.lang);
  });

  dom.groups.addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]');
    if (!b || b.dataset.group === state.group) return;
    state.group = b.dataset.group;
    renderGroups();
    renderMenu();
    dom.main.scrollIntoView({ block: 'start' });
  });

  dom.rail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-jump]');
    if (b) jumpTo(b.dataset.jump);
  });

  // One listener for every dish tile, row, card and + button in the page.
  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const id = add.dataset.add;
      const item = itemById(id);
      // Sized dishes need a choice, and a dish already on the list is
      // adjusted in its sheet; only a plain first tap adds straight away.
      if (item.prices || qtyOfItem(id)) openItem(id);
      else {
        // Grab the picture before the button is re-rendered.
        const svg = add.closest('.row-item, .card, .sig-wrap')?.querySelector('svg.art');
        changeQty(id, 0, 1);
        bump(`[data-add="${id}"]`);
        fly(svg);
        toast(`${tr(item.name)} · ${state.t.inList(1)}`);
      }
      return;
    }
    const open = e.target.closest('[data-item]');
    if (open) {
      if (!dom.searchWrap.hidden) openItem(open.dataset.item, { replace: true });
      else openItem(open.dataset.item);
      return;
    }
    if (e.target.closest('[data-close]')) { closeTop(); return; }
    if (e.target.closest('#alert-open')) { renderFilters(); openOverlay(dom.filterWrap); }
  });

  dom.sheetFacts.addEventListener('click', (e) => {
    const b = e.target.closest('[data-variant]');
    if (!b) return;
    state.sheet.variant = Number(b.dataset.variant);
    renderSheet();
  });

  dom.sheetFoot.addEventListener('click', (e) => {
    if (e.target.closest('#sheet-share')) { shareItem(); return; }
    const step = e.target.closest('[data-sheet-step]');
    if (step) {
      changeQty(state.sheet.id, state.sheet.variant, Number(step.dataset.sheetStep));
      bump('#sheet-foot .stepper output');
    }
  });

  dom.tray.addEventListener('click', () => { renderList(); openOverlay(dom.listWrap); });

  dom.listItems.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    changeQty(b.dataset.id, Number(b.dataset.v), Number(b.dataset.step));
    renderList();
    if (!listLines().length) closeTop();
  });

  dom.listClear.addEventListener('click', () => {
    const ids = new Set([...state.list.keys()].map((k) => k.split('|')[0]));
    state.list.clear();
    saveList();
    ids.forEach(syncAddButtons);
    renderTray();
    closeTop();
  });

  dom.listFoot.addEventListener('click', (e) => {
    if (!e.target.closest('#show-server')) return;
    renderServer();
    openOverlay(dom.serverWrap);
  });

  dom.searchOpen.addEventListener('click', () => {
    dom.searchInput.value = '';
    dom.results.innerHTML = '';
    dom.searchEmpty.hidden = true;
    openOverlay(dom.searchWrap);
  });
  let searchTimer;
  dom.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 80);
  });

  dom.filterOpen.addEventListener('click', () => { renderFilters(); openOverlay(dom.filterWrap); });
  dom.filterBody.addEventListener('click', (e) => {
    const a = e.target.closest('[data-allergen]');
    const d = e.target.closest('[data-diet]');
    if (a) {
      const key = a.dataset.allergen;
      if (state.avoid.has(key)) state.avoid.delete(key); else state.avoid.add(key);
    } else if (d) {
      const key = d.dataset.diet;
      if (state.diet.has(key)) state.diet.delete(key); else state.diet.add(key);
    } else return;
    filtersChanged();
  });
  dom.filterClear.addEventListener('click', () => {
    state.avoid.clear();
    state.diet.clear();
    filtersChanged();
  });

  dom.infoOpen.addEventListener('click', () => { renderInfo(); openOverlay(dom.infoWrap); });
  dom.infoBody.addEventListener('click', async (e) => {
    const b = e.target.closest('#copy-wifi');
    if (!b) return;
    try {
      await navigator.clipboard.writeText(state.brand.wifi.password);
      b.textContent = state.t.copied;
    } catch { /* clipboard blocked: the password is on screen anyway */ }
  });

  dom.contentsOpen.addEventListener('click', () => { renderContents(); openOverlay(dom.contentsWrap); });
  dom.contentsBody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (!b) return;
    closeTop();
    jumpTo(b.dataset.goto, b.dataset.group);
  });

  dom.heroCue.addEventListener('click', () => dom.main.scrollIntoView({ block: 'start' }));
  dom.barMark.addEventListener('click', () => window.scrollTo({ top: 0 }));
  dom.toTop.addEventListener('click', () => window.scrollTo({ top: 0 }));
  const toggleToTop = () => { dom.toTop.hidden = window.scrollY < 600; };
  window.addEventListener('scroll', toggleToTop, { passive: true });
  toggleToTop();

  dom.printMenu.addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', () => { state.printing = true; renderMenu(); });
  window.addEventListener('afterprint', () => { state.printing = false; renderMenu(); });

  document.addEventListener('keydown', (e) => {
    const open = stack[stack.length - 1];
    if (!open) return;
    if (e.key === 'Escape') { closeTop(); return; }
    if (e.key !== 'Tab') return;
    // Keep Tab inside the dialog rather than walking the menu behind it.
    const stops = focusables(open);
    if (!stops.length) return;
    const edge = e.shiftKey ? stops[0] : stops[stops.length - 1];
    if (document.activeElement === edge || !open.contains(document.activeElement)) {
      e.preventDefault();
      (e.shiftKey ? stops[stops.length - 1] : stops[0]).focus();
    }
  });

  // Mobile browsers fire resize as the address bar slides; only re-measure
  // once things settle.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(observeChapters, 150);
  }, { passive: true });

  // The clock moves: open/closed and breakfast/lunch windows follow it.
  // The menu itself only re-renders when a window actually opens or shuts.
  const windows = () => state.brand.categories.map((c) => serving(c)?.on).join();
  let lastWindows = windows();
  setInterval(() => {
    renderStatus();
    const current = windows();
    if (current !== lastWindows) { lastWindows = current; renderMenu(); }
  }, 60000);
}

/* ---------- boot ---------- */

async function boot() {
  const response = await fetch(`brands/${BRAND_ID}.json`);
  if (!response.ok) throw new Error(`brand ${BRAND_ID} failed to load`);
  state.brand = await response.json();
  store.set(KEYS.brand, BRAND_ID);

  state.group = state.brand.groups[0].id;
  state.avoid = new Set(store.get(KEYS.avoid, []));
  state.diet = new Set(store.get(KEYS.diet, []));
  loadList();
  buildSearchIndex();
  dom.root.dataset.layout = state.brand.layout;

  setLanguage(pickLanguage());
  applyThemeColor();
  bind();

  // A shared dish link opens straight onto that dish, with the menu behind
  // it, so back lands on the menu rather than off the site.
  const match = location.hash.match(/^#dish=([\w-]+)/);
  if (match && itemById(match[1])) {
    const dish = itemById(match[1]);
    history.replaceState(null, '', baseUrl());
    if (catOf(dish).group !== state.group) {
      state.group = catOf(dish).group;
      renderGroups();
      renderMenu();
    }
    openItem(dish.id);
  }
}

boot().catch((err) => {
  dom.main.innerHTML = `<p class="blank">${escapeHtml(UI.en.loadError)}</p>`;
  console.error(err);
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
