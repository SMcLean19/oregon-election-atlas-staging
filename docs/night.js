// Election Night tab. Reads live_status, live_races, live_results, live_feed, live_counties.
const O = window.OEA;
const N = { chamber: 'house', sel: 'governor-OR', race: 'governor' };
const RACE = { governor: 'Governor', ussenate: 'U.S. Senate' };
const nel = O.el, nmark = O.mark;
const tfmt = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) : '');
const tdate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }) : '');
const PL = { D: 'Dem', R: 'Rep', L: 'Lib', PG: 'Green', IPO: 'Ind', WFP: 'WFP', PRO: 'Prog', NAV: 'Unaff.' };
const pcolor = (p) => (p === 'D' ? O.CD() : p === 'R' ? O.CR() : 'var(--color-fg-muted)');
const isUp = () => !document.getElementById('night').hidden;

// ---------- map ----------
const nsvg = d3.select('#night-svg').attr('viewBox', `0 0 ${O.VW} ${O.VH}`);
const ng = nsvg.append('g');
const ngShapes = ng.append('g'), ngLabels = ng.append('g');
let NK = 1;
const nzoom = d3.zoom().scaleExtent([1, 60]).translateExtent([[-50, -50], [O.VW + 50, O.VH + 50]])
  .filter((e) => (e.type === 'wheel' ? e.ctrlKey || e.metaKey : !e.button))
  .on('zoom', (e) => { ng.attr('transform', e.transform); NK = e.transform.k; sizeNLabels(); });
