// WCAG contrast for every brand in menu/css/themes.css.
//
//   node tools/check_contrast.mjs
//
// Reads each [data-brand] block, then checks the text pairs the stylesheet
// actually uses. Body text must clear 4.5:1 (AA); icon-only marks 3:1.
// Exits non-zero on any failure, so it can run in CI.

import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../menu/css/themes.css', import.meta.url), 'utf8');

const brands = {};
for (const [, id, body] of css.matchAll(/\[data-brand="([\w-]+)"\]\s*\{([^}]*)\}/g)) {
  brands[id] = Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
}

function rgb(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  const fn = value.match(/rgba?\(([^)]+)\)/);
  if (fn) return fn[1].split(',').slice(0, 3).map(Number);
  throw new Error(`cannot read colour ${value}`);
}

const lum = (c) => {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum, where it is used]
const PAIRS = [
  ['ink', 'bg', 4.5, 'body text'],
  ['ink', 'surface', 4.5, 'sheet and panel text'],
  ['muted', 'bg', 4.5, 'descriptions'],
  ['muted', 'surface', 4.5, 'descriptions in sheets and cards'],
  ['accent-ink', 'bg', 4.5, 'prices'],
  ['accent-ink', 'surface', 4.5, 'prices in sheets, section labels'],
  ['on-accent', 'accent', 4.5, 'buttons, tray, active language'],
  ['danger', 'danger-bg', 4.5, 'allergy alerts'],
  ['danger', 'bg', 4.5, 'allergy strips on rows'],
  ['danger', 'surface', 4.5, 'allergy strips on cards'],
  ['open', 'bg', 4.5, 'open now'],
  ['open', 'surface', 4.5, 'open now in info'],
  ['spicy', 'bg', 3, 'chili marks (icon)'],
  ['spicy', 'surface', 3, 'chili marks on cards (icon)'],
  ['bg', 'ink', 4.5, 'inverted chips'],
];

let failed = 0;
for (const [id, tokens] of Object.entries(brands)) {
  console.log(`\n${id}`);
  for (const [fg, bg, min, where] of PAIRS) {
    const r = ratio(tokens[fg], tokens[bg]);
    const ok = r >= min;
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1  ${`${fg} on ${bg}`.padEnd(26)} ${where}`);
  }
}
console.log(failed ? `\n${failed} pair(s) below AA` : '\nall pairs pass');
process.exit(failed ? 1 : 0);
