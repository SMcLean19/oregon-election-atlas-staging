// ---------- constants ----------
const CH = {
  house: { label: 'State House', short: 'HD', title: 'House District', rep: 'Rep.' },
  senate: { label: 'State Senate', short: 'SD', title: 'Senate District', rep: 'Sen.' },
  congress: { label: 'Congress', short: 'CD', title: 'Congressional District', rep: 'Rep.' },
  county: { label: 'Statewide', short: '', title: 'County', rep: '' },
};
// Oregon's five statewide executive offices (Oregon Blue Book; holders checked Oct 28, 2026)
const STATE_EXEC = [
  { office: 'Governor', short: 'Governor',  holder: 'Tina Kotek', party: 'D', since: '2023', up2026: 'Yes' },
  { office: 'Secretary of State', short: 'Sec. of State',  holder: 'Tobias Read', party: 'D', since: '2025', up2026: 'No' },
  { office: 'Attorney General', short: 'Attorney Gen.',  holder: 'Dan Rayfield', party: 'D', since: '2025', up2026: 'No' },
  { office: 'State Treasurer', short: 'Treasurer',  holder: 'Elizabeth Steiner', party: 'D', since: '2025', up2026: 'No' },
  { office: 'Labor Commissioner (BOLI)', short: 'Labor Comm.',  holder: 'Christina Stephenson', party: 'D', since: '2023', up2026: 'No', note: 'Formally nonpartisan office; re-elected outright in the May 2026 primary' },
];
const monthName = (m) => (m ? new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const regMonth = () => { const r = rows('state_registration'); return r && r[0] ? monthName(r[0].month) : ''; };
const S = { chamber: 'house', color: 'holder', sel: null, tab: 'map', sort: { key: 'abs_baseline', dir: 1 }, q: '', when: 'now', topf: 'all' };
const $ = (s, el = document) => el.querySelector(s);
const enc = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
const where = (o) => Object.entries(o).map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
const mark = (el, src, field, w) => {
  el.setAttribute('data-source', src);
  if (field) el.setAttribute('data-field', field);
  if (w) el.setAttribute('data-where', where(w));
  return el;
};
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const fmt = d3.format(',');
const pct = (v) => (v == null ? '' : `${Number(v).toFixed(1)}%`);
const pcls = (p) => (p === 'D' ? 'pd' : p === 'R' ? 'pr' : '');
const dname = (ch, d) => (ch === 'county' ? `${d} County` : `${CH[ch].title} ${d}`);
const dshort = (ch, d) => (ch === 'county' ? d : `${CH[ch].short} ${d}`);
const rows = (id) => { const x = dash.data(id); return x.status === 'ok' ? x.data : null; };

// ---------- colors ----------
let NEUTRAL = '#ddd';
function readNeutral() {
  const probe = el('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;background:var(--color-border-line)';
  $('.oea').appendChild(probe);
  NEUTRAL = getComputedStyle(probe).backgroundColor || NEUTRAL;
  probe.remove();
}
const CD = () => getComputedStyle($('.oea')).getPropertyValue('--oea-d').trim() || '#2f69c0';
const CR = () => getComputedStyle($('.oea')).getPropertyValue('--oea-r').trim() || '#c33f37';
const CT = () => getComputedStyle($('.oea')).getPropertyValue('--oea-toss').trim() || '#8d6cc0';
function diverge(v, max) {
  if (v == null || Number.isNaN(v)) return NEUTRAL;
  const t = Math.min(1, Math.abs(v) / max);
  return d3.interpolateRgb(NEUTRAL, v > 0 ? CD() : CR())(0.12 + 0.88 * t);
}
const RATING = ['Safe D', 'Likely D', 'Lean D', 'Toss-up', 'Lean R', 'Likely R', 'Safe R'];
function ratingColor(r) {
  if (!r) return NEUTRAL;
  if (r === 'Toss-up') return CT();
  const t = r.startsWith('Safe') ? 1 : r.startsWith('Likely') ? 0.62 : 0.32;
  return d3.interpolateRgb(NEUTRAL, r.endsWith('D') ? CD() : CR())(t);
}
const SWING_PTS = 4; // margins inside +/- 4 pts are drawn as swing seats, not as light party shades
const CS = () => getComputedStyle($('.oea')).getPropertyValue('--oea-swing').trim() || '#8d6cc0';
const swing = (v, max) => (v != null && Math.abs(v) < SWING_PTS ? CS() : diverge(v, max));
const COLOR = {
  baseline: { f: (o) => swing(o.baseline, 35), legend: 'ramp', max: 35, label: 'Average statewide-race margin' },
  pres_2024: { f: (o) => swing(o.pres_2024, 40), legend: 'ramp', max: 40, label: '2024 President margin' },
  gov_2022: { f: (o) => swing(o.gov_2022, 40), legend: 'ramp', max: 40, label: '2022 Governor margin' },
  reg_gap: { f: (o) => swing(o.reg_gap, 40), legend: 'ramp', max: 40, get label() { return `Registered D minus R, ${regMonth()}`; } },
  shift: { f: (o) => diverge(o.shift, 5), legend: 'ramp', max: 5, label: 'Change in D−R registration gap since Sep 2022' },
  rating: { f: (o) => ratingColor(o.rating), legend: 'rating' },
  holder: { f: (o) => (o.holder_party === 'D' ? CD() : o.holder_party === 'R' ? CR() : NEUTRAL), legend: 'holder' },
};

// ---------- geometry ----------
const LON0 = -124.75, LON1 = -116.35, LAT0 = 41.9, LAT1 = 46.35, KX = Math.cos(44.2 * Math.PI / 180);
const VW = 1000, SC = VW / ((LON1 - LON0) * KX), VH = Math.round((LAT1 - LAT0) * SC);
const proj = (lon, lat) => [(lon - LON0) * KX * SC, (LAT1 - lat) * SC];
const GEO = {};
const pArea = d3.polygonArea || ((p) => p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + (x * y2 - x2 * y) / 2; }, 0));
const pCent = d3.polygonCentroid || ((p) => [d3.mean(p, (q) => q[0]), d3.mean(p, (q) => q[1])]);
// Label placement. Every visible label is the same size (13 map units at the full-state view, scaling with zoom).
// A label sits at its shape's center when it fits there; otherwise it may shift a short way to where it fits; if it
// still doesn't fit at this zoom it is hidden until the user zooms in (then the center has room).
const CAP_H = 0.8;
let _cv = null;
function emWidth(t) {  // label width per unit of font size, measured in the page's font (estimate outside a browser)
  try {
    if (!_cv) _cv = document.createElement('canvas').getContext('2d');
    const fam = getComputedStyle(document.querySelector('.oea') || document.body).getPropertyValue('--font-anthropic-sans').trim() || getComputedStyle(document.body).fontFamily;
    _cv.font = `100px ${fam}`;
    return _cv.measureText(String(t)).width / 100 * 1.06;
  } catch (e) { return String(t).length * 0.62; }
}
function labelSpot(rings, text) {
  const ring = rings[0], W = emWidth(text);
  const segs = [];  // every edge, holes included
  for (const r of rings) for (let i = 0; i < r.length; i++) segs.push([r[i], r[(i + 1) % r.length]]);
  const contains = (p) => d3.polygonContains(ring, p) && !rings.slice(1).some((h) => d3.polygonContains(h, p));
  const rays = ([px, py]) => {  // distance from p to the shape's edge going left, right, up and down
    let l = Infinity, r = Infinity, u = Infinity, dn = Infinity;
    for (const [[ax, ay], [bx, by]] of segs) {
      if ((ay > py) !== (by > py)) { const x = ax + (py - ay) * (bx - ax) / (by - ay); if (x < px) l = Math.min(l, px - x); else r = Math.min(r, x - px); }
      if ((ax > px) !== (bx > px)) { const y = ay + (px - ax) * (by - ay) / (bx - ax); if (y < py) u = Math.min(u, py - y); else dn = Math.min(dn, y - py); }
    }
    return [Math.min(l, r), Math.min(u, dn)];
  };
  // largest font whose label box, centered on p, stays inside the shape
  const fit = (p) => {
    if (!contains(p)) return 0;
    const [hx, hy] = rays(p);
    let f = Math.min(hx * 2 * 0.95 / W, hy * 2 * 0.9 / CAP_H);
    for (let t = 0; t < 8 && f > 0.5; t++) {
      const w = W * f / 2, h = CAP_H * f / 2;
      const pts = [[-w, -h], [w, -h], [-w, h], [w, h], [-w, 0], [w, 0], [0, -h], [0, h]].map(([dx, dy]) => [p[0] + dx, p[1] + dy]);
      if (pts.every(contains) && rays([p[0], p[1] - h])[0] * 2 >= W * f * 0.95 && rays([p[0], p[1] + h])[0] * 2 >= W * f * 0.95) return f;
      f *= 0.9;
    }
    return 0;
  };
  const cen = pCent(ring), fc = fit(cen), T = 13;
  if (fc >= T) return { cen, fc, m: cen, fm: fc };
  const x0 = d3.min(ring, (p) => p[0]), x1 = d3.max(ring, (p) => p[0]), y0 = d3.min(ring, (p) => p[1]), y1 = d3.max(ring, (p) => p[1]);
  const inside = contains(cen);
  // a short shift only (8% of the shape's size) when the center is inside; curved shapes whose center is outside
  // (e.g. SD 1, HD 27) take the nearest spot with room
  const maxMove = inside ? 0.08 * Math.hypot(x1 - x0, y1 - y0) : Infinity;
  const g = 40, cands = [];
  for (let i = 0; i <= g; i++) for (let j = 0; j <= g; j++) {
    const p = [x0 + (x1 - x0) * i / g, y0 + (y1 - y0) * j / g], dist = Math.hypot(p[0] - cen[0], p[1] - cen[1]);
    if (dist > maxMove) continue;
    const f = fit(p);
    if (f > 0) cands.push({ p, f, dist });
  }
  if (!cands.length) return { cen, fc, m: cen, fm: fc };
  const need = Math.min(T, d3.max(cands, (c) => c.f) * 0.9);
  const pick = cands.filter((c) => c.f >= need).sort((a, b) => a.dist - b.dist)[0];
  return inside ? { cen, fc, m: pick.p, fm: pick.f } : { cen: pick.p, fc: pick.f, m: pick.p, fm: pick.f };
}
// where and how big a label is at zoom k: [x, y, font] or null when it must wait for more zoom
const LABEL_PX = 9.2;  // on-screen label size, the same on a phone and a desktop
function labelPos(d, k, upx) {
  const need = LABEL_PX * upx / k;
  if (d.fc >= need) return [d.cen[0], d.cen[1], need];
  if (d.fm >= need) return [d.m[0], d.m[1], need];
  return null;
}
// place every label for zoom k; a label that would touch a bigger shape's label is hidden until you zoom in
function fitLabels(sel, k) {
  const svgEl = sel.node() && sel.node().ownerSVGElement;
  const upx = VW / ((svgEl && svgEl.clientWidth) || 715);  // map units per screen pixel at zoom 1
  const boxes = [];
  let hidden = 0;
  const items = sel.nodes().map((n) => ({ n, d: n.__data__, pos: labelPos(n.__data__, k, upx) }))
    .sort((a, b) => (b.d.area || 0) - (a.d.area || 0));
  for (const it of items) {
    let { pos } = it;
    if (pos) {
      const [x, y, f] = pos, w = emWidth(it.n.textContent) * f / 2 + f * 0.2, h = CAP_H * f / 2 + f * 0.2;
      if (boxes.some((b) => Math.abs(b[0] - x) < b[2] + w && Math.abs(b[1] - y) < b[3] + h)) pos = null;
      else boxes.push([x, y, w, h]);
    }
    if (!pos) hidden++;
    const f = pos ? pos[2] : LABEL_PX * upx / k;
    d3.select(it.n).attr('x', pos ? pos[0] : it.d.cen[0]).attr('y', pos ? pos[1] : it.d.cen[1])
      .attr('font-size', f).style('stroke-width', f * 3 / 13).attr('display', pos ? null : 'none');
  }
  return hidden;
}
function shape(row) {
  const key = `${row.chamber}-${row.district}`;
  if (GEO[key]) return GEO[key];
  const g = typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry;
  let d = '', best = null, bestRings = null, bestA = -1, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of g.coordinates) {
    const prj = poly.map((ring) => ring.map(([lo, la]) => proj(lo, la)));
    poly.forEach((ring, i) => {
      const pts = prj[i];
      d += 'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z';
      for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if (i === 0) {
        const a = Math.abs(pArea(pts));
        if (a > bestA) { bestA = a; best = pts; bestRings = prj; }
      }
    });
  }
  const c = pCent(best);
  const L = labelSpot(bestRings, String(row.district));
  return (GEO[key] = { key, d, c, ...L, area: bestA, box: [[x0, y0], [x1, y1]] });
}

