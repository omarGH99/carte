// Dish illustrations, illustrated in code.
//
// Every dish is drawn top-down from a one-line spec in the brand file:
//
//   "art": "bowl broth:#d9a86c noodles egg chashu:2 nori scallion chopsticks"
//
// The first word is the vessel, the rest are layers drawn in order. A layer
// is `name[:arg[:arg]]`. The brand's `art` block supplies the house style --
// vessel colours, tile colours, and whether shapes are flat or inked with an
// outline -- so the same spec reads as a woodblock print in one brand and a
// pen sketch in another.
//
// Output is a plain SVG string: no assets, no requests, a few KB per dish.
// Placement is seeded from the dish id, so a dish looks the same on every
// render and every device.

const TAU = Math.PI * 2;
const f = (n) => Math.round(n * 10) / 10;

/* ---------- food colours ---------- */

const C = {
  broth: '#e2b47a', miso: '#c98f4e', shoyu: '#a8652e', curry: '#c9822b', tonkotsu: '#efd9b0',
  noodle: '#f3d98b', noodleDk: '#dcbc63', soba: '#8a6a4a', udon: '#f7ecd0',
  rice: '#f8f4ea', riceDk: '#e4dccb',
  egg: '#fbf6ea', yolk: '#f2a33a', yolkJammy: '#f08c22',
  pork: '#ecc0a6', porkEdge: '#b8714f', beef: '#9a5238', beefDk: '#6b3424', chicken: '#e8c08a',
  nori: '#1e2722', scallion: '#7fb24a', scallionLt: '#c3e08f',
  sesame: '#f3e7c8', sesameBlk: '#2b2622', chili: '#d63a2a', ginger: '#f4b7a8',
  salmon: '#f28c5c', salmonFat: '#fcd6bd', tuna: '#c53a4c', tunaLt: '#df6f7e',
  shrimp: '#f39a6b', shrimpLt: '#fde0cf', tamago: '#f5cf4f', eel: '#7a4228', roe: '#f26b2a',
  cucumber: '#6fae4f', cucumberLt: '#d7ecb8', avocado: '#a9c76a', avocadoDk: '#4f6e2c', wasabi: '#9cc25a',
  fry: '#dc9c45', fryLt: '#f2c876', fryDk: '#b8742c',
  lemon: '#f5d64a', lemonLt: '#fff4b8', lime: '#94c447', orange: '#f39a2e', orangeLt: '#ffd8a0',
  tomato: '#d8432f', tomatoLt: '#f07a5e', basil: '#3e8a3a', mozz: '#fbf8f0', parm: '#f1dfa6',
  sauce: '#c23a26', cream: '#f1e3c2', pesto: '#6f9a3a', olive: '#4a4a2a', mushroom: '#b08a68',
  crust: '#e3ab5e', crustDk: '#c48640', char: '#5a3a24',
  steak: '#8a4a32', steakIn: '#d77a6e', fish: '#f4ead8', fishSkin: '#b9a07a',
  coffee: '#5b3420', crema: '#c8925a', milk: '#f6ecdc', matcha: '#8fb35a', chai: '#c99668',
  tea: '#c9772e', greenTea: '#b7b94e', cocoa: '#6a3a26', chocolate: '#4a2a1e',
  strawberry: '#e3474e', raspberry: '#c8325a', blueberry: '#4b4f96', mango: '#f7b733', peach: '#f6a57a',
  banana: '#f6e08a', apple: '#9cc84a', yogurt: '#fbf7ee', honey: '#e7a52c', granola: '#c48a4c',
  leaf: '#5fa04a', leafDk: '#3f7a34', mint: '#4fae6a', shiso: '#4f8f3a',
  ice: 'rgba(255,255,255,0.58)', iceEdge: 'rgba(255,255,255,0.9)',
  dough: '#f0c98a', doughDk: '#d49a50', pistachio: '#9dbb5a', caramel: '#c47a2c',
  pink: '#f4a7b9', white: '#fbfaf6', red: '#d63a2a', sugar: '#ffffff',
};

const color = (v, fallback) => (v ? (C[v] || v) : fallback);

/* ---------- seeded randomness ---------- */

function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- drawing context ---------- */

function context(style, rand, uid) {
  const ink = style.mode === 'ink';
  const out = [];
  return {
    uid,
    style,
    ink,
    out,
    rand,
    between: (a, b) => a + (b - a) * rand(),
    pick: (list) => list[Math.floor(rand() * list.length)],
    add: (s) => out.push(s),
    // The inked style outlines the main shapes; the flat one never does.
    // pathLength="1" lets the animation draw every outline with the same
    // dash, whatever its real length.
    line: (w = 1) => (ink
      ? ` stroke="${style.line}" stroke-width="${f((style.lineW || 1.8) * w)}" stroke-linejoin="round" stroke-linecap="round" pathLength="1"`
      : ''),
  };
}

const circle = (c, x, y, r, fill, extra = '') => c.add(
  `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>`);
const ellipse = (c, x, y, rx, ry, rot, fill, extra = '') => c.add(
  `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" transform="rotate(${f(rot)} ${f(x)} ${f(y)})"${extra}/>`);
const rect = (c, x, y, w, h, rx, rot, fill, extra = '') => c.add(
  `<rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${fill}" transform="rotate(${f(rot)} ${f(x)} ${f(y)})"${extra}/>`);
const path = (c, d, fill, extra = '') => c.add(`<path d="${d}" fill="${fill}"${extra}/>`);
const stroke = (col, w, extra = '') => ` stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}`;