nsvg.call(nzoom).on('dblclick.zoom', null);
function nZoomBox([[x0, y0], [x1, y1]], pad = 0.85) {
  const s = Math.max(1, Math.min(60, pad / Math.max((x1 - x0) / O.VW, (y1 - y0) / O.VH)));
  const t = d3.zoomIdentity.translate(O.VW / 2 - s * (x0 + x1) / 2, O.VH / 2 - s * (y0 + y1) / 2).scale(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  (reduce ? nsvg : nsvg.transition().duration(500)).call(nzoom.transform, t);
}
document.querySelectorAll('[data-nzoom]').forEach((b) => b.addEventListener('click', () => {
  const [[a, b2], [c, d]] = O.PRESET[b.dataset.nzoom];
  nZoomBox([O.proj(a, b2), O.proj(c, d)], b.dataset.nzoom === 'state' ? 1 : 0.9);
}));
function sizeNLabels() {
  ngLabels.selectAll('text').attr('font-size', 13 / NK).style('stroke-width', 3 / NK)
    .attr('display', (d) => (Math.sqrt(d.area) * NK > (N.chamber === 'county' ? 46 : 26) ? null : 'none'));
}
const ntip = O.$('#night-tip');

function raceFill(r) {
  const neutral = O.neutral();
  if (!r) return neutral;
  if (r.status === 'called') return pcolor(r.winner_party) === 'var(--color-fg-muted)' ? O.CT() : pcolor(r.winner_party);
  if (r.status === 'counting') return getComputedStyle(O.$('.oea')).getPropertyValue('--oea-close').trim() || '#e2a62b';
  return neutral;
}

function drawNightMap() {
  const geo = O.rows('geo'), races = O.rows('live_races'), held = O.rows('officeholders');
  if (!geo || !races) { ngShapes.selectAll('*').remove(); ngLabels.selectAll('*').remove(); return; }
  const byKey = new Map(races.map((r) => [r.race_id, r]));
  const cnt = new Map((O.rows('live_counties') || []).filter((c) => c.race === N.race).map((c) => [c.county, c]));
  const holder = new Map((held || []).map((h) => [`${h.chamber}-${h.district}`, h]));
  const feats = geo.filter((g) => g.chamber === N.chamber).map((g) => {
    const key = `${g.chamber}-${g.district}`;
    return { ...O.shape(g), key, district: String(g.district), race: byKey.get(key), county: cnt.get(String(g.district)), holder: holder.get(key) };
  });
  const fill = (d) => {
    if (N.chamber === 'county') {
      const c = d.county;
      if (!c) return O.neutral();
      return d3.interpolateRgb(O.neutral(), pcolor(c.leader_party))(0.25 + 0.75 * Math.min(1, c.margin_pct / 30));
    }
    if (!d.race) return d.holder ? d3.interpolateRgb(O.neutral(), pcolor(d.holder.party))(0.55) : O.neutral(); // senate holdover
    return raceFill(d.race);
  };
  ngShapes.selectAll('path').data(feats, (d) => d.key).join('path')
    .attr('class', (d) => 'dist' + (d.key === N.sel ? ' sel' : ''))
    .attr('d', (d) => d.d).attr('fill', fill).attr('fill-rule', 'evenodd')
    .attr('vector-effect', 'non-scaling-stroke').attr('tabindex', 0)
    .attr('aria-label', (d) => O.dname(N.chamber, d.district))
    .on('mousemove', (ev, d) => nightTip(ev, d))
    .on('mouseleave', () => { ntip.hidden = true; })
    .on('click', (ev, d) => { if (d.race) selectRace(d.key); else if (N.chamber === 'county') selectRace(`${N.race}-OR`); })
    .on('keydown', (ev, d) => { if ((ev.key === 'Enter' || ev.key === ' ') && d.race) { ev.preventDefault(); selectRace(d.key); } });
  ngShapes.selectAll('path.sel').raise();
  ngLabels.selectAll('text').data(feats, (d) => d.key).join('text')
    .attr('x', (d) => d.c[0]).attr('y', (d) => d.c[1]).attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
    .text((d) => d.district);
  sizeNLabels();
}

function nightTip(ev, d) {
  const box = O.$('#night-mapbox').getBoundingClientRect();
  ntip.replaceChildren(nel('div', 't', O.dname(N.chamber, d.district)));
  if (N.chamber === 'county') {
    const c = d.county;
    ntip.append(nel('div', '', c ? `${RACE[N.race]}: ${c.leader} leads by ${c.margin_pct.toFixed(1)} pts` : `No ${RACE[N.race]} results from this county yet`));
  } else if (!d.race) {
    ntip.append(nel('div', 'muted', `Not on the ballot this year${d.holder ? ` · held by ${d.holder.name} (${d.holder.party})` : ''}`));
  } else {
    const r = d.race;
    ntip.append(nel('b', O.pcls(r.status === 'called' ? r.winner_party : r.leader_party),
      r.status === 'called' ? `${r.winner} (${r.winner_party}) wins` : r.status === 'counting' ? `${r.leader} (${r.leader_party}) leads by ${r.margin_pct ?? 0}` : 'Waiting for results'));
    if (r.status === 'counting') ntip.append(nel('div', 'muted', `About ${r.pct_in_est}% counted`));
    if (r.flip) ntip.append(nel('div', '', `Flip: ${r.flip}`));
  }
  ntip.hidden = false;
  let x = ev.clientX - box.left + 14, y = ev.clientY - box.top + 14;
  if (x + ntip.offsetWidth > box.width) x = Math.max(0, ev.clientX - box.left - ntip.offsetWidth - 14);
  if (y + ntip.offsetHeight > box.height) y = Math.max(0, ev.clientY - box.top - ntip.offsetHeight - 14);
  ntip.style.left = x + 'px'; ntip.style.top = y + 'px';
}

// ---------- seat tracker ----------
function drawNightSeats() {
  const box = O.$('#night-seatbox'), head = O.$('#night-seathead');
  [...box.querySelectorAll('svg')].forEach((n) => n.remove());
  head.replaceChildren();
  if (!O.$('#night-seattip')) { const t = nel('div', 'oea-tip'); t.id = 'night-seattip'; t.hidden = true; box.append(t); }
  const races = O.rows('live_races'), held = O.rows('officeholders'), st = (O.rows('live_status') || [])[0];
  if (!races || !held || !st) return;
  if (N.chamber === 'county') {
    O.$('#night-seats-title').textContent = 'Statewide races';
    const wrap = nel('div', 'oea-nstate');
    for (const id of ['governor-OR', 'ussenate-OR']) wrap.append(raceCard(races.find((r) => r.race_id === id), true));
    box.replaceChildren(wrap);
    return;
  }
  box.querySelector('.oea-nstate')?.remove();
  const ch = N.chamber;
  O.$('#night-seats-title').textContent = ch === 'congress' ? 'Oregon’s U.S. House seats' : `${O.CH[ch].label} tracker`;
  const up = races.filter((r) => r.chamber === ch);
  const upKeys = new Set(up.map((r) => r.race_id));
  const seats = [
    ...held.filter((h) => h.chamber === ch && !upKeys.has(`${ch}-${h.district}`)).map((h) => ({ key: `${ch}-${h.district}`, hold: true, party: h.party, name: h.name, district: h.district })),
    ...up.map((r) => ({ key: r.race_id, hold: false, race: r, district: r.district, party: r.status === 'called' ? r.winner_party : '', lean: r.status === 'counting' ? r.leader_party : '' })),
  ];
  const order = (s) => (s.party === 'D' ? 0 : s.lean === 'D' ? 1 : s.party === 'R' ? 4 : s.lean === 'R' ? 3 : 2);
  seats.sort((a, b) => order(a) - order(b) || (a.hold === b.hold ? 0 : a.hold ? -1 : 1) * (order(a) < 2 ? 1 : -1));
  const W = Math.max(280, Math.min(720, box.clientWidth || 520)), H = Math.round(W * 0.52), TOP = 20, FOOT = 26;
  const { pts, rad, R0, base } = O.hemicycle(seats.length, W, H);
  const s = d3.create('svg').attr('viewBox', `0 ${-TOP} ${W} ${H + TOP + FOOT}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Seats called so far');
  s.selectAll('circle').data(seats).join('circle').attr('class', 'seat')
    .attr('cx', (d, i) => pts[i].x).attr('cy', (d, i) => pts[i].y).attr('r', rad)
    .attr('fill', (d) => (d.party ? pcolor(d.party) : 'var(--color-panel)'))
    .attr('fill-opacity', (d) => (d.hold ? 0.55 : 1))
    .attr('stroke', (d) => (d.party ? 'none' : d.lean ? pcolor(d.lean) : 'var(--color-fg-muted)'))
    .attr('stroke-width', (d) => (d.party ? 0 : d.lean ? Math.max(2, rad * 0.22) : 1.2))
    .attr('stroke-dasharray', (d) => (!d.party && !d.lean ? '2 2' : null))
    .attr('tabindex', (d) => (d.race ? 0 : null))
    .on('click', (ev, d) => { if (d.race) selectRace(d.key, true); })
    .on('keydown', (ev, d) => { if (d.race && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); selectRace(d.key, true); } })
    .on('mousemove', (ev, d) => seatTip(ev, d, ch))
    .on('mouseleave', () => { O.$('#night-seattip').hidden = true; });
  const need = ch === 'house' ? st.house_majority : ch === 'senate' ? st.senate_majority : null;
  if (need) {
    s.append('line').attr('x1', W / 2).attr('x2', W / 2).attr('y1', 4).attr('y2', Math.max(8, base - R0 - rad - 4))
      .attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3');
    s.append('text').attr('x', W / 2).attr('y', -6).attr('text-anchor', 'middle').text(`${need} for a majority`);
  }
  // counts written under each side of the arc
  const cnt = (f) => seats.filter(f).length;
  const wonD = cnt((x) => x.party === 'D'), wonR = cnt((x) => x.party === 'R');
  const leadD = cnt((x) => !x.party && x.lean === 'D'), leadR = cnt((x) => !x.party && x.lean === 'R');
  const wait = cnt((x) => !x.party && !x.lean);
  const yl = H + FOOT - 8;
  const lab = (x, anchor, parts) => {
    const t = s.append('text').attr('class', 'arc-count').attr('x', x).attr('y', yl).attr('text-anchor', anchor);
    parts.forEach(([txt, cls]) => t.append('tspan').attr('class', cls || null).text(txt));
  };
  const hasHold = seats.some((x) => x.hold), wide = W >= 560;
  const WON = wide ? (hasHold ? ' seated or called' : ' called') : ' won', LEAD = wide ? ' leading' : ' lead', WAIT = wide ? ' waiting' : ' wait';
  const edge = Math.min(W / 2 - 10, H - 16);
  lab(Math.max(2, W / 2 - edge), 'start', [[`${wonD}`, 'n d'], [WON], ['  ·  '], [`${leadD}`, 'n'], [LEAD]]);
  if (wait) lab(W / 2, 'middle', [[`${wait}`, 'n'], [WAIT]]);
  lab(Math.min(W - 2, W / 2 + edge), 'end', [[`${leadR}`, 'n'], [LEAD + '  ·  '], [`${wonR}`, 'n r'], [WON]]);
  box.prepend(s.node());
  // header: what each side has and needs
  const nD = st[`${ch}_D`], nR = st[`${ch}_R`], open = st[`${ch}_open`];
  const leanD = up.filter((r) => r.status === 'counting' && r.leader_party === 'D').length;
  const leanR = up.filter((r) => r.status === 'counting' && r.leader_party === 'R').length;
  const row = nel('div', 'oea-nhead');
  const side = (p, n, lean, f) => {
    const d = nel('div', 'side ' + p.toLowerCase());
    const big = nmark(nel('span', 'n ' + O.pcls(p), String(n)), 'live_status', f, { id: 'now' });
    d.append(big, nel('span', 'lbl', p === 'D' ? 'Democrats' : 'Republicans'));
    const sub = nel('div', 'sub');
    if (need) sub.append(n >= need ? 'Majority won' : `Need ${need - n} more`);
    if (lean) sub.append(` · leading in ${lean}`);
    d.append(sub);
    return d;
  };
  row.append(side('D', nD, leanD, `${ch}_D`));
  const mid = nel('div', 'mid');
  mid.append(nmark(nel('span', 'n', String(open)), 'live_status', `${ch}_open`, { id: 'now' }), nel('span', 'lbl', 'not yet called'));
  if (need) {
    const dGap = need - nD, rGap = need - nR;
    const msg = nD >= need ? 'Democrats hold the majority' : nR >= need ? 'Republicans hold the majority'
      : dGap === rGap ? 'Even: both sides need the same' : `${dGap < rGap ? 'Democrats' : 'Republicans'} closer to a majority`;
    mid.append(nel('div', 'sub', msg));
  }
  row.append(mid, side('R', nR, leanR, `${ch}_R`));
  head.append(row);
}

function seatTip(ev, d, ch) {
  const tip = O.$('#night-seattip'), box = O.$('#night-seatbox').getBoundingClientRect();
  tip.replaceChildren(nel('div', 't', O.dname(ch, d.district)));
  if (d.hold) {
    tip.append(nel('b', O.pcls(d.party), `${d.name} (${d.party})`), nel('div', 'muted', 'Not on the ballot this year'));
  } else {
    const r = d.race;
    const res = (O.rows('live_results') || []).filter((x) => x.race_id === r.race_id).sort((a, b) => b.votes - a.votes).slice(0, 2);
    if (r.status === 'called') tip.append(nel('b', O.pcls(r.winner_party), `${r.winner} (${r.winner_party}) wins${r.flip ? ' · flip' : ''}`));
    else if (r.status === 'counting') tip.append(nel('b', O.pcls(r.leader_party), `${r.leader} (${r.leader_party}) leads by ${r.margin_pct ?? 0} pts`));
    else tip.append(nel('div', 'muted', 'Waiting for results'));
    for (const x of res) if (x.pct != null) tip.append(nel('div', '', `${x.candidate} (${x.party}) ${x.pct.toFixed(1)}%`));
    if (r.status === 'counting') tip.append(nel('div', 'muted', `About ${r.pct_in_est}% counted`));
    if (r.field === 1) tip.append(nel('div', 'muted', 'Unopposed'));
  }
  tip.hidden = false;
  let x = ev.clientX - box.left + 12, y = ev.clientY - box.top + 12;
  if (x + tip.offsetWidth > box.width) x = Math.max(0, ev.clientX - box.left - tip.offsetWidth - 12);
  if (y + tip.offsetHeight > box.height) y = Math.max(0, ev.clientY - box.top - tip.offsetHeight - 12);
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}

// ---------- top races strip ----------
function raceCard(r, big) {
  const c = nel('button', 'oea-ncard' + (big ? ' big' : '') + (r && r.race_id === N.sel ? ' on' : ''));
  c.type = 'button';
  if (!r) return c;
  c.dataset.race = r.race_id;
  c.addEventListener('click', () => selectRace(r.race_id, true));
  const top = nel('div', 'top');
  top.append(nel('span', 'name', r.label));
  const chip = nel('span', 'oea-chip ' + (r.status === 'called' ? (r.winner_party === 'D' ? 'd' : r.winner_party === 'R' ? 'r' : 't') : ''),
    r.status === 'called' ? (r.flip ? `Flip · ${r.winner_party} win` : `Called · ${r.winner_party}`) : r.status === 'counting' ? `~${r.pct_in_est}% counted` : 'Too early');
  nmark(chip, 'live_races', 'status', { race_id: r.race_id });
  top.append(chip);
  c.append(top);
  const res = (O.rows('live_results') || []).filter((x) => x.race_id === r.race_id).sort((a, b) => b.votes - a.votes || (a.party === 'D' ? -1 : 1)).slice(0, big ? 3 : 2);
  for (const x of res) {
    const line = nel('div', 'cand');
    const nm = nel('span', 'cn', `${x.candidate.split(' ').slice(-1)[0]} (${x.party})${x.winner ? ' ✓' : ''}`);
    const bar = nel('span', 'bar');
    const fillb = nel('i'); fillb.style.width = (x.pct || 0) + '%'; fillb.style.background = pcolor(x.party);
    bar.append(fillb);
    const p = nmark(nel('span', 'cp', x.pct == null ? '—' : `${x.pct.toFixed(1)}%`), 'live_results', 'pct', { id: x.id });
    line.append(nm, bar, p);
    c.append(line);
  }
  return c;
}

function drawNightTop() {
  const box = O.$('#night-top');
  box.replaceChildren();
  const races = O.rows('live_races');
  if (!races) return;
  const GROUPS = [['Federal', ['ussenate', 'congress']], ['Governor', ['governor']], ['State Senate', ['senate']], ['State House', ['house']]];
  const keyRaces = races.filter((r) => r.top_rank != null);
  const ord = (r) => (r.chamber === 'ussenate' ? -1 : Number(r.district) || 0);
  for (const [name, chs] of GROUPS) {
    const list = keyRaces.filter((r) => chs.includes(r.chamber)).sort((a, b) => chs.indexOf(a.chamber) - chs.indexOf(b.chamber) || ord(a) - ord(b));
    if (!list.length) continue;
    box.append(nel('p', 'oea-ngroup', name));
    list.forEach((r) => box.append(raceCard(r)));
  }
}

// ---------- race detail ----------
function selectRace(id, zoom) {
  N.sel = id;
  let full = false;
  if (id === 'governor-OR' || id === 'ussenate-OR') {
    const race = id.split('-')[0];
    if (race !== N.race) { N.race = race; full = true; }
  }
  const [ch] = id.split('-');
  if (zoom && ch !== N.chamber && ['house', 'senate', 'congress'].includes(ch)) {
    N.chamber = ch;
    full = true;
    document.querySelectorAll('#night-seg button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.ch === ch ? 'true' : 'false'));
  }
  if (full) drawNight();
  else {
    // update only what the selection touches, so nothing above the click changes height
    ngShapes.selectAll('path').classed('sel', (d) => d.key === id);
    ngShapes.selectAll('path.sel').raise();
    document.querySelectorAll('#night-top .oea-ncard, #night-seatbox .oea-ncard').forEach((c) => c.classList.toggle('on', c.dataset.race === id));
    drawNightDetail();
  }
  if (zoom) {
    const g = (O.rows('geo') || []).find((x) => `${x.chamber}-${x.district}` === id);
    if (g) nZoomBox(O.shape(g).box, 0.6);
  }
}

function drawNightDetail() {
  const P = O.$('#night-detail');
  P.replaceChildren();
  const races = O.rows('live_races'), res = O.rows('live_results');
  if (!races || !res) return;
  const r = races.find((x) => x.race_id === N.sel) || races.find((x) => x.race_id === 'governor-OR');
  if (!r) return;
  const head = nel('div', 'oea-panel-head');
  head.append(nel('h3', 'oea-panel-name', r.label === 'Governor' || r.label === 'U.S. Senate' ? r.label : O.dname(r.chamber, r.district)));
  const chips = nel('div', 'oea-chips');
  chips.append(nmark(nel('span', 'oea-chip ' + (r.status === 'called' ? (r.winner_party === 'D' ? 'd' : 'r') : ''),
    r.status === 'called' ? `Called for ${r.winner}` : r.status === 'counting' ? 'Too close to call' : 'Waiting for results'), 'live_races', 'status', { race_id: r.race_id }));
  if (r.flip) chips.append(nmark(nel('span', 'oea-chip t', `Flip: ${r.flip}`), 'live_races', 'flip', { race_id: r.race_id }));
  head.append(chips);
  P.append(head);
  const t = nmark(nel('table'), 'live_results');
  t.setAttribute('data-row-key', 'id');
  const hr = nel('tr');
  [['candidate', 'Candidate'], ['nominations', 'Party'], ['votes', 'Votes', 'n'], ['pct', 'Share', 'n']].forEach(([f, l, c]) => { const h = nel('th', c || '', l); h.setAttribute('data-field', f); hr.append(h); });
  const th = nel('thead'); th.append(hr); t.append(th);
  const tb = nel('tbody');
  res.filter((x) => x.race_id === r.race_id).sort((a, b) => b.votes - a.votes).forEach((x) => {
    const tr = nel('tr'); tr.setAttribute('data-key', x.id);
    const nm = nel('td', O.pcls(x.party)); nm.append(`${x.candidate}${x.incumbent === 'Yes' ? ' (inc.)' : ''}${x.winner ? ' ✓' : ''}`);
    tr.append(nm, nel('td', 'muted', x.nominations), nel('td', 'n', O.fmt(x.votes)), nel('td', 'n', x.pct == null ? '—' : `${x.pct.toFixed(1)}%`));
    tb.append(tr);
  });
  t.append(tb);
  const w = nel('div', 'oea-tw'); w.append(t); P.append(w);
  const dl = nel('dl', 'oea-kv');
  const kv = (k, f, v) => { if (v === '' || v == null) return; dl.append(nel('dt', '', k)); const dd = nel('dd'); dd.append(nmark(nel('span', '', String(v)), 'live_races', f, { race_id: r.race_id })); dl.append(dd); };
  kv('Votes counted', 'votes_counted', r.votes_counted ? O.fmt(r.votes_counted) : '');
  kv('Estimated counted', 'pct_in_est', r.status === 'counting' ? `About ${r.pct_in_est}%` : '');
  kv('Why it was called', 'call_reason', r.call_reason);
  kv('Called at', 'called_at', r.called_at ? (r.call_reason === 'Unopposed' ? 'Poll close' : `${tfmt(r.called_at)}, ${tdate(r.called_at)}`) : '');
  P.append(dl);
  const sum = (O.rows('district_summary') || []).find((x) => x.key === r.race_id);
  if (sum) {
    P.append(nel('p', 'oea-sub', 'For comparison'));
    const d2 = nel('dl', 'oea-kv');
    const kv2 = (k, f, v) => { if (!v) return; d2.append(nel('dt', '', k)); const dd = nel('dd'); dd.append(nmark(nel('span', '', v), 'district_summary', f, { key: sum.key })); d2.append(dd); };
    kv2('Held by', 'holder', sum.holder ? `${sum.holder} (${sum.holder_party})` : '');
    kv2('Last result', 'last_label', sum.last_label);
    kv2('Baseline', 'baseline_label', sum.baseline_label);
    kv2('Pre-election rating', 'rating', sum.rating);
    P.append(d2);
  }
}

// ---------- feed ----------
const KIND = { call: 'Call', flip: 'Flip', upset: 'Upset', majority: 'Majority', results: 'Results', lead: 'Lead change', info: 'Desk' };
function drawFeed() {
  const box = O.$('#night-feed');
  box.replaceChildren();
  const feed = O.rows('live_feed');
  if (!feed) return;
  if (!feed.length) { box.append(nel('p', 'oea-note', 'Posts appear here as results come in.')); return; }
  for (const p of feed) {
    const a = nel('article', 'oea-tweet k-' + p.kind);
    a.setAttribute('data-key', p.id);
    const av = nel('div', 'av', 'OA');
    const body = nel('div', 'body');
    const meta = nel('div', 'meta');
    meta.append(nel('b', '', 'Atlas Desk'), nel('span', 'muted', ` @OregonAtlasDesk · ${tfmt(p.at)}`));
    if (p.kind !== 'info') meta.append(nel('span', 'kind', KIND[p.kind] || p.kind));
    const txt = nmark(nel('p', 'txt', p.text), 'live_feed', 'text', { id: p.id });
    body.append(meta, txt);
    if (p.race_id && p.race_id.includes('-')) {
      txt.classList.add('link');
      txt.addEventListener('click', () => selectRace(p.race_id, true));
    }
    a.append(av, body);
    box.append(a);
  }
}

// ---------- status ----------
function drawStatus() {
  const box = O.$('#night-status');
  box.replaceChildren();
  const st = (O.rows('live_status') || [])[0];
  if (!st) return;
  const phase = { waiting: 'Polls close at 8:00 PM PT · Nov 3', live: 'Live results', rehearsal: 'Rehearsal', counting: 'Counting continues', final: 'Final unofficial results', certified: 'Certified' }[st.phase] || st.phase;
  const b = nmark(nel('span', 'oea-chip ' + (st.phase === 'live' ? 'r live' : st.phase === 'rehearsal' ? 't' : ''), phase), 'live_status', 'phase', { id: 'now' });
  box.append(b);
  if (st.as_of) box.append(nmark(nel('span', '', `Updated ${tfmt(st.as_of)}`), 'live_status', 'as_of', { id: 'now' }));
  if (st.ballots_counted) box.append(nmark(nel('span', '', `${O.fmt(st.ballots_counted)} ballots counted`), 'live_status', 'ballots_counted', { id: 'now' }));
  box.append(nel('span', 'muted', 'Checks the Secretary of State every 15 minutes from 8:00 PM'));
  O.$('#night-rehearsal').hidden = st.phase !== 'rehearsal';
}

// ---------- ticker (chyron) ----------
let tickSig = '';
const TICK_PX_PER_SEC = 70; // readable at a glance; full House + Senate + statewide loop in about 4 minutes
function tickLabel(r) {
  if (r.chamber === 'governor') return 'GOV';
  if (r.chamber === 'ussenate') return 'U.S. SEN';
  return `${r.chamber === 'congress' ? 'CD' : r.chamber === 'senate' ? 'SD' : 'HD'} ${String(r.district).padStart(2, '0')}`;
}
function drawTicker() {
  const track = O.$('#night-ticker-track');
  const races = O.rows('live_races'), res = O.rows('live_results');
  if (!races || !res) return;
  const by = d3.group(res, (d) => d.race_id);
  const rank = (r) => ({ governor: 0, ussenate: 1, congress: 2, senate: 3, house: 4 }[r.chamber] ?? 5);
  const items = races.slice().sort((a, b) => rank(a) - rank(b) || Number(a.district) - Number(b.district)).map((r) => {
    const cands = by.get(r.race_id) || [];
    const best = (p) => cands.filter((c) => c.party === p).sort((a, b) => b.votes - a.votes)[0];
    const parts = [];
    for (const p of ['D', 'R']) {
      const c = best(p);
      if (c) parts.push({ p, id: c.id, pct: c.pct, win: c.winner === 'Yes' });
    }
    if (parts.length < 2) { // no D or no R on the ballot: show the strongest other candidate instead
      const o = cands.filter((c) => c.party !== 'D' && c.party !== 'R').sort((a, b) => b.votes - a.votes)[0];
      if (o) parts.push({ p: o.party, id: o.id, pct: o.pct, win: o.winner === 'Yes' });
    }
    return { label: tickLabel(r), status: r.status, unopposed: r.field === 1, parts, race_id: r.race_id };
  });
  const sig = JSON.stringify(items);
  if (sig === tickSig && track.childElementCount) return;
  tickSig = sig;
  const seq = () => {
    const s = nel('div', 'seq');
    for (const it of items) {
      const b = nel('span', 'item' + (it.status === 'called' ? ' called' : ''));
      b.append(nel('span', 'lbl', it.label));
      if (it.unopposed) {
        const w = it.parts[0];
        b.append(nel('span', 'pv ' + (w ? w.p.toLowerCase() : ''), `${w ? w.p : ''} unopposed${it.status === 'called' ? ' ✓' : ''}`));
      } else {
        for (const pt of it.parts) {
          const v = nmark(nel('span', 'pv ' + pt.p.toLowerCase() + (pt.win ? ' win' : ''),
            `${pt.p} ${pt.pct == null ? '—' : pt.pct.toFixed(1) + '%'}${pt.win ? ' ✓' : ''}`), 'live_results', 'pct', { id: pt.id });
          b.append(v);
        }
      }
      s.append(b);
    }
    return s;
  };
  const a = seq(), b = seq();
  b.setAttribute('aria-hidden', 'true');
  track.replaceChildren(a, b);
  requestAnimationFrame(() => {
    const w = a.getBoundingClientRect().width;
    track.style.setProperty('--tick-dur', `${Math.max(30, Math.round(w / TICK_PX_PER_SEC))}s`);
  });
}

function drawNight() {
  if (!isUp()) return;
  O.$('#night-race-seg').hidden = N.chamber !== 'county';
  document.querySelectorAll('#night-race-seg button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.race === N.race ? 'true' : 'false'));
  O.$('#night-map-note').textContent = N.chamber === 'county'
    ? `Counties shade by who leads the ${RACE[N.race]} race; darker means a wider lead. Switch races with the buttons above the map.`
    : 'Grey: no results yet. Yellow: counting, too close to call (hover or click to see who leads). Solid blue or red: race called.';
  O.readNeutral();
  drawTicker();
  drawStatus();
  drawNightSeats();
  drawNightMap();
  drawNightTop();
  drawNightDetail();
  drawFeed();
}

O.$('#night-seg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-ch]');
  if (!b || b.dataset.ch === N.chamber) return;
  N.chamber = b.dataset.ch;
  document.querySelectorAll('#night-seg button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  drawNight();
});
O.$('#night-race-seg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-race]');
  if (!b) return;
  selectRace(`${b.dataset.race}-OR`);
});
window.OEANight = { draw: drawNight };
dash.onData(drawNight);