// ---------- map ----------
const svg = d3.select('#mapsvg').attr('viewBox', `0 0 ${VW} ${VH}`);
const gRoot = svg.append('g');
const gShapes = gRoot.append('g');
const gPrec = gRoot.append('g').attr('class', 'oea-prec');
const gHover = gRoot.append('g').attr('class', 'oea-hover');
const gLabels = gRoot.append('g');
let K = 1;
const zoom = d3.zoom()
  .clickDistance(8) // a click with a little hand movement is still a click, not a drag
  .scaleExtent([1, 60])
  .translateExtent([[-50, -50], [VW + 50, VH + 50]])
  .filter((e) => (e.type === 'wheel' ? e.ctrlKey || e.metaKey : !e.button))
  .on('zoom', (e) => { gRoot.attr('transform', e.transform); K = e.transform.k; sizeLabels(); });
svg.call(zoom).on('dblclick.zoom', null);
function zoomBox([[x0, y0], [x1, y1]], pad = 0.85) {
  const s = Math.max(1, Math.min(60, pad / Math.max((x1 - x0) / VW, (y1 - y0) / VH)));
  const t = d3.zoomIdentity.translate(VW / 2 - s * (x0 + x1) / 2, VH / 2 - s * (y0 + y1) / 2).scale(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  (reduce ? svg : svg.transition().duration(550)).call(zoom.transform, t);
}
const PRESET = {
  state: [[LON0, LAT1], [LON1, LAT0]], pdx: [[-123.2, 45.72], [-122.3, 45.3]], salem: [[-123.3, 45.08], [-122.85, 44.78]],
  eugene: [[-123.35, 44.2], [-122.85, 43.95]], bend: [[-121.5, 44.16], [-121.15, 43.95]], medford: [[-123.05, 42.48], [-122.7, 42.2]],
};
document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
  const [[a, b2], [c, d]] = PRESET[b.dataset.zoom];
  zoomBox([proj(a, b2), proj(c, d)], b.dataset.zoom === 'state' ? 1 : 0.9);
}));
$('#mapclose')?.addEventListener('click', (e) => { e.stopPropagation(); deselect(); });
$('#zin')?.addEventListener('click', () => svg.transition().duration(250).call(zoom.scaleBy, 1.6));
$('#zout')?.addEventListener('click', () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.6));

function sizeLabels() {
  const hidden = fitLabels(gLabels.selectAll('text'), K);
  const hint = $('#zoomhint');
  if (hint) hint.hidden = !hidden;
}

const tip = $('#tip');
function showTip(ev, o) {
  const box = $('#mapbox').getBoundingClientRect();
  tip.replaceChildren();
  tip.append(el('div', 't', dname(o.chamber, o.district)));
  const line = (k, v, cls) => { const p = el('div'); p.append(el('span', 'muted', k + ' ')); p.append(el('b', cls || '', v)); tip.append(p); };
  if (o.holder) line(o.chamber === 'congress' ? 'Member' : 'Held by', `${o.holder} (${o.holder_party})`, pcls(o.holder_party));
  if (o.rating) line('Rating', o.rating);
  line('Baseline', o.baseline_label || '—');
  if (S.color === 'pres_2024') line('Pres ’24', o.pres_2024_label);
  if (S.color === 'gov_2022') line('Gov ’22', o.gov_2022_label);
  if (S.color === 'reg_gap' || S.color === 'shift') { line('Reg D−R', o.reg_gap_label); line('Shift', o.shift_label); }
  if (o.up2026 === 'Yes' && o.chamber !== 'county') { const ml = moneyLine(o.chamber, o.district); if (ml) line('Raised', ml); }
  tip.hidden = false;
  let x = ev.clientX - box.left + 14, y = ev.clientY - box.top + 14;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  if (x + w > box.width) x = Math.max(0, ev.clientX - box.left - w - 14);
  if (y + h > box.height) y = Math.max(0, ev.clientY - box.top - h - 14);
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}

// hover outline: drawn on its own layer above every shape, so it looks the same on every district or county
function hoverOn(d) { gHover.selectAll('path').data([d]).join('path').attr('d', (x) => x).attr('vector-effect', 'non-scaling-stroke'); }
function hoverOff() { gHover.selectAll('path').remove(); }
// click empty map space (or the selected shape again, or press Escape) to close the selection
svg.on('click.desel', (ev) => { if (!ev.target.closest('path.dist, .oea-prec path')) deselect(); });
svg.on('keydown.desel', (ev) => { if (ev.key === 'Escape') deselect(); });
function drawMap() {
  hoverOff();
  const geo = rows('geo'), sum = rows('district_summary');
  const card = $('#mapbox');
  const failed = ['geo', 'district_summary'].some((id) => dash.data(id).status === 'error');
  card.querySelector('.oea-fail')?.remove();
  if (!geo || !sum) {
    gShapes.selectAll('*').remove(); gLabels.selectAll('*').remove();
    if (failed) card.append(el('div', 'oea-fail', 'Failed to load'));
    return;
  }
  const byKey = new Map(sum.map((o) => [o.key, o]));
  const feats = geo.filter((r) => r.chamber === S.chamber).map((r) => ({ ...shape(r), o: byKey.get(`${r.chamber}-${r.district}`) || { chamber: r.chamber, district: String(r.district) } }));
  const cf = COLOR[S.color].f;
  gShapes.selectAll('path.dist').data(feats, (d) => d.key).join('path')
    .attr('class', (d) => 'dist' + (d.key === S.sel ? ' sel' : ''))
    .attr('d', (d) => d.d)
    .attr('fill', (d) => cf(d.o))
    .attr('fill-rule', 'evenodd')
    .attr('vector-effect', 'non-scaling-stroke')
    .attr('tabindex', 0)
    .attr('aria-label', (d) => dname(d.o.chamber, d.o.district))
    .on('mouseenter', (ev, d) => hoverOn(d.d))
    .on('mousemove', (ev, d) => showTip(ev, d.o))
    .on('mouseleave', () => { tip.hidden = true; hoverOff(); })
    .on('click', (ev, d) => (d.key === S.sel ? deselect() : select(d.key)))
    .on('keydown', (ev, d) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(d.key); } });
  gShapes.selectAll('path.sel').raise();
  gLabels.selectAll('text').data(S.chamber === 'county' ? feats : feats, (d) => d.key).join('text')
    .attr('x', (d) => d.c[0]).attr('y', (d) => d.c[1])
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
    .text((d) => (S.chamber === 'county' ? d.o.district : d.o.district));
  sizeLabels();
  drawPrecincts();
  drawLegend();
}