// A soft-edged irregular lump: fried chicken, scoops, clouds of foam.
function blob(c, x, y, r, fill, extra = '', jag = 0.18, n = 9) {
  const pts = [];
  const spin = c.rand() * TAU;
  for (let i = 0; i < n; i += 1) {
    const a = spin + (i / n) * TAU;
    const rr = r * (1 - jag + jag * 2 * c.rand());
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let d = `M${f(mid(pts[0], pts[1])[0])} ${f(mid(pts[0], pts[1])[1])}`;
  for (let i = 1; i <= n; i += 1) {
    const p = pts[i % n];
    const m = mid(p, pts[(i + 1) % n]);
    d += ` Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`;
  }
  path(c, `${d}Z`, fill, extra);
}

function leaf(c, x, y, len, wid, rot, fill, vein = true) {
  const h = len / 2;
  c.add(`<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">`
    + `<path d="M${f(-h)} 0Q0 ${f(-wid)} ${f(h)} 0Q0 ${f(wid)} ${f(-h)} 0Z" fill="${fill}"${c.line(0.6)}/>`
    + (vein ? `<path d="M${f(-h * 0.8)} 0L${f(h * 0.75)} 0" stroke="rgba(255,255,255,0.35)" stroke-width="${f(Math.max(0.6, wid * 0.12))}" fill="none"/>` : '')
    + '</g>');
}

/* ---------- regions ----------
   A vessel returns the area its contents may occupy. Layers ask the region
   for points rather than knowing what they were put in. */

function circleRegion(cx, cy, r) {
  return {
    kind: 'circle', cx, cy, r,
    pt(rand, inset = 0) {
      const a = rand() * TAU;
      const d = Math.sqrt(rand()) * (r - inset);
      return [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
    },
    clip: `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`,
  };
}

function rectRegion(cx, cy, w, h, rx = 6) {
  return {
    kind: 'rect', cx, cy, w, h, r: Math.min(w, h) / 2,
    pt(rand, inset = 0) {
      return [cx - w / 2 + inset + rand() * (w - inset * 2), cy - h / 2 + inset + rand() * (h - inset * 2)];
    },
    clip: `<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}"/>`,
  };
}

/* ---------- vessels ---------- */

const shadowOf = (c) => c.style.shadow || 'rgba(0,0,0,0.22)';

const VESSELS = {
  bowl(c) {
    const s = c.style;
    circle(c, 106, 108, 78, shadowOf(c));
    circle(c, 100, 100, 78, s.bowl || '#2b2f38', c.line(1.2));
    circle(c, 100, 100, 68, s.bowlRim || '#e2553b');
    circle(c, 100, 100, 64, s.bowlIn || '#f4efe6', c.line(0.8));
    return circleRegion(100, 100, 64);
  },
  plate(c) {
    const s = c.style;
    circle(c, 106, 108, 84, shadowOf(c));
    circle(c, 100, 100, 84, s.plate || '#f1ece2', c.line(1.2));
    circle(c, 100, 100, 66, s.plateWell || '#e8e1d4', c.ink ? c.line(0.6) : '');
    return circleRegion(100, 100, 66);
  },
  dish(c) {
    const s = c.style;
    circle(c, 105, 107, 66, shadowOf(c));
    circle(c, 100, 100, 66, s.plate || '#f1ece2', c.line(1.2));
    circle(c, 100, 100, 52, s.plateWell || '#e8e1d4', c.ink ? c.line(0.6) : '');
    return circleRegion(100, 100, 52);
  },
  slate(c) {
    const s = c.style;
    rect(c, 106, 108, 176, 104, 8, -8, shadowOf(c));
    rect(c, 100, 100, 176, 104, 8, -8, s.slate || '#2a2d33', c.line(1.2));
    const r = rectRegion(100, 100, 156, 84);
    r.rot = -8;
    return r;
  },
  board(c) {
    const s = c.style;
    const wood = s.wood || '#c08a56';
    rect(c, 106, 108, 172, 128, 16, 0, shadowOf(c));
    rect(c, 100, 100, 172, 128, 16, 0, wood, c.line(1.2));
    for (let i = 0; i < 7; i += 1) {
      const y = 46 + i * 17 + c.between(-3, 3);
      path(c, `M22 ${f(y)}Q100 ${f(y + c.between(-6, 6))} 178 ${f(y)}`, 'none', stroke('rgba(0,0,0,0.10)', 1.2));
    }
    return rectRegion(100, 100, 150, 106, 10);
  },
  bento(c) {
    const s = c.style;
    rect(c, 106, 108, 178, 140, 10, 0, shadowOf(c));
    rect(c, 100, 100, 178, 140, 10, 0, s.bento || '#1b1b1d', c.line(1.2));
    rect(c, 100, 100, 164, 126, 6, 0, s.bentoIn || '#b8322a');
    return rectRegion(100, 100, 164, 126, 6);
  },
  cup(c) {
    const s = c.style;
    circle(c, 105, 107, 76, shadowOf(c));
    circle(c, 100, 100, 76, s.saucer || s.plate || '#f1ece2', c.line(1.2));
    circle(c, 100, 100, 60, s.plateWell || '#e8e1d4', c.ink ? c.line(0.5) : '');
    rect(c, 150, 100, 30, 16, 8, 0, s.cup || '#ffffff', c.line(1));
    circle(c, 103, 104, 50, 'rgba(0,0,0,0.12)');
    circle(c, 100, 100, 50, s.cup || '#ffffff', c.line(1.2));
    return circleRegion(100, 100, 42);
  },
  mug(c) {
    const s = c.style;
    rect(c, 152, 104, 34, 20, 10, 0, shadowOf(c));
    circle(c, 106, 108, 60, shadowOf(c));
    rect(c, 148, 100, 34, 20, 10, 0, s.mug || s.cup || '#ffffff', c.line(1));
    circle(c, 100, 100, 60, s.mug || s.cup || '#ffffff', c.line(1.2));
    return circleRegion(100, 100, 51);
  },
  glass(c) {
    const s = c.style;
    circle(c, 108, 110, 62, 'rgba(0,0,0,0.14)');
    circle(c, 100, 100, 62, s.glass || 'rgba(255,255,255,0.28)', c.ink ? c.line(1.2) : stroke('rgba(255,255,255,0.75)', 2.5));
    return circleRegion(100, 100, 56);
  },
  paper(c) {
    const s = c.style;
    rect(c, 106, 108, 150, 150, 6, 12, shadowOf(c));
    rect(c, 100, 100, 150, 150, 6, 12, s.paper || '#f4ead3', c.line(1));
    path(c, 'M40 70L160 62M44 128L156 138', 'none', stroke('rgba(0,0,0,0.06)', 1.5));
    return circleRegion(100, 100, 62);
  },
  none() {
    return circleRegion(100, 100, 74);
  },
};

/* ---------- layers ----------
   kind "fill"   -- covers the whole region (broth, sauce, drink)
   kind "texture"-- fills the region with many small marks (noodles, rice)
   kind "topping"-- takes the next slot on a ring, like ramen toppings
   kind "scatter"-- sprinkled across everything
   kind "piece"  -- arranges itself across the region (sushi, skewers)
   kind "side"   -- sits outside the vessel (chopsticks, a lemon wedge)  */

const L = {};
const layer = (kind, draw) => ({ kind, draw });

/* fills */

L.broth = layer('fill', (c, reg, [col]) => {
  circle(c, reg.cx, reg.cy, reg.r + 2, color(col, C.broth));
  // Fat droplets catching the light.
  for (let i = 0; i < 9; i += 1) {
    const [x, y] = reg.pt(c.rand, 6);
    circle(c, x, y, c.between(1.2, 3.2), 'rgba(255,240,200,0.35)');
  }
});
L.soup = L.broth;
L.fill = layer('fill', (c, reg, [col]) => {
  if (reg.kind === 'rect') rect(c, reg.cx, reg.cy, reg.w + 4, reg.h + 4, 4, 0, color(col, C.sauce));
  else circle(c, reg.cx, reg.cy, reg.r + 2, color(col, C.sauce));
});
L.sauce = layer('fill', (c, reg, [col, size]) => {
  blob(c, reg.cx, reg.cy, reg.r * (Number(size) || 0.78), color(col, C.sauce), '', 0.12, 11);
});
L.drink = layer('fill', (c, reg, [col]) => {
  circle(c, reg.cx, reg.cy, reg.r, color(col, C.orange));
  circle(c, reg.cx - reg.r * 0.28, reg.cy - reg.r * 0.3, reg.r * 0.42, 'rgba(255,255,255,0.12)');
});
L.coffee = layer('fill', (c, reg, [col]) => {
  circle(c, reg.cx, reg.cy, reg.r, color(col, C.coffee));
  circle(c, reg.cx, reg.cy, reg.r * 0.86, C.crema);
});
L.tea = layer('fill', (c, reg, [col]) => {
  circle(c, reg.cx, reg.cy, reg.r, color(col, C.tea));
  circle(c, reg.cx - reg.r * 0.3, reg.cy - reg.r * 0.3, reg.r * 0.3, 'rgba(255,255,255,0.14)');
});
L.yogurt = layer('fill', (c, reg) => {
  circle(c, reg.cx, reg.cy, reg.r + 2, C.yogurt);
  for (let i = 0; i < 5; i += 1) {
    const a = c.rand() * TAU;
    path(c, `M${f(reg.cx + Math.cos(a) * 8)} ${f(reg.cy + Math.sin(a) * 8)}q${f(c.between(-14, 14))} ${f(c.between(-14, 14))} ${f(c.between(-24, 24))} ${f(c.between(-24, 24))}`,
      'none', stroke('rgba(0,0,0,0.06)', 2));
  }
});

/* textures */

L.noodles = layer('texture', (c, reg, [col]) => {
  const base = color(col, C.noodle);
  const dark = col === 'soba' ? '#6e5238' : col === 'udon' ? '#e6d6ac' : C.noodleDk;
  for (let i = 0; i < 26; i += 1) {
    const [x, y] = reg.pt(c.rand, 4);
    const a = c.rand() * TAU;
    const len = c.between(26, 52);
    const bend = c.between(-22, 22);
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    const mx = (x + x2) / 2 + Math.cos(a + Math.PI / 2) * bend;
    const my = (y + y2) / 2 + Math.sin(a + Math.PI / 2) * bend;
    const w = col === 'udon' ? 6 : 3.4;
    path(c, `M${f(x)} ${f(y)}Q${f(mx)} ${f(my)} ${f(x2)} ${f(y2)}`, 'none', stroke(dark, w + 1.4));
    path(c, `M${f(x)} ${f(y)}Q${f(mx)} ${f(my)} ${f(x2)} ${f(y2)}`, 'none', stroke(i % 3 ? base : dark, w));
  }
});

// A nest of spaghetti twirled into the middle of the plate.
L.spaghetti = layer('texture', (c, reg, [col, sauceCol]) => {
  const base = color(col, C.noodle);
  const cx = reg.cx + c.between(-4, 4);
  const cy = reg.cy + c.between(-4, 4);
  const R = reg.r * 0.7;
  blob(c, cx, cy, R, C.noodleDk, '', 0.08, 12);
  for (let i = 0; i < 30; i += 1) {
    const r1 = c.between(R * 0.15, R * 0.95);
    const a0 = c.rand() * TAU;
    const sweep = c.between(1.2, 2.6);
    const x1 = cx + Math.cos(a0) * r1;
    const y1 = cy + Math.sin(a0) * r1;
    const x2 = cx + Math.cos(a0 + sweep) * r1 * c.between(0.8, 1.05);
    const y2 = cy + Math.sin(a0 + sweep) * r1 * c.between(0.8, 1.05);
    path(c, `M${f(x1)} ${f(y1)}A${f(r1)} ${f(r1)} 0 0 1 ${f(x2)} ${f(y2)}`, 'none', stroke(i % 4 ? base : C.noodleDk, 3));
  }
  if (sauceCol) {
    for (let i = 0; i < 4; i += 1) {
      const [x, y] = [cx + c.between(-R * 0.5, R * 0.5), cy + c.between(-R * 0.5, R * 0.5)];
      blob(c, x, y, c.between(8, 14), color(sauceCol, C.sauce), '', 0.3, 7);
    }
  }
});

L.pasta = layer('texture', (c, reg, [shape, col]) => {
  const base = color(col, C.noodle);
  const n = 22;
  for (let i = 0; i < n; i += 1) {
    const [x, y] = reg.pt(c.rand, 10);
    const rot = c.rand() * 180;
    if (shape === 'ravioli') {
      if (i > 6) break;
      rect(c, x, y, 30, 30, 4, rot, C.dough, c.line(0.8));
      rect(c, x, y, 20, 20, 8, rot, '#f6dca6');
    } else if (shape === 'gnocchi') {
      ellipse(c, x, y, 7, 5, rot, '#f3dfb0', c.line(0.6));
      path(c, `M${f(x - 4)} ${f(y)}h8`, 'none', stroke('rgba(0,0,0,0.12)', 1));
    } else {
      // penne / rigatoni
      rect(c, x, y, 20, 8, 2, rot, base, c.line(0.6));
      ellipse(c, x + Math.cos((rot * Math.PI) / 180) * 9, y + Math.sin((rot * Math.PI) / 180) * 9, 1.8, 3.6, rot, C.noodleDk);
    }
  }
});

L.rice = layer('texture', (c, reg, [col]) => {
  const base = color(col, C.rice);
  if (reg.kind === 'rect') rect(c, reg.cx, reg.cy, reg.w, reg.h, 4, 0, base);
  else circle(c, reg.cx, reg.cy, reg.r + 2, base);
  for (let i = 0; i < 90; i += 1) {
    const [x, y] = reg.pt(c.rand, 2);
    ellipse(c, x, y, 2.6, 1.3, c.rand() * 180, C.riceDk);
  }
});

L.leaves = layer('texture', (c, reg, [col]) => {
  const greens = col ? [color(col)] : ['#6fae4f', '#88c05c', '#4f8f3a', '#a3cf6e', '#3f7a34'];
  for (let i = 0; i < 26; i += 1) {
    const [x, y] = reg.pt(c.rand, 8);
    leaf(c, x, y, c.between(22, 34), c.between(9, 14), c.rand() * 360, c.pick(greens));
  }
});

/* toppings (slotted) */

L.egg = layer('topping', (c, x, y) => {
  const rot = c.between(-40, 40);
  ellipse(c, x, y, 17, 13, rot, C.egg, c.line(0.8));
  ellipse(c, x + 1, y, 9.5, 8, rot, C.yolkJammy);
  ellipse(c, x - 1.5, y - 2, 3, 2, rot, 'rgba(255,255,255,0.35)');
});
L.friedegg = layer('topping', (c, x, y) => {
  blob(c, x, y, 22, C.egg, c.line(0.8), 0.18, 9);
  circle(c, x + 2, y - 1, 8.5, C.yolk);
  circle(c, x, y - 3, 2.5, 'rgba(255,255,255,0.4)');
});
L.chashu = layer('topping', (c, x, y, [n]) => {
  const count = Number(n) || 2;
  for (let i = 0; i < count; i += 1) {
    const ox = x + (i - (count - 1) / 2) * 9;
    const oy = y + (i - (count - 1) / 2) * 5;
    circle(c, ox, oy, 17, C.porkEdge, c.line(0.8));
    circle(c, ox, oy, 13.5, C.pork);
    path(c, `M${f(ox - 9)} ${f(oy - 3)}q9 -6 18 0`, 'none', stroke('rgba(255,255,255,0.55)', 1.6));
    path(c, `M${f(ox - 8)} ${f(oy + 5)}q8 -4 16 0`, 'none', stroke('rgba(255,255,255,0.4)', 1.4));
  }
});
L.beef = layer('topping', (c, x, y, [n]) => {
  const count = Number(n) || 3;
  for (let i = 0; i < count; i += 1) {
    const ox = x + (i - (count - 1) / 2) * 8;
    const oy = y + (i - (count - 1) / 2) * 3;
    rect(c, ox, oy, 26, 12, 5, -30 + i * 6, C.beef, c.line(0.7));
    rect(c, ox, oy, 18, 4, 2, -30 + i * 6, C.beefDk);
  }
});
L.chicken = layer('topping', (c, x, y, [n]) => {
  const count = Number(n) || 3;
  for (let i = 0; i < count; i += 1) {
    const ox = x + (i - (count - 1) / 2) * 9;
    rect(c, ox, y + i * 2, 22, 13, 5, 20 - i * 8, C.chicken, c.line(0.7));
    path(c, `M${f(ox - 6)} ${f(y + i * 2 - 2)}l12 4`, 'none', stroke('#b98a52', 1.6));
  }
});
L.nori = layer('topping', (c, x, y) => {
  const rot = c.between(-25, 25);
  rect(c, x, y, 30, 40, 2, rot, C.nori, c.line(0.6));
  rect(c, x - 4, y - 6, 8, 20, 1, rot, 'rgba(255,255,255,0.06)');
});
L.naruto = layer('topping', (c, x, y) => {
  circle(c, x, y, 11, '#fbf6f2', c.line(0.7));
  path(c, `M${f(x)} ${f(y)}m-5 0a5 5 0 1 1 5 5a3 3 0 1 1 -3 -3`, 'none', stroke('#e8638a', 2));
});
L.corn = layer('topping', (c, x, y) => {
  for (let i = 0; i < 14; i += 1) {
    circle(c, x + c.between(-9, 9), y + c.between(-7, 7), 2.8, '#f6cc3a');
  }
});
L.bamboo = layer('topping', (c, x, y) => {
  for (let i = 0; i < 4; i += 1) rect(c, x + i * 5 - 7, y, 5, 18, 1.5, 15, '#e3c98a', c.line(0.5));
});
L.mushrooms = layer('topping', (c, x, y) => {
  for (let i = 0; i < 4; i += 1) {
    const ox = x + c.between(-10, 10);
    const oy = y + c.between(-9, 9);
    ellipse(c, ox, oy, 7, 5.5, c.rand() * 180, C.mushroom, c.line(0.6));
    ellipse(c, ox, oy, 3, 2, 0, '#8a6448');
  }
});
L.tofu = layer('topping', (c, x, y) => {
  for (let i = 0; i < 4; i += 1) rect(c, x + (i % 2) * 12 - 6, y + Math.floor(i / 2) * 12 - 6, 10.5, 10.5, 2, 4, '#fbf3df', c.line(0.6));
});
L.shrimp = layer('topping', (c, x, y, [n]) => {
  const count = Number(n) || 2;
  for (let i = 0; i < count; i += 1) {
    const ox = x + (i - (count - 1) / 2) * 16;
    const oy = y + (i % 2) * 6;
    path(c, `M${f(ox - 9)} ${f(oy - 6)}a10 10 0 1 0 14 0`, 'none', stroke(C.shrimp, 8));
    path(c, `M${f(ox - 9)} ${f(oy - 6)}a10 10 0 1 0 14 0`, 'none', stroke(C.shrimpLt, 2.4, ' stroke-dasharray="3 3"'));
    path(c, `M${f(ox + 5)} ${f(oy - 6)}l5 -6l1 7z`, C.tomato);
  }
});
L.salmon = layer('topping', (c, x, y) => {
  rect(c, x, y, 34, 20, 6, c.between(-20, 20), C.salmon, c.line(0.7));
  path(c, `M${f(x - 10)} ${f(y - 6)}l8 12M${f(x - 1)} ${f(y - 7)}l8 13M${f(x + 8)} ${f(y - 6)}l6 10`, 'none', stroke(C.salmonFat, 1.6));
});
L.avocado = layer('topping', (c, x, y) => {
  for (let i = 0; i < 4; i += 1) {
    ellipse(c, x + i * 6 - 9, y + i * 2 - 3, 6, 15, 30, C.avocado, c.line(0.5));
    ellipse(c, x + i * 6 - 10, y + i * 2 - 3, 2.5, 13, 30, C.avocadoDk);
  }
});
L.lemon = layer('topping', (c, x, y, [kind]) => {
  const rind = kind === 'lime' ? C.lime : kind === 'orange' ? C.orange : C.lemon;
  const flesh = kind === 'lime' ? '#d8eea0' : kind === 'orange' ? C.orangeLt : C.lemonLt;
  circle(c, x, y, 15, rind, c.line(0.7));
  circle(c, x, y, 12.5, flesh);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    path(c, `M${f(x)} ${f(y)}L${f(x + Math.cos(a) * 11)} ${f(y + Math.sin(a) * 11)}`, 'none', stroke(rind, 1.1));
  }
});
L.wedge = layer('topping', (c, x, y, [kind]) => {
  const rind = kind === 'lime' ? C.lime : C.lemon;
  path(c, `M${f(x - 14)} ${f(y)}a14 14 0 0 0 28 0z`, rind, c.line(0.7));
  path(c, `M${f(x - 11)} ${f(y)}a11 11 0 0 0 22 0z`, kind === 'lime' ? '#d8eea0' : C.lemonLt);
});
L.tomato = layer('topping', (c, x, y, [n]) => {
  const count = Number(n) || 3;
  for (let i = 0; i < count; i += 1) {
    const ox = x + c.between(-12, 12);
    const oy = y + c.between(-10, 10);
    circle(c, ox, oy, 9, C.tomato, c.line(0.6));
    circle(c, ox, oy, 6, C.tomatoLt);
    circle(c, ox - 2, oy - 1, 1.2, '#f7d36a');
    circle(c, ox + 2, oy + 1.5, 1.2, '#f7d36a');
  }
});
L.burrata = layer('topping', (c, x, y) => {
  circle(c, x, y, 26, C.mozz, c.line(0.9));
  blob(c, x + 3, y - 2, 13, '#f3ecda', '', 0.3, 7);
  path(c, `M${f(x - 6)} ${f(y - 22)}q6 -6 12 0`, 'none', stroke('#efe6d2', 3));
});
L.karaage = layer('topping', (c, x, y, [n]) => {
  const count = Number(n) || 4;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * TAU + c.rand();
    const ox = x + Math.cos(a) * 13;
    const oy = y + Math.sin(a) * 13;
    blob(c, ox, oy, 13, C.fry, c.line(0.8), 0.24, 8);
    blob(c, ox - 2, oy - 2, 6, C.fryLt, '', 0.3, 6);
  }
});
L.patty = layer('topping', (c, x, y) => {
  blob(c, x, y, 24, C.beef, c.line(0.9), 0.08, 12);
  for (let i = -1; i <= 1; i += 1) path(c, `M${f(x - 16)} ${f(y + i * 9 - 4)}l32 8`, 'none', stroke(C.char, 3));
});
L.fillet = layer('topping', (c, x, y, [kind]) => {
  const body = kind === 'salmon' ? C.salmon : C.fish;
  const skin = kind === 'salmon' ? '#c9603a' : C.fishSkin;
  path(c, `M${f(x - 34)} ${f(y + 6)}Q${f(x - 20)} ${f(y - 24)} ${f(x + 30)} ${f(y - 12)}Q${f(x + 40)} ${f(y + 2)} ${f(x + 26)} ${f(y + 16)}Q${f(x - 10)} ${f(y + 26)} ${f(x - 34)} ${f(y + 6)}Z`, skin, c.line(0.9));
  path(c, `M${f(x - 28)} ${f(y + 4)}Q${f(x - 16)} ${f(y - 18)} ${f(x + 26)} ${f(y - 8)}Q${f(x + 32)} ${f(y + 2)} ${f(x + 22)} ${f(y + 12)}Q${f(x - 8)} ${f(y + 20)} ${f(x - 28)} ${f(y + 4)}Z`, body);
  for (let i = 0; i < 4; i += 1) path(c, `M${f(x - 16 + i * 12)} ${f(y - 10)}q4 10 0 20`, 'none', stroke('rgba(255,255,255,0.4)', 1.4));
});

L.cutlet = layer('topping', (c, x, y) => {
  blob(c, x, y, 30, C.fryDk, c.line(0.9), 0.1, 12);
  blob(c, x - 1, y - 1, 27, C.fry, '', 0.1, 12);
  for (let i = 0; i < 26; i += 1) {
    circle(c, x + c.between(-20, 20), y + c.between(-18, 18), c.between(0.8, 1.6), C.fryLt);
  }
});

/* scatters */

L.scallion = layer('scatter', (c, reg, [n]) => {
  for (let i = 0; i < (Number(n) || 18); i += 1) {
    const [x, y] = reg.pt(c.rand, 6);
    circle(c, x, y, 3.2, 'none', stroke(C.scallion, 1.8));
    circle(c, x, y, 1.4, C.scallionLt);
  }
});
L.sesame = layer('scatter', (c, reg, [col]) => {
  for (let i = 0; i < 30; i += 1) {
    const [x, y] = reg.pt(c.rand, 4);
    ellipse(c, x, y, 1.8, 1, c.rand() * 180, col === 'black' ? C.sesameBlk : C.sesame);
  }
});
L.chili = layer('scatter', (c, reg, [n]) => {
  for (let i = 0; i < (Number(n) || 10); i += 1) {
    const [x, y] = reg.pt(c.rand, 8);
    circle(c, x, y, 2.8, 'none', stroke(C.chili, 1.6));
  }
});
L.flakes = layer('scatter', (c, reg, [col]) => {
  for (let i = 0; i < 40; i += 1) {
    const [x, y] = reg.pt(c.rand, 4);
    rect(c, x, y, 1.8, 1.8, 0.4, c.rand() * 90, color(col, C.chili));
  }
});
L.herbs = layer('scatter', (c, reg, [col, n]) => {
  for (let i = 0; i < (Number(n) || 8); i += 1) {
    const [x, y] = reg.pt(c.rand, 12);
    leaf(c, x, y, c.between(9, 14), c.between(4, 6), c.rand() * 360, color(col, C.basil), false);
  }
});
L.basil = layer('scatter', (c, reg, [n]) => {
  for (let i = 0; i < (Number(n) || 5); i += 1) {
    const [x, y] = reg.pt(c.rand, 14);
    leaf(c, x, y, c.between(16, 22), c.between(8, 10), c.rand() * 360, C.basil);
  }
});
L.mint = layer('scatter', (c, reg, [n]) => {
  for (let i = 0; i < (Number(n) || 3); i += 1) {
    const [x, y] = reg.pt(c.rand, 14);
    const r = c.rand() * 360;
    leaf(c, x, y, 16, 9, r, C.mint);
    leaf(c, x + 7, y + 5, 13, 7, r + 70, '#3f9a5a');
  }
});
L.parm = layer('scatter', (c, reg, [n]) => {
  for (let i = 0; i < (Number(n) || 12); i += 1) {
    const [x, y] = reg.pt(c.rand, 10);
    path(c, `M${f(x)} ${f(y)}l${f(c.between(5, 9))} ${f(c.between(-3, 3))}l${f(c.between(-2, 2))} ${f(c.between(3, 6))}z`, C.parm);
  }
});
L.pepper = layer('scatter', (c, reg) => {
  for (let i = 0; i < 40; i += 1) {
    const [x, y] = reg.pt(c.rand, 4);
    circle(c, x, y, 0.9, '#2b2622');
  }
});
L.oil = layer('scatter', (c, reg, [col]) => {
  for (let i = 0; i < 8; i += 1) {
    const [x, y] = reg.pt(c.rand, 8);
    circle(c, x, y, c.between(1.6, 3.6), color(col, '#d9b23a'), ' opacity="0.75"');
  }
});
L.drizzle = layer('scatter', (c, reg, [col]) => {
  const R = reg.r * 0.7;
  const n = 7;
  let d = '';
  let prev = null;
  for (let i = 0; i <= n; i += 1) {
    const x = reg.cx - R + (2 * R * i) / n;
    const y = reg.cy + (i % 2 ? -1 : 1) * R * c.between(0.45, 0.7);
    d += prev ? ` Q${f((prev[0] + x) / 2 + c.between(-5, 5))} ${f((prev[1] + y) / 2)} ${f(x)} ${f(y)}` : `M${f(x)} ${f(y)}`;
    prev = [x, y];
  }
  const rot = c.between(-50, 50);
  c.add(`<g transform="rotate(${f(rot)} ${f(reg.cx)} ${f(reg.cy)})">`);
  path(c, d, 'none', stroke(color(col, C.chocolate), 2.2));
  c.add('</g>');
});
L.ice = layer('scatter', (c, reg, [n]) => {
  for (let i = 0; i < (Number(n) || 4); i += 1) {
    const [x, y] = reg.pt(c.rand, 18);
    rect(c, x, y, 22, 22, 5, c.rand() * 90, C.ice, stroke(C.iceEdge, 1.2));
    rect(c, x - 3, y - 3, 7, 4, 2, 20, 'rgba(255,255,255,0.75)');
  }
});
L.berries = layer('scatter', (c, reg, [kind, n]) => {
  const count = Number(n) || 7;
  for (let i = 0; i < count; i += 1) {
    const [x, y] = reg.pt(c.rand, 12);
    if (kind === 'strawberry') {
      path(c, `M${f(x)} ${f(y + 9)}C${f(x - 10)} ${f(y + 2)} ${f(x - 7)} ${f(y - 8)} ${f(x)} ${f(y - 6)}C${f(x + 7)} ${f(y - 8)} ${f(x + 10)} ${f(y + 2)} ${f(x)} ${f(y + 9)}Z`, C.strawberry, c.line(0.6));
      circle(c, x - 2, y, 0.8, '#fbe6a0');
      circle(c, x + 2, y + 3, 0.8, '#fbe6a0');
      leaf(c, x, y - 7, 8, 4, 0, C.leaf, false);
    } else if (kind === 'raspberry') {
      circle(c, x, y, 6, C.raspberry, c.line(0.5));
      circle(c, x - 2, y - 2, 1.6, '#e0587a');
      circle(c, x + 2, y + 1, 1.6, '#e0587a');
    } else {
      circle(c, x, y, 4.6, C.blueberry, c.line(0.5));
      circle(c, x - 1.2, y - 1.2, 1.2, 'rgba(255,255,255,0.35)');
    }
  }
});
L.granola = layer('scatter', (c, reg) => {
  for (let i = 0; i < 16; i += 1) {
    const [x, y] = reg.pt(c.rand, 10);
    blob(c, x, y, c.between(3, 5.5), c.pick([C.granola, '#a8723a', '#d8a868']), '', 0.35, 6);
  }
});
L.cocoa = layer('scatter', (c, reg) => {
  for (let i = 0; i < 160; i += 1) {
    const [x, y] = reg.pt(c.rand, 0);
    circle(c, x, y, 0.9, 'rgba(70,36,22,0.55)');
  }
});
L.sugar = layer('scatter', (c, reg) => {
  for (let i = 0; i < 90; i += 1) {
    const [x, y] = reg.pt(c.rand, 0);
    circle(c, x, y, 0.9, 'rgba(255,255,255,0.85)');
  }
});
L.roe = layer('scatter', (c, reg) => {
  for (let i = 0; i < 26; i += 1) {
    const [x, y] = reg.pt(c.rand, 10);
    circle(c, x, y, 1.9, C.roe);
  }
});