// ---------- precincts (inside a selected county; test: Marion) ----------
const PREC_RACE = () => (S.color === 'gov_2022' ? [2022, 'Governor'] : [2024, 'President']);
const PSHAPE = {};
function precShape(r) {
  const k = `${r.county}|${r.precinct}`;
  if (PSHAPE[k]) return PSHAPE[k];
  const g = JSON.parse(r.geometry);
  let d = '';
  for (const poly of g.coordinates) for (const ring of poly) d += 'M' + ring.map(([lo, la]) => proj(lo, la).map((v) => v.toFixed(2)).join(',')).join('L') + 'Z';
  return (PSHAPE[k] = { k, d, county: r.county, precinct: r.precinct });
}
function selCounty() {
  return S.chamber === 'county' && S.sel && S.sel.startsWith('county-') ? S.sel.slice(7) : null;
}
function precResults(county) {
  const [yr, race] = PREC_RACE();
  return new Map((rows('precinct_results') || []).filter((x) => x.county === county && x.year === yr && x.race === race).map((x) => [x.precinct, x]));
}
function drawPrecincts() {
  const county = selCounty();
  const shapes = county ? (rows('precincts') || []).filter((r) => r.county === county) : [];
  const res = county ? precResults(county) : new Map();
  const feats = shapes.map((r) => ({ ...precShape(r), r: res.get(r.precinct) }));
  gShapes.selectAll('path.dist').classed('dim', (d) => !!(feats.length && d.key !== S.sel)).classed('precon', (d) => !!(feats.length && d.key === S.sel));
  // outline that follows the precinct edges exactly: a thick stroke under the precincts, whose outer half shows
  const halo = gPrec.selectAll('g.halo').data([0]).join('g').attr('class', 'halo');
  const fills = gPrec.selectAll('g.fills').data([0]).join('g').attr('class', 'fills');
  halo.selectAll('path').data(feats, (d) => d.k).join('path').attr('d', (d) => d.d).attr('vector-effect', 'non-scaling-stroke');
  fills.selectAll('path').data(feats, (d) => d.k).join('path')
    .attr('d', (d) => d.d)
    .attr('fill', (d) => (d.r && d.r.total ? swing(d.r.margin, 40) : NEUTRAL))
    .attr('class', (d) => (d.precinct === S.prec ? 'on' : null))
    .attr('fill-rule', 'evenodd')
    .attr('vector-effect', 'non-scaling-stroke')
    .on('mouseenter', (ev, d) => hoverOn(d.d))
    .on('mousemove', (ev, d) => precTip(ev, d))
    .on('mouseleave', () => { tip.hidden = true; hoverOff(); })
    .on('click', (ev, d) => { ev.stopPropagation(); S.prec = d.precinct; fills.selectAll('path').classed('on', (x) => x.precinct === S.prec); fills.selectAll('path.on').raise(); drawPanel(); });
  fills.selectAll('path.on').raise();
}
function precTip(ev, d) {
  const box = $('#mapbox').getBoundingClientRect();
  const [yr, race] = PREC_RACE();
  tip.replaceChildren(el('div', 't', `Precinct ${d.precinct} · ${d.county} County`));
  const r = d.r;
  if (!r || !r.total) tip.append(el('div', 'muted', `No ${yr} ${race} votes recorded for this precinct`));
  else {
    const pc = (v) => `${(v / r.total * 100).toFixed(1)}%`;
    const p = el('div'); p.append(el('span', 'muted', `${race} ’${String(yr).slice(2)} `), el('b', r.margin > 0 ? 'pd' : 'pr', r.margin > 0 ? `D+${r.margin.toFixed(1)}` : `R+${(-r.margin).toFixed(1)}`)); tip.append(p);
    tip.append(el('div', '', `D ${pc(r.D)} · R ${pc(r.R)} · other ${pc(r.other)}`), el('div', 'muted', `${fmt(r.total)} votes`));
  }
  tip.hidden = false;
  let x = ev.clientX - box.left + 14, y = ev.clientY - box.top + 14;
  if (x + tip.offsetWidth > box.width) x = Math.max(0, ev.clientX - box.left - tip.offsetWidth - 14);
  if (y + tip.offsetHeight > box.height) y = Math.max(0, ev.clientY - box.top - tip.offsetHeight - 14);
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function precinctBlock(county) {
  const shapes = (rows('precincts') || []).filter((r) => r.county === county);
  if (!shapes.length) return null;
  const [yr, race] = PREC_RACE();
  const res = precResults(county);
  const box = el('section', 'oea-prec-panel');
  const h = el('div', 'mh');
  h.append(el('p', 'oea-sub', `Precincts, ${yr} ${race}`), el('span', 'oea-note', `${shapes.length} precincts`));
  box.append(h);
  const pnote = (rows('precinct_notes') || []).find((n) => n.county === county && n.year === yr && n.race === race);
  if (pnote) { box.append(el('p', 'oea-note', pnote.note)); if (pnote.hide) return box; }
  const list = [...res.values()].filter((r) => r.total);
  const dW = list.filter((r) => r.D > r.R).length, rW = list.filter((r) => r.R > r.D).length;
  const sum = el('p', 'oea-note');
  sum.append(el('b', 'pd', `${dW} D`), document.createTextNode(' · '), el('b', 'pr', `${rW} R`), document.createTextNode(` precincts won${list.length < shapes.length ? ` · ${shapes.length - list.length} with no votes` : ''}. ${race === 'Governor' ? 'Showing the 2022 Governor race; set the map color to 2024 President to see that race.' : 'Showing the 2024 President race; set the map color to 2022 Governor to see that race.'}`));
  box.append(sum);
  if (S.prec && res.has(S.prec)) {
    const r = res.get(S.prec);
    const d = el('dl', 'oea-kv');
    const kv = (k, v, c) => { d.append(el('dt', '', k)); const dd = el('dd'); dd.append(mark(el('span', c || '', v), 'precinct_results', null, { id: r.id })); d.append(dd); };
    kv('Precinct', S.prec);
    kv('Margin', r.total ? (r.margin > 0 ? `D+${r.margin.toFixed(1)}` : `R+${(-r.margin).toFixed(1)}`) : '—', r.margin > 0 ? 'pd' : 'pr');
    kv('Votes', `D ${fmt(r.D)} · R ${fmt(r.R)} · other ${fmt(r.other)}`);
    box.append(d);
  }
  const t = el('table', 'oea-prec-table');
  const hr = el('tr'); ['Precinct', 'D', 'R', 'Other', 'Margin'].forEach((x, i) => hr.append(el('th', i ? 'n' : '', x)));
  const th = el('thead'); th.append(hr); t.append(th);
  const tb = el('tbody');
  [...res.values()].sort((a, b) => Number(a.precinct) - Number(b.precinct)).forEach((r) => {
    const tr = el('tr'); if (r.precinct === S.prec) tr.className = 'on';
    tr.append(el('td', '', r.precinct), el('td', 'n', fmt(r.D)), el('td', 'n', fmt(r.R)), el('td', 'n', fmt(r.other)),
      el('td', 'n ' + (r.margin > 0 ? 'pd' : r.margin < 0 ? 'pr' : ''), r.total ? (r.margin > 0 ? `D+${r.margin.toFixed(1)}` : `R+${(-r.margin).toFixed(1)}`) : '—'));
    tr.addEventListener('click', () => { S.prec = r.precinct; drawPrecincts(); drawPanel(); });
    tb.append(tr);
  });
  t.append(tb);
  const w = el('div', 'oea-prec-scroll'); w.append(t); box.append(w);
  const missing = shapes.filter((x) => !res.has(x.precinct)).map((x) => x.precinct);
  const extra = [...res.keys()].filter((k) => !shapes.some((x) => x.precinct === k));
  if (missing.length || extra.length) box.append(el('p', 'oea-note', `${extra.length ? `Precinct ${extra.join(', ')} has results but no boundary on the county map. ` : ''}${missing.length ? `Precinct ${missing.join(', ')} is on the map with no ${yr} results.` : ''}`));
  box.append(el('p', 'oea-note', 'Precinct results: county canvass returns (OpenElections), which add up to the certified county totals. Boundaries: county GIS, 2022 precincts.'));
  return box;
}

function drawLegend() {
  const L = $('#legend');
  L.replaceChildren();
  const c = COLOR[S.color];
  if (c.legend === 'ramp') {
    const stops = d3.range(0, 1.0001, 0.125).map((t) => diverge((t * 2 - 1) * c.max, c.max));
    const r = el('span', 'oea-ramp');
    r.style.background = `linear-gradient(90deg, ${stops.join(',')})`;
    L.append(el('span', '', `${S.color === 'shift' ? 'Toward R' : 'R'} +${c.max}`), r, el('span', '', `${S.color === 'shift' ? 'Toward D' : 'D'} +${c.max}`));
    if (S.color !== 'shift') { const s = el('span'); const i = el('i'); i.style.background = CS(); s.append(i, `Swing: within ${SWING_PTS} pts`); L.append(s); }
    L.append(el('span', 'muted', c.label));
  } else if (c.legend === 'rating') {
    for (const r of RATING) { const s = el('span'); const i = el('i'); i.style.background = ratingColor(r); s.append(i, r); L.append(s); }
  } else {
    for (const [p, n] of [['D', 'Democrat'], ['R', 'Republican']]) { const s = el('span'); const i = el('i'); i.style.background = p === 'D' ? CD() : CR(); s.append(i, n); L.append(s); }
  }
}

// ---------- district file ----------
function select(key, opts = {}) {
  if (key !== S.sel) S.prec = null;
  S.sel = key;
  gShapes.selectAll('path.dist').classed('sel', (d) => d.key === key);
  gShapes.selectAll('path.sel').raise();
  drawPrecincts();
  drawPanel();
  const hasPrec = !!selCounty();  // counties zoom in; their precincts draw as soon as the precinct file has loaded
  if ((opts.zoom || hasPrec) && GEO[key]) { zoomBox(GEO[key].box, hasPrec ? 0.8 : 0.6); S.autoZoom = true; }
  if (opts.scroll) $('#panel').scrollIntoView({ block: 'nearest' });
}

function deselect() {
  if (!S.sel) return;
  S.sel = null; S.prec = null; tip.hidden = true;
  gShapes.selectAll('path.dist').classed('sel', false);
  drawPrecincts();
  drawPanel();
  if (S.autoZoom) { S.autoZoom = false; const [[a, b], [c, d]] = PRESET.state; zoomBox([proj(a, b), proj(c, d)], 1); }
}

// November ballot: one column per candidate (up to three), from the general-election candidate list
function vsBlock(ch, dist) {
  const box = el('div', 'oea-vs');
  const cands = (rows('ballot_2026') || []).filter((x) => x.chamber === ch && String(x.district) === String(dist))
    .sort((a, b) => ({ D: 0, R: 1 }[a.party] ?? 2) - ({ D: 0, R: 1 }[b.party] ?? 2));
  if (!cands.length) { box.append(el('div', 'muted', 'No candidates listed')); return box; }
  for (const c of cands.slice(0, 3)) {
    const col = el('div', (c.party === 'D' || c.party === 'R' ? c.party : 'o').toLowerCase());
    col.append(mark(el('div', '', `${c.candidate}${c.incumbent ? ' (inc.)' : ''}`), 'ballot_2026', 'candidate', { chamber: ch, district: dist, candidate: c.candidate }));
    col.append(mark(el('small', '', c.unopposed ? `${c.nominations} · unopposed` : c.nominations), 'ballot_2026', 'nominations', { chamber: ch, district: dist, candidate: c.candidate }));
    box.append(col);
  }
  if (cands.length > 3) box.append(el('small', 'muted', `+${cands.length - 3} more on the ballot`));
  return box;
}

// ---------- money (2025-26 cycle) ----------
const MONEY_START = 'Jan 1, 2025';
const money$ = (v) => {
  if (v == null) return '—';
  const a = Math.abs(v), sg = v < 0 ? '−' : '';
  if (a < 1000) return `${sg}$${Math.round(a)}`;
  if (a < 1e6) return `${sg}$${(a / 1e3).toFixed(a < 1e4 ? 1 : 0)}K`;
  return `${sg}$${(a / 1e6).toFixed(a < 1e7 ? 2 : 1)}M`;
};
const shortDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
const partyOrder = (p) => ({ D: 0, R: 1 }[p] ?? 2);
function moneyRows(ch, dist) {
  return (rows('finance') || []).filter((x) => x.chamber === ch && String(x.district) === String(dist))
    .sort((a, b) => partyOrder(a.party) - partyOrder(b.party) || (b.raised || 0) - (a.raised || 0));
}
// one line for hovers and race cards: "Raised: D $412K · R $388K"
function moneyLine(ch, dist) {
  const m = moneyRows(ch, dist);
  if (!m.some((x) => x.status === 'ok' && (x.party === 'D' || x.party === 'R'))) return null;
  const part = (p) => {
    const xs = m.filter((x) => x.party === p);
    if (!xs.length) return null;
    if (xs.every((x) => x.status === 'pending')) return `${p} pending`;
    return `${p} ${money$(xs.reduce((t, x) => t + (x.raised || 0), 0))}`;
  };
  const others = [...new Set(m.filter((x) => x.party !== 'D' && x.party !== 'R' && x.status === 'ok').map((x) => x.party))];
  const parts = [part('D'), part('R'), ...others.map(part)].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
function moneyBlock(ch, dist, registered) {
  const m = moneyRows(ch, dist);
  const box = el('section', 'oea-money');
  if (!m.length) return box;
  const head = el('div', 'mh');
  head.append(el('p', 'oea-sub', 'Money, 2025–26 cycle'));
  head.append(el('span', 'oea-note', `Since ${MONEY_START}`));
  box.append(head);
  const ok = m.filter((x) => x.status === 'ok');
  const max = Math.max(1, ...ok.map((x) => Math.max(x.raised || 0, x.spent || 0)));
  const fed = m[0].source === 'FEC';
  for (const x of m) {
    const row = el('div', 'mc ' + (x.party === 'D' || x.party === 'R' ? x.party.toLowerCase() : 'o'));
    const nm = el('div', 'mn');
    nm.append(el('b', '', x.candidate), el('span', 'muted', ` (${x.party})`));
    row.append(nm);
    if (x.status !== 'ok') {
      row.append(el('div', 'oea-note', x.status === 'pending' ? 'Not yet pulled; coming in the next update'
        : fed ? 'No money reported to the FEC' : 'No campaign committee found on ORESTAR'));
      box.append(row);
      continue;
    }
    const bar = (lbl, v, cls, f) => {
      const r = el('div', 'mb');
      r.append(el('span', 'ml', lbl));
      const t = el('span', 'mt'); const i = el('i', cls); i.style.width = `${Math.max(0, (v || 0) / max * 100)}%`; t.append(i);
      r.append(t, mark(el('span', 'mv', money$(v)), 'finance', f, { chamber: ch, district: dist, candidate: x.candidate }));
      return r;
    };
    row.append(bar('Raised', x.raised, 'raised', 'raised'), bar('Spent', x.spent, 'spent', 'spent'));
    if (x.cash_on_hand != null) row.append(mark(el('div', 'oea-note', `Cash on hand${x.coh_net ? ', net of debts' : ''} ${money$(x.cash_on_hand)}`), 'finance', 'cash_on_hand', { chamber: ch, district: dist, candidate: x.candidate }));
    box.append(row);
  }
  // outside groups (independent expenditures), kept apart from the campaigns' own money
  const ie = m.filter((x) => (x.ie_for || 0) + (x.ie_against || 0) > 0);
  const ieKnown = m.some((x) => x.ie_for != null);
  if (ie.length) {
    const sec = el('div', 'mie');
    sec.append(el('p', 'oea-sub', 'Outside groups'));
    for (const x of ie) {
      const p = el('div', 'oea-note');
      const bits = [];
      if (x.ie_for) bits.push(`${money$(x.ie_for)} for`);
      if (x.ie_against) bits.push(`${money$(x.ie_against)} against`);
      p.append(el('b', pcls(x.party), x.candidate.split(' ').slice(-1)[0]), document.createTextNode(` · ${bits.join(', ')}`));
      sec.append(p);
    }
    box.append(sec);
  } else if (ieKnown) {
    box.append(el('p', 'oea-note', 'Outside groups: no independent spending reported in this race.'));
  } else {
    box.append(el('p', 'oea-note', 'Outside groups: coming in the next update.'));
  }
  const total = ok.reduce((t, x) => t + (x.raised || 0), 0);
  if (registered && total && !m.some((x) => x.status === 'pending')) box.append(el('p', 'oea-note', `Candidates have raised $${(total / registered).toFixed(2)} per registered voter.`));
  const thru = ok.map((x) => x.pulled_at ? x.pulled_at.slice(0, 10) : x.through).filter(Boolean).sort().pop();
  const foot = el('p', 'oea-note mf');
  foot.append(document.createTextNode(`${thru ? `${fed ? 'Reports through' : 'Last updated'} ${shortDate(thru)} · ` : ''}Source: `));
  const a = el('a', '', fed ? 'FEC' : 'Oregon SOS (ORESTAR)');
  a.href = fed ? (ok[0]?.url || 'https://www.fec.gov/') : 'https://secure.sos.state.or.us/orestar/gotoPublicTransactionSearch.do';
  a.target = '_blank'; a.rel = 'noopener';
  foot.append(a);
  if (fed) foot.append(document.createTextNode('.'));
  else foot.append(document.createTextNode(' account summaries. Totals include in-kind gifts.'));
  box.append(foot);
  return box;
}

function regBlock(o, frag) {
  frag.append(el('p', 'oea-sub', `Registered voters, ${monthName(o.reg_month)}`));
  const stack = mark(el('div', 'oea-stack'), 'district_summary');
  [['reg_D', CD()], ['reg_R', CR()], ['reg_NAV', NEUTRAL], ['reg_other', 'var(--color-fg-muted)']].forEach(([f, c]) => {
    const s = el('span'); s.style.width = (o[f] || 0) + '%'; s.style.background = c; stack.append(s);
  });
  frag.append(stack);
  const key = el('div', 'oea-stack-key');
  const item = (lbl, f, txt) => { const s = el('span'); s.append(lbl + ' '); const b = mark(el('b', '', txt), 'district_summary', f, { key: o.key }); s.append(b); key.append(s); };
  item('Dem', 'reg_D', pct(o.reg_D));
  item('Rep', 'reg_R', pct(o.reg_R));
  item('Non-affiliated', 'reg_NAV', pct(o.reg_NAV));
  item('Other', 'reg_other', pct(o.reg_other));
  item('Total', 'registered', fmt(o.registered || 0));
  frag.append(key);
  const dl = el('dl', 'oea-kv');
  const kv = (k, f, v) => { dl.append(el('dt', '', k)); const dd = el('dd'); dd.append(mark(el('span', '', v || '—'), 'district_summary', f, { key: o.key })); dl.append(dd); };
  kv('D−R gap', 'reg_gap_label', o.reg_gap_label);
  kv('Shift since Sep 2022', 'shift_label', o.shift_label);
  frag.append(dl);
  frag.append(trendChart(o.chamber, o.district));
}

function trendChart(ch, dist) {
  const wrap = mark(el('div', 'oea-chart'), 'reg_shares');
  wrap.style.minHeight = '8.5rem';
  const data = (rows('reg_shares') || []).filter((r) => r.chamber === ch && r.district === String(dist)).sort((a, b) => d3.ascending(a.month, b.month));
  if (!data.length) return wrap;
  requestAnimationFrame(() => drawTrend(wrap, data, 136));
  return wrap;
}

function drawTrend(wrap, data, H) {
  const W = Math.max(240, wrap.clientWidth || 300);
  const series = [['D_pct', 'Dem', CD()], ['R_pct', 'Rep', CR()], ['NAV_pct', 'Non-affil.', 'var(--color-fg-muted)']];
  const dt = (m) => new Date(`${m}-15T00:00:00Z`);
  const x0 = d3.scaleUtc([dt(data[0].month), dt(data[data.length - 1].month)], [34, W - 100]);
  const x = (m) => x0(dt(m));
  const all = data.flatMap((d) => series.map(([f]) => d[f]));
  const y = d3.scaleLinear([Math.floor(d3.min(all) / 5) * 5, Math.ceil(d3.max(all) / 5) * 5], [H - 22, 8]);
  const s = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  s.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', 34).attr('x2', W - 100).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
  s.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', 28).attr('y', y).attr('text-anchor', 'end').attr('dominant-baseline', 'central').text((v) => v + '%');
  const years = [...new Set(data.map((d) => d.month.slice(0, 4)))];
  s.append('g').selectAll('text').data(years).join('text').attr('x', (yr) => x(data.find((d) => d.month.startsWith(yr)).month)).attr('y', H - 6).attr('text-anchor', 'middle').text((yr) => yr);
  for (const [f, name, c] of series) {
    s.append('path').attr('d', d3.line((d) => x(d.month), (d) => y(d[f]))(data)).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    const lst = data[data.length - 1];
    s.append('circle').attr('cx', x(lst.month)).attr('cy', y(lst[f])).attr('r', 3).attr('fill', c);
    s.append('text').attr('x', x(lst.month) + 6).attr('y', y(lst[f])).attr('dominant-baseline', 'central').text(`${name} ${lst[f].toFixed(1)}%`);
  }
  // keep end labels apart
  const ends = s.selectAll('text').filter(function () { return +this.getAttribute('x') > W - 108; }).nodes().sort((a, b) => +a.getAttribute('y') - +b.getAttribute('y'));
  for (let i = 1; i < ends.length; i++) { const p = +ends[i - 1].getAttribute('y'), q = +ends[i].getAttribute('y'); if (q - p < 12) ends[i].setAttribute('y', p + 12); }
  wrap.replaceChildren(s.node());
}

function resultsTable(ch, dist) {
  const rr = (rows('race_results') || []).filter((r) => r.chamber === ch && r.district === String(dist));
  const frag = document.createDocumentFragment();
  if (!rr.length) return frag;
  const years = [...new Set(rr.map((r) => r.year))].sort((a, b) => b - a);
  frag.append(el('p', 'oea-sub', `${ch === 'congress' ? 'U.S. House' : CH[ch].label} general election`));
  const t = mark(el('table'), 'race_results');
  t.setAttribute('data-row-key', 'id');
  const th = el('thead'); const tr = el('tr');
  [['year', 'Year'], ['candidate', 'Candidate'], ['party', 'Party'], ['votes', 'Votes', 'n'], ['pct', 'Share', 'n']].forEach(([f, l, c]) => { const h = el('th', c || '', l); h.setAttribute('data-field', f); tr.append(h); });
  th.append(tr); t.append(th);
  const tb = el('tbody');
  for (const y of years) {
    rr.filter((r) => r.year === y).sort((a, b) => b.votes - a.votes).forEach((r, i) => {
      const row = el('tr'); row.setAttribute('data-key', r.id);
      row.append(el('td', 'muted', i === 0 ? String(y) : ''), el('td', '', r.candidate), el('td', pcls(r.party), r.party), el('td', 'n', fmt(r.votes)), el('td', 'n', pct(r.pct)));
      tb.append(row);
    });
  }
  t.append(tb);
  const w = el('div', 'oea-tw'); w.append(t); frag.append(w);
  return frag;
}

function statewideTable(ch, dist) {
  const rr = (rows('race_margins') || []).filter((r) => r.chamber === ch && r.district === String(dist)).sort((a, b) => b.year - a.year || d3.ascending(a.race, b.race));
  const frag = document.createDocumentFragment();
  if (!rr.length) return frag;
  frag.append(el('p', 'oea-sub', 'Statewide races in this ' + (ch === 'county' ? 'county' : 'district')));
  const t = mark(el('table'), 'race_margins');
  t.setAttribute('data-row-key', 'id');
  const tr = el('tr');
  [['race', 'Race'], ['year', 'Year'], ['D_pct', 'Dem', 'n'], ['R_pct', 'Rep', 'n'], ['margin_label', 'Margin', 'n']].forEach(([f, l, c]) => { const h = el('th', c || '', l); h.setAttribute('data-field', f); tr.append(h); });
  const th = el('thead'); th.append(tr); t.append(th);
  const tb = el('tbody');
  for (const r of rr) {
    const row = el('tr'); row.setAttribute('data-key', r.id);
    row.append(el('td', '', r.race === 'Commissioner of the Bureau of Labor and Industries' ? 'Labor Commissioner*' : r.race), el('td', 'muted', String(r.year)), el('td', 'n', pct(r.D_pct)), el('td', 'n', pct(r.R_pct)), el('td', 'n ' + (r.margin > 0 ? 'pd' : r.margin < 0 ? 'pr' : ''), r.margin_label));
    tb.append(row);
  }
  t.append(tb);
  const w = el('div', 'oea-tw'); w.append(t); frag.append(w);
  if (rr.some((r) => r.race.startsWith('Commissioner'))) frag.append(el('p', 'oea-note', '*Nonpartisan race: Stephenson counted as D, Helt as R. Not part of the baseline.'));
  return frag;
}

function drawPanel() {
  const P = $('#panel');
  P.replaceChildren();
  const sum = rows('district_summary');
  if (!sum) {
    P.append(el('div', 'dash-skeleton', '—'));
    if (dash.data('district_summary').status === 'error') { P.replaceChildren(el('div', 'oea-fail', 'Failed to load')); }
    return;
  }
  const o = S.sel && sum.find((r) => r.key === S.sel && r.chamber === S.chamber);
  const mc = $('#mapclose');
  if (mc) { mc.hidden = !o; if (o) $('#mapclose-name').textContent = o.chamber === 'county' ? `${o.district} County` : dshort(o.chamber, o.district); }
  if (!o) return drawDefaultPanel(P);
  const head = el('div', 'oea-panel-head');
  head.append(el('h3', 'oea-panel-name', dname(o.chamber, o.district)));
  const xb = el('button', 'oea-btn oea-panel-close', '✕ Close'); xb.type = 'button'; xb.setAttribute('aria-label', 'Close and go back to the full map');
  xb.addEventListener('click', () => deselect());
  head.append(xb);
  const chips = el('div', 'oea-chips');
  if (o.rating) {
    const c = mark(el('span', 'oea-chip ' + (o.rating === 'Toss-up' ? 't' : o.rating.endsWith('D') ? 'd' : 'r'), o.rating), 'district_summary', 'rating', { key: o.key });
    chips.append(c);
  }
  if (o.up2026 === 'Yes') chips.append(mark(el('span', 'oea-chip', 'On 2026 ballot'), 'district_summary', 'up2026', { key: o.key }));
  if (o.watch) chips.append(mark(el('span', 'oea-chip w', o.watch), 'district_summary', 'watch', { key: o.key }));
  head.append(chips);
  P.append(head);

  const dl = el('dl', 'oea-kv');
  if (o.chamber !== 'county') {
    dl.append(el('dt', '', o.chamber === 'congress' ? 'Member' : 'Held by'));
    const dd = el('dd');
    if (o.holder) {
      dd.append(mark(el('span', pcls(o.holder_party), `${CH[o.chamber].rep} ${o.holder} (${o.holder_party})`), 'district_summary', 'holder', { key: o.key }));
      if (o.holder_since && o.chamber === 'congress') dd.append(el('span', 'muted', `, in office since ${o.holder_since}`));
    } else dd.append(el('span', 'muted', 'Vacant or not listed'));
    dl.append(dd);
    if (o.party_switch) { dl.append(el('dt', '', 'Note')); const d2 = el('dd'); d2.append(mark(el('span', '', o.party_switch), 'district_summary', 'party_switch', { key: o.key })); dl.append(d2); }
  }
  const kv = (k, f, v, cls) => { dl.append(el('dt', '', k)); const dd = el('dd'); dd.append(mark(el('span', cls || '', v || '—'), 'district_summary', f, { key: o.key })); dl.append(dd); };
  kv('Baseline', 'baseline_label', o.baseline_label, o.baseline > 0 ? 'pd' : o.baseline < 0 ? 'pr' : '');
  if (o.chamber !== 'county') kv('Last result', 'last_label', o.last_label);
  P.append(dl);

  if (o.chamber !== 'county' && o.up2026 === 'Yes') {
    P.append(el('p', 'oea-sub', 'November 3, 2026 general'));
    P.append(vsBlock(o.chamber, o.district));
    P.append(moneyBlock(o.chamber, o.district, o.registered));
  } else if (o.chamber === 'senate') {
    P.append(el('p', 'oea-note', 'This seat is next on the ballot in 2028.'));
  }
  const reg = document.createDocumentFragment();
  regBlock(o, reg);
  P.append(reg);
  if (o.chamber !== 'county') P.append(resultsTable(o.chamber, o.district));
  P.append(statewideTable(o.chamber, o.district));
  if (o.chamber === 'county') { const pb = precinctBlock(o.district); if (pb) P.append(pb); }
}

function drawDefaultPanel(P) {
  const ov = rows('chamber_overview');
  if (S.chamber === 'county') {
    P.append(el('h3', 'oea-panel-name', 'Oregon'));
    P.append(el('p', 'oea-sub', 'Statewide race on the 2026 ballot'));
    for (const [ch, lbl] of [['governor', 'Governor']]) {
      P.append(el('p', 'oea-note', lbl));
      P.append(vsBlock(ch, 'OR'));
      P.append(moneyBlock(ch, 'OR', (rows('state_registration') || [])[0]?.total));
    }
    P.append(el('p', 'oea-note', 'Click a county for its registration and results.'));
    return;
  }
  const r = ov && ov.find((x) => x.chamber === S.chamber);
  P.append(el('h3', 'oea-panel-name', CH[S.chamber].label));
  if (r) {
    const dl = el('dl', 'oea-kv');
    const kv = (k, f, v) => { dl.append(el('dt', '', k)); const dd = el('dd'); dd.append(mark(el('span', '', String(v)), 'chamber_overview', f, { chamber: S.chamber })); dl.append(dd); };
    kv('Seats', 'seats', r.seats);
    kv('Held by Democrats', 'held_D', r.held_D);
    kv('Held by Republicans', 'held_R', r.held_R);
    kv('On the 2026 ballot', 'up_2026', r.up_2026);
    if (!window.OEA_PUBLIC) {
    kv('Toss-up or Lean', 'competitive', r.competitive);
    kv('…of those on the 2026 ballot', 'competitive_up', r.competitive_up);
    kv('Trending competitive', 'watch', r.watch);
    }
    P.append(dl);
  }
  if (S.chamber === 'congress') {
    P.append(el('p', 'oea-sub', 'U.S. Senate race on the 2026 ballot'));
    P.append(vsBlock('ussenate', 'OR'));
    P.append(moneyBlock('ussenate', 'OR', (rows('state_registration') || [])[0]?.total));
  }
  P.append(el('p', 'oea-note', window.OEA_PUBLIC ? 'Click a district on the map to open its file.' : 'Click a district on the map, or a row in Races to watch, to open its file.'));
}

// ---------- races table ----------
function sortRows(list) {
  const { key, dir } = S.sort;
  return [...list].sort((a, b) => {
    let va = a[key], vb = b[key];
    if (key === 'district') { va = isNaN(+a.district) ? a.district : +a.district; vb = isNaN(+b.district) ? b.district : +b.district; }
    if (va == null || va === '') return 1;
    if (vb == null || vb === '') return -1;
    if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb);
    return dir * String(va).localeCompare(String(vb));
  });
}
function drawRaces() {
  const sum = rows('district_summary');
  const tb = $('#races-table tbody');
  tb.replaceChildren();
  $('#races-title').textContent = `${CH[S.chamber].label} seats ranked by competitiveness`;
  if (!sum) return;
  const q = S.q.trim().toLowerCase();
  const list = sortRows(sum.filter((o) => o.chamber === S.chamber)).filter((o) => !q || [o.district, o.holder, o.rating, o.watch, o.nominee_D, o.nominee_R, dshort(o.chamber, o.district)].join(' ').toLowerCase().includes(q));
  for (const o of list) {
    const tr = el('tr', 'click'); tr.setAttribute('data-key', o.key);
    tr.append(
      el('td', '', o.district),
      el('td', pcls(o.holder_party), o.holder ? `${o.holder} (${o.holder_party})` : ''),
      el('td', 'muted', o.up2026),
      el('td', '', o.rating),
      el('td', 'n ' + (o.baseline > 0 ? 'pd' : o.baseline < 0 ? 'pr' : ''), o.baseline_label),
      el('td', 'n', o.pres_2024_label),
      el('td', '', o.last_label),
      el('td', 'n', o.reg_gap_label),
      el('td', '', o.shift_label),
      el('td', '', o.watch),
      el('td', '', o.nominee_D),
      el('td', '', o.nominee_R),
    );
    tb.append(tr);
  }
  document.querySelectorAll('#races-table th button').forEach((b) => {
    const th = b.closest('th');
    th.setAttribute('aria-sort', b.dataset.sort === S.sort.key ? (S.sort.dir > 0 ? 'ascending' : 'descending') : 'none');
  });
}
$('#races-table thead')?.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sort]');
  if (!b) return;
  S.sort = { key: b.dataset.sort, dir: S.sort.key === b.dataset.sort ? -S.sort.dir : 1 };
  drawRaces();
});
$('#races-table tbody')?.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-key]');
  if (!tr) return;
  showTab('map');
  requestAnimationFrame(() => select(tr.dataset.key, { zoom: true, scroll: true }));
});
$('#races-q')?.addEventListener('input', (e) => { S.q = e.target.value; drawRaces(); });