/* pieces: things that lay themselves out */

// Rows of identical pieces across the region.
function grid(reg, count, cols) {
  const rows = Math.ceil(count / cols);
  const w = reg.kind === 'rect' ? reg.w : reg.r * 1.5;
  const h = reg.kind === 'rect' ? reg.h : reg.r * 1.5;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out.push([
      reg.cx - w / 2 + (w / cols) * (col + 0.5),
      reg.cy - h / 2 + (h / rows) * (row + 0.5),
    ]);
  }
  return out;
}

const FISH = {
  salmon: [C.salmon, C.salmonFat],
  tuna: [C.tuna, C.tunaLt],
  shrimp: [C.shrimp, C.shrimpLt],
  eel: [C.eel, '#a86a3e'],
  tamago: [C.tamago, '#f8df84'],
  hamachi: ['#f3d2bf', '#fbe8dc'],
};

L.nigiri = layer('piece', (c, reg, args) => {
  const kinds = args.length ? args : ['salmon', 'tuna', 'shrimp', 'tamago'];
  const pts = grid(reg, kinds.length, Math.min(kinds.length, 4));
  pts.forEach(([x, y], i) => {
    const kind = kinds[i];
    const [body, stripe] = FISH[kind] || FISH.salmon;
    rect(c, x, y, 26, 44, 10, 0, C.rice, c.line(0.8));
    rect(c, x, y, 24, 40, 8, 0, body, c.line(0.7));
    if (kind === 'tamago') {
      rect(c, x, y, 26, 8, 1, 0, C.nori);
    } else if (kind === 'eel') {
      path(c, `M${f(x - 8)} ${f(y - 12)}h16M${f(x - 8)} ${f(y)}h16M${f(x - 8)} ${f(y + 12)}h16`, 'none', stroke(stripe, 2));
      rect(c, x, y, 26, 6, 1, 0, C.nori);
    } else {
      for (let s = -2; s <= 2; s += 1) {
        path(c, `M${f(x - 10)} ${f(y + s * 8 - 4)}l20 6`, 'none', stroke(stripe, kind === 'tuna' ? 0.9 : 1.8));
      }
    }
  });
});