// ---------- registration tab ----------
function drawRegistration() {
  const rs = rows('reg_shares'), sum = rows('district_summary');
  const tiles = $('#reg-tiles');
  tiles.replaceChildren();
  const sr = rows('state_registration');
  if (sr && sr.length) {
    const s = sr[0];
    const tile = (lbl, f, val, cf, delta, unit) => {
      const t = el('div', 'oea-tile');
      t.append(mark(el('div', 'v', val), 'state_registration', f, { id: 'OR' }), el('div', 'l', lbl));
      const c = mark(el('div', 'c muted', `${delta > 0 ? '+' : ''}${unit === 'n' ? fmt(delta) : delta.toFixed(1) + ' pts'} since Sep 2022`), 'state_registration', cf, { id: 'OR' });
      t.append(c);
      tiles.append(t);
    };
    tile(`Registered voters, ${monthName(s.month)}`, 'total', fmt(s.total), 'total_chg', s.total_chg, 'n');
    tile('Democrats', 'D_pct', pct(s.D_pct), 'D_chg', s.D_chg);
    tile('Republicans', 'R_pct', pct(s.R_pct), 'R_chg', s.R_chg);
    tile('Non-affiliated', 'NAV_pct', pct(s.NAV_pct), 'NAV_chg', s.NAV_chg);
    tile('D minus R gap', 'gap', `${s.gap.toFixed(1)} pts`, 'gap_chg', s.gap_chg);
  }
  if (rs) {
    const st = rs.filter((r) => r.chamber === 'state').sort((a, b) => d3.ascending(a.month, b.month));
    const w = $('#reg-chart');
    if (w.offsetParent !== null && st.length) drawTrend(w, st, 220);
  }
  const shiftT = $('#shift-table tbody');
  shiftT.replaceChildren();
  const ct = $('#county-title'); if (ct && regMonth()) ct.textContent = `Registration by county, ${regMonth()}`;
  const cT = $('#county-table tbody');
  cT.replaceChildren();
  if (!sum) return;
  const ch = S.chamber;
  const list = sum.filter((o) => o.chamber === ch && o.shift != null).sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift)).slice(0, 12);
  for (const o of list) {
    const tr = el('tr'); tr.setAttribute('data-key', o.key);
    tr.append(el('td', '', o.district), el('td', 'n', o.reg_gap_label), el('td', o.shift > 0 ? 'pd' : 'pr', o.shift_label), ...(window.OEA_PUBLIC ? [] : [el('td', '', o.rating)]));
    shiftT.append(tr);
  }
  for (const o of sum.filter((x) => x.chamber === 'county').sort((a, b) => b.registered - a.registered)) {
    const tr = el('tr'); tr.setAttribute('data-key', o.key);
    tr.append(el('td', '', o.district), el('td', 'n', fmt(o.registered)), el('td', 'n', pct(o.reg_D)), el('td', 'n', pct(o.reg_R)), el('td', 'n', pct(o.reg_NAV)), el('td', 'n', o.reg_gap_label), el('td', '', o.shift_label || '—'), el('td', 'n', o.pres_2024_label));
    cT.append(tr);
  }
}