L.maki = layer('piece', (c, reg, [filling = 'cucumber', n]) => {
  const count = Number(n) || 6;
  const inner = { cucumber: C.cucumber, salmon: C.salmon, tuna: C.tuna, avocado: C.avocado, tamago: C.tamago }[filling] || color(filling);
  grid(reg, count, Math.ceil(count / 2)).forEach(([x, y]) => {
    circle(c, x, y, 17, C.nori, c.line(0.8));
    circle(c, x, y, 14, C.rice);
    for (let i = 0; i < 10; i += 1) ellipse(c, x + c.between(-10, 10), y + c.between(-10, 10), 2.2, 1.1, c.rand() * 180, C.riceDk);
    blob(c, x, y, 6.5, inner, '', 0.2, 6);
  });
});

L.uramaki = layer('piece', (c, reg, [top = 'sesame', fill1 = 'avocado', fill2 = 'salmon', n]) => {
  const count = Number(n) || 6;
  grid(reg, count, Math.ceil(count / 2)).forEach(([x, y]) => {
    circle(c, x, y, 18, C.rice, c.line(0.8));
    if (top === 'roe') for (let i = 0; i < 22; i += 1) circle(c, x + c.between(-14, 14), y + c.between(-14, 14), 1.6, C.roe);
    else if (top === 'salmon') { circle(c, x, y, 18, C.salmon); path(c, `M${f(x - 12)} ${f(y - 4)}l24 8`, 'none', stroke(C.salmonFat, 2)); }
    else if (top === 'tempura') for (let i = 0; i < 14; i += 1) blob(c, x + c.between(-12, 12), y + c.between(-12, 12), 3, C.fryLt, '', 0.4, 5);
    else for (let i = 0; i < 16; i += 1) ellipse(c, x + c.between(-13, 13), y + c.between(-13, 13), 1.6, 0.9, c.rand() * 180, i % 3 ? C.sesame : C.sesameBlk);
    circle(c, x, y, 10, 'none', stroke(C.nori, 2));
    circle(c, x - 3, y, 4.5, color(fill1, C.avocado));
    circle(c, x + 3.5, y + 1, 4.5, color(fill2, C.salmon));
  });
});

L.sashimi = layer('piece', (c, reg, [kind = 'salmon', n]) => {
  const count = Number(n) || 5;
  const [body, stripe] = FISH[kind] || FISH.salmon;
  // a shiso leaf and a nest of daikon under the fan
  leaf(c, reg.cx - 14, reg.cy - 18, 70, 36, -35, C.shiso);
  for (let i = 0; i < 12; i += 1) path(c, `M${f(reg.cx + 20 + c.between(-6, 6))} ${f(reg.cy + 14)}q${f(c.between(-8, 8))} -10 ${f(c.between(-4, 4))} -22`, 'none', stroke('#f4f1ea', 1.4));
  for (let i = 0; i < count; i += 1) {
    const x = reg.cx - 30 + i * 14;
    const y = reg.cy + 8 - Math.sin((i / (count - 1)) * Math.PI) * 8;
    rect(c, x, y, 22, 52, 6, -18 + i * 8, body, c.line(0.7));
    path(c, `M${f(x - 8)} ${f(y - 16)}l16 7M${f(x - 8)} ${f(y - 2)}l16 7M${f(x - 8)} ${f(y + 12)}l16 7`, 'none', stroke(stripe, 1.6));
  }
  circle(c, reg.cx + 30, reg.cy - 26, 6, C.wasabi);
});

L.gyoza = layer('piece', (c, reg, [n]) => {
  const count = Number(n) || 5;
  const step = Math.min(24, (reg.r * 1.5) / count);
  for (let i = 0; i < count; i += 1) {
    const x = reg.cx - ((count - 1) * step) / 2 + i * step;
    const y = reg.cy - 6 + (i % 2) * 6;
    c.add(`<g transform="translate(${f(x)} ${f(y)}) rotate(${f(-8 + i * 4)})">`);
    // Pan-fried face up: pale pleated dome, golden crust across the middle.
    path(c, 'M-20 14Q-24 -24 0 -27Q24 -24 20 14Q0 21 -20 14Z', '#f6e6c4', c.line(0.8));
    path(c, 'M-16 11Q-18 -6 0 -9Q18 -6 16 11Q0 17 -16 11Z', '#d99a52');
    path(c, 'M-10 4Q0 -4 10 4', 'none', stroke('rgba(255,230,180,0.5)', 2));
    for (let p = -2; p <= 2; p += 1) {
      path(c, `M${f(p * 7)} ${f(-24 + Math.abs(p) * 2.5)}q${f(p * 0.8)} 5 0 9`, 'none', stroke('rgba(150,110,60,0.5)', 1.3));
    }
    c.add('</g>');
  }
  ellipse(c, reg.cx + reg.r * 0.5, reg.cy + reg.r * 0.58, 15, 11, 0, '#4a2a1a', c.line(0.6));
  ellipse(c, reg.cx + reg.r * 0.46, reg.cy + reg.r * 0.54, 5, 3, 0, 'rgba(255,255,255,0.18)');
});

L.skewers = layer('piece', (c, reg, [kind = 'chicken', n]) => {
  const count = Number(n) || 3;
  for (let i = 0; i < count; i += 1) {
    const off = (i - (count - 1) / 2) * 30;
    const x1 = reg.cx - 68;
    const y1 = reg.cy + off + 14;
    const x2 = reg.cx + 66;
    const y2 = reg.cy + off - 14;
    path(c, `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`, 'none', stroke('#d9b27a', 3.2));
    for (let k = 0; k < 4; k += 1) {
      const t = 0.22 + k * 0.19;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (kind === 'dango') {
        circle(c, x, y, 11, ['#f4a7b9', '#fbf6ea', '#9cc46a', '#f4a7b9'][k], c.line(0.7));
      } else if (kind === 'negima' && k % 2) {
        rect(c, x, y, 12, 20, 4, -12, '#e8f0c4', c.line(0.6));
        rect(c, x, y, 4, 18, 2, -12, '#9cc46a');
      } else if (kind === 'mushroom') {
        ellipse(c, x, y, 11, 9, 0, C.mushroom, c.line(0.6));
        path(c, `M${f(x - 6)} ${f(y)}h12`, 'none', stroke('#7a5a40', 1.5));
      } else if (kind === 'shrimp') {
        path(c, `M${f(x - 7)} ${f(y - 5)}a8 8 0 1 0 12 0`, 'none', stroke(C.shrimp, 7));
      } else {
        const meat = kind === 'beef' ? C.beef : '#d7a060';
        blob(c, x, y, 11, meat, c.line(0.7), 0.16, 7);
        path(c, `M${f(x - 6)} ${f(y + 4)}l10 -8`, 'none', stroke(C.char, 2));
      }
    }
    if (kind !== 'dango') path(c, `M${f(x1 + 30)} ${f(y1 - 9)}L${f(x2 - 30)} ${f(y2 - 9)}`, 'none', stroke('rgba(120,50,20,0.35)', 3, ' stroke-dasharray="6 14"'));
  }
});