// ---------- money tab ----------
function drawMoney() {
  const c = rows('committees');
  const tb = $('#committee-table tbody');
  tb.replaceChildren();
  if (!c) return;
  for (const r of c) {
    const tr = el('tr'); tr.setAttribute('data-key', r.committee);
    tr.append(el('td', '', r.committee), el('td', pcls(r.side), r.side), el('td', '', r.role), el('td', '', r.focus), el('td', 'muted', r.status), el('td', 'muted', r.orestar_id));
    tb.append(tr);
  }
}

// ---------- header ----------
function drawHeader() {
  const p = $('#takeaway');
  const ov = rows('chamber_overview');
  p.replaceChildren();
  if (S.chamber === 'county') {
    const nD = STATE_EXEC.filter((o) => o.party === 'D').length;
    p.append('Statewide offices: Democrats hold ', el('b', '', String(nD)), ' of ', el('b', '', String(STATE_EXEC.length)),
      ' (Governor, Secretary of State, Attorney General, Treasurer and Labor Commissioner; the Labor Commissioner is formally nonpartisan). Only the Governor is on the November 3 ballot.');
    return;
  }
  if (!ov) { p.append(el('span', 'dash-skeleton', '—')); return; }
  const r = ov.find((x) => x.chamber === S.chamber);
  if (S.chamber === 'congress') {
    const sen = (rows('officeholders') || []).filter((x) => x.chamber === 'ussenate');
    const sD = sen.filter((x) => x.party === 'D').length;
    const bb = (f, v) => mark(el('b', '', String(v)), 'chamber_overview', f, { chamber: 'congress' });
    p.append('Oregon’s congressional delegation: Democrats hold ', el('b', '', String(r.held_D + sD)), ' of ', el('b', '', String(r.seats + sen.length)),
      ' seats (', bb('held_D', r.held_D), ' of ', bb('seats', r.seats), ' U.S. House seats and ', el('b', '', String(sD)), ' of ', el('b', '', String(sen.length)), ' U.S. Senate seats). ');
    if (window.OEA_PUBLIC) p.append('All ', bb('up_2026', r.up_2026), ' House seats and one Senate seat are on the November 3 ballot.');
    else p.append(bb('competitive_up', r.competitive_up), ' of the ', bb('up_2026', r.up_2026), ' House seats on the November ballot rate Toss-up or Lean on the statewide-race baseline, and ', bb('watch', r.watch), ' are trending competitive on registration. One Senate seat is also on the ballot.');
    return;
  }
  const b = (f, v) => mark(el('b', '', String(v)), 'chamber_overview', f, { chamber: r.chamber });
  const name = CH[r.chamber].label;
  if (window.OEA_PUBLIC) { p.append(`${name}: Democrats hold `, b('held_D', r.held_D), ' and Republicans ', b('held_R', r.held_R), ' of ', b('seats', r.seats), ' seats; ', b('up_2026', r.up_2026), ' are on the November 3 ballot.'); return; }
  p.append(`${name}: Democrats hold `, b('held_D', r.held_D), ' of ', b('seats', r.seats), ' seats. ', b('competitive_up', r.competitive_up), ' of the ', b('up_2026', r.up_2026), ' seats on the November ballot rate Toss-up or Lean on the statewide-race baseline, and ', b('watch', r.watch), ' are trending competitive on registration.');
}