L.tempura = layer('piece', (c, reg, [n]) => {
  const count = Number(n) || 3;
  for (let i = 0; i < count; i += 1) {
    const y = reg.cy - 30 + i * 28;
    const x = reg.cx - 8;
    blob(c, x - 22, y, 15, C.fryLt, c.line(0.6), 0.3, 8);
    blob(c, x, y - 1, 16, C.fryLt, '', 0.3, 8);
    blob(c, x + 20, y - 2, 12, C.fry, '', 0.3, 8);
    path(c, `M${f(x + 30)} ${f(y - 3)}l15 -11l-2 16z`, C.tomato, c.line(0.5));
  }
  ellipse(c, reg.cx + reg.r * 0.55, reg.cy + reg.r * 0.55, 13, 10, 0, '#4a2a1a');
});

L.edamame = layer('piece', (c, reg, [n]) => {
  for (let i = 0; i < (Number(n) || 11); i += 1) {
    const [x, y] = reg.pt(c.rand, 18);
    const rot = c.rand() * 180;
    c.add(`<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">`);
    rect(c, 0, 0, 38, 13, 6.5, 0, '#7cb84a', c.line(0.6));
    for (let k = -1; k <= 1; k += 1) circle(c, k * 11, 0, 4.4, '#97cc62');
    c.add('</g>');
  }
  L.flakes.draw(c, reg, ['#ffffff']);
});

L.steak = layer('piece', (c, reg, [n]) => {
  const count = Number(n) || 5;
  for (let i = 0; i < count; i += 1) {
    const x = reg.cx - ((count - 1) * 12) / 2 + i * 12;
    const y = reg.cy + i * 2 - 4;
    rect(c, x, y, 16, 58, 6, 14, C.steak, c.line(0.8));
    rect(c, x, y, 9, 48, 4, 14, C.steakIn);
  }
});

L.pizza = layer('piece', (c, reg, args) => {
  const { cx, cy } = reg;
  const R = Math.min(reg.r * 1.12, 76);
  blob(c, cx, cy, R, C.crust, c.line(1), 0.03, 16);
  for (let i = 0; i < 9; i += 1) {
    const a = c.rand() * TAU;
    circle(c, cx + Math.cos(a) * (R - 5), cy + Math.sin(a) * (R - 5), c.between(2, 4), C.char, ' opacity="0.5"');
  }
  const base = args.includes('bianca') ? '#f4ecd6' : C.sauce;
  circle(c, cx, cy, R - 11, base);
  const toppings = args.filter((a) => a !== 'bianca');
  for (let i = 0; i < 11; i += 1) {
    const a = c.rand() * TAU;
    const d = Math.sqrt(c.rand()) * (R - 22);
    blob(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d, c.between(7, 12), C.mozz, '', 0.25, 7);
  }
  const place = (draw, n) => {
    for (let i = 0; i < n; i += 1) {
      const a = c.rand() * TAU;
      const d = Math.sqrt(c.rand()) * (R - 22);
      draw(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    }
  };
  for (const top of toppings) {
    if (top === 'basil') place((x, y) => leaf(c, x, y, 16, 8, c.rand() * 360, C.basil), 6);
    if (top === 'pepperoni' || top === 'salami') place((x, y) => { circle(c, x, y, 7.5, '#b8322a', c.line(0.5)); circle(c, x + 1, y - 1, 1.4, '#e6876a'); }, 10);
    if (top === 'mushroom') place((x, y) => { ellipse(c, x, y, 7, 5, c.rand() * 180, C.mushroom, c.line(0.4)); }, 9);
    if (top === 'olive') place((x, y) => { circle(c, x, y, 3.4, 'none', stroke(C.olive, 2.2)); }, 12);
    if (top === 'rocket') place((x, y) => leaf(c, x, y, 18, 6, c.rand() * 360, '#5f9a3a'), 12);
    if (top === 'prosciutto') place((x, y) => blob(c, x, y, 10, '#e79a96', '', 0.35, 7), 6);
    if (top === 'chili') place((x, y) => circle(c, x, y, 2.6, 'none', stroke(C.chili, 1.5)), 10);
    if (top === 'tomato') place((x, y) => { circle(c, x, y, 7, C.tomato); circle(c, x, y, 4.5, C.tomatoLt); }, 7);
    if (top === 'honey') L.drizzle.draw(c, { ...reg, r: R * 0.8 }, ['honey']);
  }
  // slice cuts
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI + 0.3;
    path(c, `M${f(cx - Math.cos(a) * (R - 2))} ${f(cy - Math.sin(a) * (R - 2))}L${f(cx + Math.cos(a) * (R - 2))} ${f(cy + Math.sin(a) * (R - 2))}`, 'none', stroke('rgba(90,40,20,0.22)', 1.4));
  }
});

L.sandwich = layer('piece', (c, reg) => {
  const { cx, cy } = reg;
  [[-22, -14, -14], [24, 16, 10]].forEach(([dx, dy, rot]) => {
    const x = cx + dx;
    const y = cy + dy;
    c.add(`<g transform="rotate(${rot} ${f(x)} ${f(y)})">`);
    // Filling peeking out along the cut edge.
    rect(c, x, y + 26, 60, 10, 4, 0, C.pesto);
    rect(c, x - 10, y + 27, 18, 8, 3, 0, C.tomato);
    rect(c, x + 14, y + 27, 18, 7, 3, 0, C.mozz);
    rect(c, x, y, 66, 52, 18, 0, '#d9a35e', c.line(1));
    rect(c, x, y - 2, 56, 40, 14, 0, '#e8bd7a');
    for (let i = -1; i <= 1; i += 1) path(c, `M${f(x - 20)} ${f(y + i * 11 - 4)}l40 8`, 'none', stroke('rgba(110,60,20,0.45)', 2.6));
    for (let i = 0; i < 16; i += 1) circle(c, x + c.between(-24, 24), y + c.between(-16, 14), 0.9, 'rgba(255,255,255,0.7)');
    c.add('</g>');
  });
});

L.salad = layer('piece', (c, reg) => {
  L.leaves.draw(c, reg, []);
});

const CAKE = {
  cream: [C.cream, '#f3e3c3'],
  cheesecake: ['#f7e8c4', '#d9a35e'],
  chocolate: ['#5a3424', '#3e2218'],
  matcha: [C.matcha, '#f3e3c3'],
  carrot: ['#fbf3e0', '#c98a4a'],
  basque: ['#8a5228', '#efd29a'],
};

L.cake = layer('piece', (c, reg, [kind = 'cream', fruit]) => {
  const { cx, cy } = reg;
  const [top, side] = CAKE[kind] || [color(kind, C.cream), '#f3e3c3'];
  // A wedge seen from above, point toward the viewer.
  path(c, `M${f(cx)} ${f(cy + 46)}L${f(cx - 40)} ${f(cy - 34)}A56 56 0 0 1 ${f(cx + 40)} ${f(cy - 34)}Z`, side, c.line(1));
  path(c, `M${f(cx)} ${f(cy + 38)}L${f(cx - 33)} ${f(cy - 28)}A48 48 0 0 1 ${f(cx + 33)} ${f(cy - 28)}Z`, top);
  if (kind === 'chocolate') L.sugar.draw(c, { ...reg, r: 22, cy: cy - 10 }, []);
  if (fruit) L.berries.draw(c, { ...reg, r: 20, cy: cy - 14 }, [fruit, '3']);
});

L.tiramisu = layer('piece', (c, reg) => {
  const { cx, cy } = reg;
  rect(c, cx, cy, 82, 82, 4, -6, '#e8d7b5', c.line(1));
  rect(c, cx, cy, 76, 76, 3, -6, '#7a4a2c');
  for (let i = 0; i < 260; i += 1) circle(c, cx + c.between(-36, 36), cy + c.between(-36, 36), 1, 'rgba(40,20,10,0.5)');
  leaf(c, cx + 22, cy - 22, 16, 8, 30, C.mint);
});

L.pannacotta = layer('piece', (c, reg, [col = 'raspberry']) => {
  const { cx, cy } = reg;
  circle(c, cx, cy, 34, '#fbf5e8', c.line(1));
  circle(c, cx - 8, cy - 8, 12, 'rgba(255,255,255,0.6)');
  blob(c, cx + 4, cy + 4, 18, color(col, C.raspberry), '', 0.25, 9);
  L.berries.draw(c, { ...reg, r: 14, cx: cx + 4, cy: cy + 4 }, ['raspberry', '2']);
});