// ---------- tabs & controls ----------
function showTab(t) {
  S.tab = t;
  document.querySelectorAll('.oea-tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'));
  document.querySelectorAll('.oea-page').forEach((s) => { s.hidden = s.id !== t; });
  $('#controls').hidden = t === 'money' || t === 'methods' || t === 'top' || t === 'night';
  if (t === 'night' && window.OEANight) window.OEANight.draw();
  $('#colorby-wrap').hidden = t !== 'map';
  dash.setLink(t);
  drawAll();
}
document.querySelectorAll('.oea-tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
$('#chamber-seg')?.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-ch]');
  if (!b || b.dataset.ch === S.chamber) return;
  S.chamber = b.dataset.ch;
  S.sel = null; S.prec = null;
  if (S.autoZoom) { S.autoZoom = false; const [[a1, b1], [c1, d1]] = PRESET.state; zoomBox([proj(a1, b1), proj(c1, d1)], 1); }
  document.querySelectorAll('#chamber-seg button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  drawAll();
});
$('#colorby')?.addEventListener('change', (e) => { S.color = e.target.value; drawMap(); if (selCounty()) drawPanel(); });

function drawAll() {
  readNeutral();
  drawHeader();
  if (S.tab === 'map') { drawSeats(); drawMap(); drawPanel(); }
  if (S.tab === 'top') drawTop();
  if (S.tab === 'races') drawRaces();
  if (S.tab === 'registration') drawRegistration();
  if (S.tab === 'money') drawMoney();
}