L.icecream = layer('piece', (c, reg, args) => {
  const flavours = args.length ? args : ['#f6ecd6', '#f4a7b9'];
  flavours.forEach((col, i) => {
    const a = (i / flavours.length) * TAU - 0.6;
    const x = reg.cx + Math.cos(a) * (flavours.length > 1 ? 18 : 0);
    const y = reg.cy + Math.sin(a) * (flavours.length > 1 ? 18 : 0);
    blob(c, x, y, 24, color(col), c.line(0.9), 0.12, 10);
    blob(c, x - 6, y - 6, 8, 'rgba(255,255,255,0.35)', '', 0.3, 6);
  });
});

L.mochi = layer('piece', (c, reg, args) => {
  const cols = args.length ? args : ['#f4a7b9', '#fbf6ea', '#a7cf7a'];
  cols.forEach((col, i) => {
    const a = (i / cols.length) * TAU - Math.PI / 2;
    const x = reg.cx + Math.cos(a) * 24;
    const y = reg.cy + Math.sin(a) * 24;
    circle(c, x, y, 19, color(col), c.line(0.9));
    circle(c, x - 6, y - 6, 6, 'rgba(255,255,255,0.45)');
    for (let k = 0; k < 18; k += 1) circle(c, x + c.between(-14, 14), y + c.between(-14, 14), 0.7, 'rgba(255,255,255,0.8)');
  });
});

L.croissant = layer('piece', (c, reg) => {
  const { cx, cy } = reg;
  // A shallow crescent: thick in the middle, tapering to curled tips,
  // crossed by the rolled bands of dough.
  const R = 70;
  const oy = cy + 62;
  const from = -150;
  const span = 120;
  const thick = (t) => 5 + 23 * Math.sin(t * Math.PI);
  const at = (t, off) => {
    const a = ((from + span * t) * Math.PI) / 180;
    return [cx + Math.cos(a) * (R + off), oy + Math.sin(a) * (R + off)];
  };
  const steps = 24;
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    outer.push(at(t, thick(t)));
    inner.unshift(at(t, -thick(t) * 0.8));
  }
  const ring = [...outer, ...inner].map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('');
  path(c, `${ring}Z`, C.doughDk, c.line(1));
  const bands = 7;
  for (let i = 0; i < bands; i += 1) {
    const t0 = (i + 0.18) / bands;
    const t1 = (i + 0.82) / bands;
    const tm = (i + 0.5) / bands;
    const [ax, ay] = at(t0, thick(tm) * 0.25);
    const [bx, by] = at(t1, thick(tm) * 0.25);
    const [mx, my] = at(tm, thick(tm) * 0.85);
    path(c, `M${f(ax)} ${f(ay)}Q${f(mx)} ${f(my)} ${f(bx)} ${f(by)}Q${f(at(tm, -thick(tm) * 0.4)[0])} ${f(at(tm, -thick(tm) * 0.4)[1])} ${f(ax)} ${f(ay)}Z`, C.dough);
  }
  for (let i = 1; i < bands; i += 1) {
    const t = i / bands;
    const [ox, oyy] = at(t, thick(t) * 0.95);
    const [ix, iy] = at(t, -thick(t) * 0.75);
    path(c, `M${f(ox)} ${f(oyy)}L${f(ix)} ${f(iy)}`, 'none', stroke('rgba(120,70,20,0.45)', 1.4));
  }
});

L.cinnamonroll = layer('piece', (c, reg) => {
  const { cx, cy } = reg;
  circle(c, cx, cy, 44, C.doughDk, c.line(1));
  let d = `M${f(cx)} ${f(cy)}`;
  for (let t = 0; t < 4.2 * TAU; t += 0.3) {
    const r = 2 + t * 1.55;
    d += `L${f(cx + Math.cos(t) * r)} ${f(cy + Math.sin(t) * r)}`;
  }
  path(c, d, 'none', stroke('#9a5a2a', 3));
  for (let i = 0; i < 4; i += 1) {
    const y = cy - 24 + i * 16;
    path(c, `M${f(cx - 30)} ${f(y + c.between(-4, 4))}Q${f(cx)} ${f(y + c.between(-12, 12))} ${f(cx + 30)} ${f(y + c.between(-4, 4))}`, 'none', stroke('#fbf7ee', 2.4));
  }
});

L.cookie = layer('piece', (c, reg, [n]) => {
  const count = Number(n) || 3;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * TAU - 0.4;
    const x = reg.cx + Math.cos(a) * (count > 1 ? 24 : 0);
    const y = reg.cy + Math.sin(a) * (count > 1 ? 24 : 0);
    blob(c, x, y, 26, '#d9a35e', c.line(0.9), 0.07, 12);
    for (let k = 0; k < 7; k += 1) blob(c, x + c.between(-16, 16), y + c.between(-16, 16), 3.4, C.chocolate, '', 0.3, 5);
  }
});

L.toast = layer('piece', (c, reg, [top = 'avocado']) => {
  const { cx, cy } = reg;
  c.add(`<g transform="rotate(-10 ${f(cx)} ${f(cy)})">`);
  path(c, `M${f(cx - 42)} ${f(cy + 40)}V${f(cy - 18)}Q${f(cx - 42)} ${f(cy - 50)} ${f(cx)} ${f(cy - 50)}Q${f(cx + 42)} ${f(cy - 50)} ${f(cx + 42)} ${f(cy - 18)}V${f(cy + 40)}Z`, '#c98a4a', c.line(1));
  path(c, `M${f(cx - 35)} ${f(cy + 34)}V${f(cy - 16)}Q${f(cx - 35)} ${f(cy - 43)} ${f(cx)} ${f(cy - 43)}Q${f(cx + 35)} ${f(cy - 43)} ${f(cx + 35)} ${f(cy - 16)}V${f(cy + 34)}Z`, '#ecc788');
  if (top === 'avocado') {
    for (let i = 0; i < 5; i += 1) {
      ellipse(c, cx - 22 + i * 11, cy - 4, 6.5, 26, 8, C.avocado, c.line(0.5));
      ellipse(c, cx - 24 + i * 11, cy - 4, 2.4, 23, 8, C.avocadoDk);
    }
    L.flakes.draw(c, { ...reg, r: 30 }, []);
  } else if (top === 'egg') {
    L.friedegg.draw(c, cx, cy - 4);
  } else {
    blob(c, cx, cy - 4, 26, color(top, C.strawberry), '', 0.18, 9);
  }
  c.add('</g>');
});

L.pancakes = layer('piece', (c, reg) => {
  const { cx, cy } = reg;
  circle(c, cx + 4, cy + 4, 50, '#c88a46', c.line(1));
  circle(c, cx, cy, 50, '#e2ac62', c.line(1));
  circle(c, cx, cy, 44, '#eebf78');
  blob(c, cx + 6, cy + 4, 32, 'rgba(196,122,44,0.75)', '', 0.2, 10);
  rect(c, cx - 2, cy - 4, 18, 13, 3, 12, '#fbe7a2', c.line(0.6));
  L.berries.draw(c, { ...reg, r: 38 }, ['blueberry', '6']);
});

L.muffin = layer('piece', (c, reg) => {
  const { cx, cy } = reg;
  circle(c, cx, cy, 44, '#f1e6d2', c.line(1));
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * TAU;
    path(c, `M${f(cx + Math.cos(a) * 38)} ${f(cy + Math.sin(a) * 38)}L${f(cx + Math.cos(a) * 44)} ${f(cy + Math.sin(a) * 44)}`, 'none', stroke('#d8c8aa', 1.5));
  }
  blob(c, cx, cy, 36, '#d69a52', c.line(0.8), 0.1, 11);
  L.berries.draw(c, { ...reg, r: 26 }, ['blueberry', '7']);
  L.sugar.draw(c, { ...reg, r: 30 }, []);
});

L.brownie = layer('piece', (c, reg, [n]) => {
  grid(reg, Number(n) || 2, 2).forEach(([x, y]) => {
    rect(c, x, y, 44, 44, 4, c.between(-8, 8), '#4a2a1e', c.line(0.9));
    rect(c, x - 2, y - 2, 34, 34, 4, c.between(-8, 8), '#5e3626');
  });
});

L.baklava = layer('piece', (c, reg, [n]) => {
  grid(reg, Number(n) || 6, 3).forEach(([x, y]) => {
    path(c, `M${f(x)} ${f(y - 20)}L${f(x + 17)} ${f(y)}L${f(x)} ${f(y + 20)}L${f(x - 17)} ${f(y)}Z`, '#d9a050', c.line(0.8));
    path(c, `M${f(x)} ${f(y - 13)}L${f(x + 11)} ${f(y)}L${f(x)} ${f(y + 13)}L${f(x - 11)} ${f(y)}Z`, '#e9bc6a');
    circle(c, x, y, 4, C.pistachio);
  });
});

/* drinks */