// ---------- seat chart (hemicycle) ----------
function hemicycle(n, W, H) {
  const nr = n <= 8 ? 1 : n <= 20 ? 2 : n <= 40 ? 3 : 4;
  let rad = Math.min(22, W / 24), out = null;
  for (let pass = 0; pass < 3; pass++) {
    const base = H - rad - 4;
    const R1 = Math.min(W / 2 - rad - 4, base - rad - 4), R0 = nr === 1 ? R1 : R1 * 0.5;
    const radii = d3.range(nr).map((i) => (nr === 1 ? R1 : R0 + (R1 - R0) * i / (nr - 1)));
    const tot = d3.sum(radii);
    const counts = radii.map((r) => Math.max(1, Math.round(n * r / tot)));
    counts[nr - 1] += n - d3.sum(counts);
    const pts = [];
    let gap = Infinity;
    radii.forEach((r, i) => {
      const c = counts[i];
      if (c > 1) gap = Math.min(gap, Math.PI * r / (c - 1));
      for (let j = 0; j < c; j++) {
        const a = c === 1 ? Math.PI / 2 : Math.PI - Math.PI * j / (c - 1);
        pts.push({ a, x: W / 2 + r * Math.cos(a), y: base - r * Math.sin(a) });
      }
    });
    if (nr > 1) gap = Math.min(gap, (R1 - R0) / (nr - 1));
    pts.sort((p, q) => q.a - p.a || q.y - p.y);
    const next = Math.min(gap === Infinity ? 22 : gap / 2.6, nr === 1 ? R1 / 3 : (R1 - R0) / (2.4 * (nr - 1)), 22);
    out = { pts, R0, base, rad: Math.min(next, rad) };
    rad = next;
  }
  return out;
}

function seatList() {
  const sum = rows('district_summary');
  if (!sum) return null;
  if (S.chamber === 'county') {
    return STATE_EXEC.map((x) => ({ key: '', chamber: 'exec', district: 'OR', office: x.office, short: x.short, holder: x.holder, holder_party: x.party, last_winner: x.party, baseline: 0, up2026: x.up2026, rating: '', note: x.note }));
  }
  if (S.chamber === 'congress') {
    const off = rows('officeholders') || [];
    const cd = sum.filter((o) => o.chamber === 'congress');
    const sen = off.filter((p) => p.chamber === 'ussenate').map((p) => ({ key: '', chamber: 'ussenate', district: 'OR', holder: p.name, holder_party: p.party, last_winner: p.party, baseline: p.party === 'D' ? 99 : -99, up2026: p.up2026 ? 'Yes' : 'No', rating: '' }));
    return [...sen, ...cd.sort((x, y) => Number(x.district) - Number(y.district))];
  }
  return sum.filter((o) => o.chamber === S.chamber);
}

function drawSeats() {
  const box = $('#seatbox'), key = $('#seatkey'), tipS = $('#seattip');
  [...box.querySelectorAll('svg, .oea-fail')].forEach((n) => n.remove());
  key.replaceChildren();
  box.classList.toggle('small', S.chamber === 'county' || S.chamber === 'congress');
  $('#seats-title').textContent = S.chamber === 'county' ? 'Oregon’s statewide offices' : S.chamber === 'congress' ? 'Makeup of Oregon’s Congressional Delegation' : `Makeup of the ${CH[S.chamber].label}`;
  $('#seats-when').hidden = false;
  const list = seatList();
  if (!list) { if (dash.data('district_summary').status === 'error') box.append(el('div', 'oea-fail', 'Failed to load')); return; }
  const partyOf = (o) => (S.when === 'now' ? o.holder_party : o.last_winner) || '';
  const order = (p) => (p === 'D' ? 0 : p === 'R' ? 2 : 1);
  const seats = list.length <= 10
    ? [...list]  // small groups keep their natural order: Senate then CD 1-6, or the five offices in Blue Book order
    : [...list].sort((a, b) => order(partyOf(a)) - order(partyOf(b)) || (b.baseline ?? 0) - (a.baseline ?? 0));
  const W = Math.max(280, Math.min(720, box.clientWidth || 520));
  // a handful of seats (statewide offices, the congressional delegation) read better as a labeled row than a hemicycle
  const small = seats.length <= 10;
  let H, pts, rad, R0, base;
  if (small) {
    const per = W / seats.length >= 78 ? seats.length : Math.ceil(seats.length / 2);  // two rows on narrow screens
    rad = Math.min(24, W / (per * 3.2));
    const rowH = rad * 2 + 50;
    H = Math.round(rowH * Math.ceil(seats.length / per));
    pts = seats.map((s, i) => ({ x: W / per * ((i % per) + 0.5), y: rad + 6 + rowH * Math.floor(i / per) }));
    R0 = 0; base = H;
  } else {
    H = Math.round(W * 0.52);
    ({ pts, rad, R0, base } = hemicycle(seats.length, W, H));
  }
  const svgS = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Seats by party');
  const fill = (p) => (p === 'D' ? CD() : p === 'R' ? CR() : NEUTRAL);
  const comp = (o) => o.rating === 'Toss-up' || (o.rating || '').startsWith('Lean');
  svgS.selectAll('circle').data(seats).join('circle')
    .attr('class', 'seat')
    .attr('cx', (d, i) => pts[i].x).attr('cy', (d, i) => pts[i].y).attr('r', rad)
    .attr('fill', (d) => fill(partyOf(d)))
    .attr('fill-opacity', (d) => (S.when === 'now' && d.up2026 === 'No' ? 0.35 : 1))
    .attr('stroke', (d) => (S.when === 'now' && d.up2026 === 'Yes' && comp(d) ? CT() : 'none'))
    .attr('stroke-width', (d) => (S.when === 'now' && comp(d) ? Math.max(2, rad * 0.32) : 0))
    .attr('tabindex', (d) => (d.key ? 0 : null))
    .on('mousemove', (ev, d) => {
      const b = box.getBoundingClientRect();
      tipS.replaceChildren(el('div', 't', d.chamber === 'ussenate' ? 'U.S. Senate' : d.chamber === 'exec' ? d.office : dname(d.chamber, d.district)));
      const who = el('div'); who.append(el('b', pcls(d.holder_party), d.holder ? `${d.holder} (${d.holder_party})` : 'Vacant')); tipS.append(who);
      if (S.when === '2024' && d.last_winner && d.last_winner !== d.holder_party) tipS.append(el('div', 'muted', `Won by ${d.last_winner} in ${d.last_year}`));
      if (d.rating) tipS.append(el('div', 'muted', `${d.rating} · baseline ${d.baseline_label}`));
      if (d.note) tipS.append(el('div', 'muted', d.note));
      else if (d.up2026 === 'No') tipS.append(el('div', 'muted', 'Not on the 2026 ballot'));
      tipS.hidden = false;
      let x = ev.clientX - b.left + 12, y = ev.clientY - b.top + 12;
      if (x + tipS.offsetWidth > b.width) x = Math.max(0, ev.clientX - b.left - tipS.offsetWidth - 12);
      tipS.style.left = x + 'px'; tipS.style.top = y + 'px';
    })
    .on('mouseleave', () => { tipS.hidden = true; })
    .on('click', (ev, d) => { if (d.key) select(d.key, { zoom: true }); })
    .on('keydown', (ev, d) => { if (d.key && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); select(d.key, { zoom: true }); } });
  if (small) {
    const lab = (d) => (d.chamber === 'exec' ? d.short : d.chamber === 'ussenate' ? 'Senate' : dshort(d.chamber, d.district));
    const last = (d) => (d.holder ? d.holder.split(' ').slice(-1)[0] : 'Vacant');
    const t = svgS.append('g').selectAll('text').data(seats).join('text').attr('text-anchor', 'middle').attr('x', (d, i) => pts[i].x);
    t.append('tspan').attr('class', 'nm').attr('x', (d, i) => pts[i].x).attr('y', (d, i) => pts[i].y + rad + 18).text(last);
    t.append('tspan').attr('x', (d, i) => pts[i].x).attr('y', (d, i) => pts[i].y + rad + 34).text(lab);
  }
  if (S.chamber === 'house' || S.chamber === 'senate') {
    const maj = Math.floor(seats.length / 2) + 1;
    svgS.append('line').attr('x1', W / 2).attr('x2', W / 2).attr('y1', 2).attr('y2', Math.max(4, base - R0 - rad - 4))
      .attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3');
    svgS.append('text').attr('x', W / 2).attr('y', base).attr('text-anchor', 'middle').text(`${maj} for a majority`);
  }
  box.insertBefore(svgS.node(), tipS);
  const nD = seats.filter((o) => partyOf(o) === 'D').length, nR = seats.filter((o) => partyOf(o) === 'R').length;
  const big = el('div', 'big');
  const cnt = (p, n, lbl) => { const s = el('div'); const v = el('span', pcls(p), String(n)); if (S.chamber === 'house' || S.chamber === 'senate') mark(v, 'chamber_overview', S.when === 'now' ? (p === 'D' ? 'held_D' : 'held_R') : (p === 'D' ? 'won_D' : 'won_R'), { chamber: S.chamber }); s.append(v, ' ', lbl); big.append(s); };
  cnt('D', nD, 'Democrats');
  cnt('R', nR, 'Republicans');
  key.append(big);
  if (S.when === 'now') {
    const changed = seats.filter((o) => o.last_winner && o.holder_party && o.last_winner !== o.holder_party);
    if (changed.length) key.append(el('div', '', `Changed since the last election: ${changed.map((o) => `${dshort(o.chamber, o.district)} (${o.last_winner} → ${o.holder_party})`).join(', ')}`));
    const lg = el('div', 'oea-legend');
    const sw = (style, txt) => { const s = el('span'); const i = el('i'); Object.assign(i.style, style); s.append(i, txt); lg.append(s); };
    if (!window.OEA_PUBLIC) sw({ background: 'transparent', boxShadow: `inset 0 0 0 2px ${CT()}` }, 'Toss-up or Lean, on 2026 ballot');
    if (seats.some((o) => o.up2026 === 'No')) sw({ background: NEUTRAL }, 'Faded: not on 2026 ballot');
    key.append(lg);
  } else {
    key.append(el('div', '', S.chamber === 'county' ? 'Party that won each office at its most recent election (2022 Governor and Labor Commissioner; 2024 for the others).' : 'Party that won each seat at its most recent election (2024 for the House and Congress; 2022 or 2024 for the Senate).'));
  }
  key.append(el('div', '', S.chamber === 'county' ? 'Hover a seat for the officeholder.' : 'Hover a seat for its member; click a House seat to open it on the map.'));
}
$('#seats-when')?.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-when]');
  if (!b) return;
  S.when = b.dataset.when;
  document.querySelectorAll('#seats-when button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  drawSeats();
});

// ---------- top races ----------
function raceCard(r) {
  const c = el('article', 'oea-race');
  c.id = `race-${r.key}`;
  const head = el('div', 'oea-panel-head');
  const left = el('div');
  left.append(mark(el('div', 'rank', `#${r.rank}`), 'top_races', 'rank', { key: r.key }), el('h4', '', dname(r.chamber, r.district)));
  head.append(left);
  const chips = el('div', 'oea-chips');
  if (r.rating) chips.append(mark(el('span', 'oea-chip ' + (r.rating === 'Toss-up' ? 't' : r.rating.endsWith('D') ? 'd' : 'r'), r.rating), 'top_races', 'rating', { key: r.key }));
  if (r.open_seat) chips.append(mark(el('span', 'oea-chip w', r.open_seat), 'top_races', 'open_seat', { key: r.key }));
  head.append(chips);
  c.append(head);
  c.append(vsBlock(r.chamber, r.district));
  const dl = el('dl', 'oea-kv');
  const kv = (k, f, v, cls) => { dl.append(el('dt', '', k)); const dd = el('dd'); dd.append(mark(el('span', cls || '', v || '—'), 'top_races', f, { key: r.key })); dl.append(dd); };
  kv(r.open_seat ? 'Retiring / leaving' : 'Incumbent', 'holder', r.holder ? `${r.holder} (${r.holder_party})` : '', pcls(r.holder_party));
  kv('Baseline', 'baseline_label', r.baseline_label);
  kv('Last result', 'last_label', r.last_label);
  kv('Pres ’24', 'pres_2024_label', r.pres_2024_label);
  kv('Reg D−R', 'reg_gap_label', r.reg_gap_label);
  kv('Reg shift since ’22', 'shift_label', r.shift_label);
  c.append(dl);
  c.append(mark(el('p', 'oea-why', r.reasons), 'top_races', 'reasons', { key: r.key }));
  const foot = el('div', 'foot');
  const ml = moneyLine(r.chamber, r.district);
  foot.append(el('span', 'oea-note', ml ? `Raised: ${ml}` : 'Raised: coming in the next update'));
  const b = el('button', 'oea-btn', 'Open on map');
  b.type = 'button';
  b.addEventListener('click', () => {
    S.chamber = r.chamber;
    document.querySelectorAll('#chamber-seg button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.ch === r.chamber ? 'true' : 'false'));
    showTab('map');
    requestAnimationFrame(() => select(r.key, { zoom: true, scroll: true }));
  });
  foot.append(b);
  c.append(foot);
  return c;
}

function statewideCard(ch, title, refs) {
  const c = el('article', 'oea-race');
  c.id = `race-${ch}`;
  c.append(el('h4', '', title));
  c.append(vsBlock(ch, 'OR'));
  const rm = rows('race_margins') || [];
  const dl = el('dl', 'oea-kv');
  for (const [lbl, year, race] of refs) {
    const r = rm.find((x) => x.chamber === 'state' && x.year === year && x.race === race);
    if (!r) continue;
    dl.append(el('dt', '', lbl));
    const dd = el('dd');
    dd.append(mark(el('span', r.margin > 0 ? 'pd' : 'pr', r.margin_label), 'race_margins', 'margin_label', { id: r.id }));
    dl.append(dd);
  }
  c.append(dl);
  const foot = el('div', 'foot');
  const ml = moneyLine(ch, 'OR');
  foot.append(el('span', 'oea-note', ml ? `Raised: ${ml}` : 'Raised: coming in the next update'));
  c.append(foot);
  return c;
}

function drawTop() {
  const sw = $('#top-statewide');
  sw.replaceChildren();
  if (rows('nominees_2026') && rows('race_margins')) {
    sw.append(statewideCard('governor', 'Governor', [['2022 Governor (Kotek v Drazan)', 2022, 'Governor'], ['2024 President', 2024, 'President']]));
    sw.append(statewideCard('ussenate', 'U.S. Senate', [['2022 U.S. Senate', 2022, 'U.S. Senate'], ['2024 President', 2024, 'President']]));
  }
  const box = $('#top-cards');
  box.replaceChildren();
  const tr = rows('top_races');
  if (!tr) { if (dash.data('top_races').status === 'error') box.append(el('div', 'oea-fail', 'Failed to load')); return; }
  for (const r of tr.filter((x) => S.topf === 'all' || x.chamber === S.topf)) box.append(raceCard(r));
}
$('#top-filter')?.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-f]');
  if (!b) return;
  S.topf = b.dataset.f;
  document.querySelectorAll('#top-filter button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  drawTop();
});

dash.onData(drawAll);
const named = location.hash.slice(1).replace(/^go-/, '') || (window.OEA_PUBLIC ? 'night' : '');
if (['map', 'night', 'top', 'races', 'registration', 'money', 'methods'].includes(named)) showTab(named);

window.OEA = { fitLabels, moneyLine, moneyBlock, money$, CH, $, el, mark, pcls, dname, dshort, rows, fmt, pct, shape, proj, VW, VH, PRESET, hemicycle, CD, CR, CT, neutral: () => NEUTRAL, readNeutral, showTab: (t) => showTab(t) };