L.latte = layer('topping', (c, x, y, [art = 'heart']) => {
  if (art === 'rosetta') {
    path(c, `M${f(x)} ${f(y + 24)}L${f(x)} ${f(y - 22)}`, 'none', stroke(C.milk, 2.4));
    for (let i = 0; i < 6; i += 1) {
      const yy = y + 16 - i * 7;
      const w = 22 - i * 3;
      path(c, `M${f(x - w)} ${f(yy)}Q${f(x)} ${f(yy - 12)} ${f(x + w)} ${f(yy)}`, 'none', stroke(C.milk, 3.4));
    }
  } else if (art === 'tulip') {
    for (let i = 0; i < 3; i += 1) ellipse(c, x, y + 12 - i * 12, 17 - i * 3, 8, 0, C.milk);
    path(c, `M${f(x)} ${f(y + 24)}V${f(y - 14)}`, 'none', stroke(C.crema, 1.6));
  } else {
    path(c, `M${f(x)} ${f(y + 20)}C${f(x - 30)} ${f(y)} ${f(x - 20)} ${f(y - 22)} ${f(x)} ${f(y - 8)}C${f(x + 20)} ${f(y - 22)} ${f(x + 30)} ${f(y)} ${f(x)} ${f(y + 20)}Z`, C.milk);
  }
});
L.foam = layer('fill', (c, reg, [col]) => {
  circle(c, reg.cx, reg.cy, reg.r, color(col, '#f4e8d4'));
  for (let i = 0; i < 18; i += 1) {
    const [x, y] = reg.pt(c.rand, 4);
    circle(c, x, y, c.between(1, 3), 'rgba(255,255,255,0.55)');
  }
});
L.whipped = layer('topping', (c, x, y) => {
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    blob(c, x + Math.cos(a) * 14, y + Math.sin(a) * 14, 10, '#fffaf0', c.line(0.5), 0.15, 7);
  }
  blob(c, x, y, 12, '#ffffff', c.line(0.5), 0.15, 7);
});
L.straw = layer('side', (c, reg, [col = '#e2553b']) => {
  const x = reg.cx + reg.r * 0.35;
  const y = reg.cy - reg.r * 0.2;
  path(c, `M${f(x)} ${f(y)}L${f(x + 70)} ${f(y - 62)}`, 'none', stroke(color(col), 8));
  path(c, `M${f(x)} ${f(y)}L${f(x + 70)} ${f(y - 62)}`, 'none', stroke('rgba(255,255,255,0.45)', 2, ' stroke-dasharray="5 7"'));
  circle(c, x, y, 4, 'rgba(0,0,0,0.35)');
});
L.teabag = layer('side', (c) => {
  path(c, 'M150 70Q170 40 182 30', 'none', stroke('#efe6d2', 1.2));
  rect(c, 184, 26, 12, 14, 1, 20, '#e2553b');
});

/* steam: drawn on top of everything, and only shown (and animated) where
   the dish is large -- in a 60px thumbnail it would read as a smudge. */
L.steam = layer('steam', (c, reg, [n]) => {
  const col = c.style.steam || 'rgba(255,255,255,0.75)';
  const count = Number(n) || 3;
  for (let i = 0; i < count; i += 1) {
    const x = reg.cx - 22 + i * 22 + c.between(-4, 4);
    const y = reg.cy - 6;
    c.add(`<path class="wisp" style="--w:${i}" d="M${f(x)} ${f(y)}c-7 -9 7 -15 0 -24s7 -15 0 -24" fill="none"${stroke(col, 3.2)}/>`);
  }
});

/* sides */

L.chopsticks = layer('side', (c, reg, [col]) => {
  const wood = color(col, c.style.sticks || '#c99a62');
  path(c, 'M20 192L188 36', 'none', stroke(wood, 5.5) + c.line(0.4));
  path(c, 'M34 196L194 50', 'none', stroke(wood, 5.5) + c.line(0.4));
  rect(c, 34, 178, 14, 8, 3, -42, c.style.rest || '#e2553b');
});
L.spoon = layer('side', (c) => {
  const s = c.style.metal || '#c9ccd1';
  ellipse(c, 176, 160, 9, 13, -30, s, c.line(0.6));
  path(c, 'M182 150L196 120', 'none', stroke(s, 4));
});
L.fork = layer('side', (c) => {
  const s = c.style.metal || '#c9ccd1';
  path(c, 'M182 196L196 120', 'none', stroke(s, 4.2));
  for (let i = -1; i <= 2; i += 1) path(c, `M${f(195 + i * 2.6)} 122L${f(199 + i * 2.6)} 102`, 'none', stroke(s, 1.6));
});
L.ramekin = layer('side', (c, reg, [col]) => {
  circle(c, 166, 168, 22, c.style.plate || '#f1ece2', c.line(0.9));
  circle(c, 166, 168, 16, color(col, '#4a2a1a'));
});
L.bread = layer('side', (c) => {
  ellipse(c, 168, 40, 26, 16, 30, '#d9a35e', c.line(0.9));
  ellipse(c, 168, 40, 18, 10, 30, '#f2d6a2');
});

/* ---------- render ---------- */

export function parseSpec(spec) {
  const [vessel, ...rest] = String(spec || 'plate').trim().split(/\s+/);
  return {
    vessel: VESSELS[vessel] ? vessel : 'plate',
    layers: rest.map((token) => {
      const [name, ...args] = token.split(':');
      return { name, args };
    }).filter((l) => L[l.name]),
  };
}

// The clip-path id is left as a placeholder so one rendered string can be
// reused many times: the caller swaps in a fresh id for each copy it puts in
// the page, since two identical ids would make every copy share one clip.
export const UID = '%UID%';

export function drawDish(spec, seed, style, tile) {
  const rand = seeded(String(seed));
  const uid = UID;
  const c = context(style, rand, uid);
  const { vessel, layers } = parseSpec(spec);

  c.add(`<rect width="200" height="200" fill="${tile}"/>`);
  if (style.tileDots) {
    for (let i = 0; i < 26; i += 1) {
      circle(c, rand() * 200, rand() * 200, 0.9, style.tileDots);
    }
  }

  // Every layer is wrapped in its own group carrying its kind and its place
  // in the sequence (--i). Static, that changes nothing; menu.css uses it to
  // plate the dish one layer at a time when it opens.
  let step = 0;
  const open = (kind) => c.add(`<g class="ly ly-${kind}" style="--i:${step++}">`);
  const close = () => c.add('</g>');

  open('vessel');
  const reg = VESSELS[vessel](c);
  close();
  const rot = reg.rot || 0;
  const kindOf = (l) => L[l.name].kind;
  const inside = layers.filter((l) => kindOf(l) !== 'side' && kindOf(l) !== 'steam');
  const outside = layers.filter((l) => kindOf(l) === 'side');
  const steam = layers.filter((l) => kindOf(l) === 'steam');
  const toppings = inside.filter((l) => kindOf(l) === 'topping');

  // Toppings take evenly spaced slots on a ring, the way ramen is dressed.
  const slots = toppings.length;
  const start = -2.3 + rand() * 0.4;
  let slot = 0;

  c.add(`<defs><clipPath id="${uid}">${reg.clip}</clipPath></defs>`);
  c.add(`<g clip-path="url(#${uid})"${rot ? ` transform="rotate(${rot} ${reg.cx} ${reg.cy})"` : ''}>`);
  for (const { name, args } of inside) {
    const def = L[name];
    open(def.kind);
    if (def.kind === 'topping') {
      const lone = slots === 1;
      const a = start + (slot / Math.max(slots, 1)) * TAU;
      const d = lone ? reg.r * 0.18 : reg.r * (slots > 4 ? 0.52 : 0.46);
      const x = reg.cx + Math.cos(a) * d;
      const y = reg.cy + Math.sin(a) * d;
      // Toppings are drawn at a nominal size and scaled to the vessel.
      const k = Math.max(0.85, Math.min(1.45, reg.r / 46));
      c.add(`<g transform="translate(${f(x)} ${f(y)}) scale(${f(k)}) translate(${f(-x)} ${f(-y)})">`);
      def.draw(c, x, y, args);
      c.add('</g>');
      slot += 1;
    } else {
      def.draw(c, reg, args);
    }
    close();
  }
  c.add('</g>');
  if (c.ink) {
    c.add(`<g class="ly ly-vessel" style="--i:0" fill="none">${reg.clip.replace('/>', ` stroke="${style.line}" stroke-width="${f((style.lineW || 1.8) * 0.8)}" pathLength="1"${rot ? ` transform="rotate(${rot} ${reg.cx} ${reg.cy})"` : ''}/>`)}</g>`);
  }
  for (const { name, args } of outside) {
    open('side');
    L[name].draw(c, reg, args);
    close();
  }
  for (const { name, args } of steam) {
    c.add('<g class="ly-steam">');
    L[name].draw(c, reg, args);
    close();
  }

  return c.out.join('');
}

// Wrapped for direct use in markup. The SVG is decorative: the dish name
// is always right next to it.
// The background a dish is drawn on: its own, its category's, or one of the
// brand's tiles picked by id so neighbours vary.
export function tileFor(item, style, tile) {
  const tiles = style.tiles || ['#eee'];
  return item.tile || tile || tiles[Math.abs(hashOf(item.id)) % tiles.length];
}

export function dishSvg(item, style, tile) {
  const ground = tileFor(item, style, tile);
  return `<svg class="art" viewBox="0 0 200 200" aria-hidden="true" focusable="false">${drawDish(item.art, item.id, style, ground)}</svg>`;
}

function hashOf(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

export const LAYERS = Object.keys(L);
export const VESSEL_NAMES = Object.keys(VESSELS);
