dash.calc('reg_shares', {
  title: 'Registration shares',
  description: 'Each party’s share of registered voters by district and snapshot, and the Democratic minus Republican gap in points.',
  inputs: ['registration'],
  fn: (registration) => registration.map((r) => {
    const t = Number(r.total);
    const p = (v) => Math.round(1000 * Number(v) / t) / 10;
    return {
      id: `${r.chamber}-${r.district}-${r.month}`, chamber: r.chamber, district: String(r.district), month: r.month,
      total: t, D_pct: p(r.D), R_pct: p(r.R), NAV_pct: p(r.NAV), other_pct: p(Number(r.IND) + Number(r.OTH)),
      gap: Math.round(1000 * (Number(r.D) - Number(r.R)) / t) / 10,
    };
  }),
});

dash.calc('race_margins', {
  title: 'Statewide races by district',
  description: 'Democratic and Republican share of all votes cast in each statewide race, by district, and the margin between them.',
  inputs: ['statewide'],
  fn: (statewide) => statewide.map((r) => {
    const t = Number(r.total);
    const d = Math.round(1000 * Number(r.D) / t) / 10;
    const rr = Math.round(1000 * Number(r.R) / t) / 10;
    const m = Math.round(10 * (d - rr)) / 10;
    return {
      id: `${r.chamber}-${r.district}-${r.year}-${r.race}`, chamber: r.chamber, district: String(r.district),
      year: Number(r.year), race: r.race, D_pct: d, R_pct: rr, margin: m,
      margin_label: m === 0 ? 'Even' : (m > 0 ? 'D+' : 'R+') + Math.abs(m).toFixed(1),
    };
  }),
});

dash.calc('race_results', {
  title: 'Legislative and U.S. House results',
  description: 'Each candidate’s votes and share of the vote in State House, State Senate and U.S. House general elections.',
  inputs: ['races'],
  fn: (races) => {
    const tot = {};
    for (const r of races) {
      const k = `${r.chamber}-${r.district}-${r.year}`;
      tot[k] = (tot[k] || 0) + Number(r.votes);
    }
    return races.map((r) => {
      const k = `${r.chamber}-${r.district}-${r.year}`;
      return {
        id: `${k}-${r.candidate}`, race_id: k, chamber: r.chamber, district: String(r.district), year: Number(r.year),
        candidate: r.candidate, party: r.party, votes: Number(r.votes),
        pct: Math.round(1000 * Number(r.votes) / tot[k]) / 10,
      };
    });
  },
});

dash.calc('district_summary', {
  title: 'District scorecard',
  description: 'Per district: registration and its shift since Sep 2022, the average margin across six statewide races (the baseline), the rating that baseline gives, the last result, the officeholder and the 2026 nominees.',
  inputs: ['reg_shares', 'race_margins', 'race_results', 'officeholders', 'ballot_2026'],
  fn: (reg_shares, race_margins, race_results, officeholders, ballot_2026) => {
    const BASE = ['2024 President', '2024 Secretary of State', '2024 Attorney General', '2024 State Treasurer', '2022 Governor', '2022 U.S. Senate'];
    const lab = (m) => (m == null ? '' : m === 0 ? 'Even' : (m > 0 ? 'D+' : 'R+') + Math.abs(m).toFixed(1));
    const r1 = (v) => Math.round(10 * v) / 10;
    const out = new Map();
    const latest = reg_shares.reduce((m, r) => (r.month > m ? r.month : m), '');
    const get = (ch, d) => {
      const key = `${ch}-${d}`;
      if (!out.has(key)) out.set(key, { key, chamber: ch, district: String(d) });
      return out.get(key);
    };
    for (const r of reg_shares) {
      if (r.chamber === 'state') continue;
      const o = get(r.chamber, r.district);
      if (r.month === latest) Object.assign(o, { reg_month: r.month, registered: r.total, reg_D: r.D_pct, reg_R: r.R_pct, reg_NAV: r.NAV_pct, reg_other: r.other_pct, reg_gap: r.gap });
      if (r.month === '2022-09') o.gap_2022 = r.gap;
    }
    const sums = {};
    for (const r of race_margins) {
      if (r.chamber === 'state' || !BASE.includes(`${r.year} ${r.race}`)) continue;
      const o = get(r.chamber, r.district);
      (sums[o.key] = sums[o.key] || []).push(r.margin);
      if (r.year === 2024 && r.race === 'President') o.pres_2024 = r.margin;
      if (r.year === 2022 && r.race === 'Governor') o.gov_2022 = r.margin;
    }
    const last = {};
    for (const r of race_results) {
      const k = `${r.chamber}-${r.district}`;
      if (!last[k] || r.year > last[k].year) last[k] = { year: r.year, rows: [] };
      if (r.year === last[k].year) last[k].rows.push(r);
    }
    const held = {};
    for (const p of officeholders) held[`${p.chamber}-${p.district}`] = p;
    const nom = {};
    for (const b of ballot_2026) {
      if (/Democratic/.test(b.nominations)) nom[`${b.chamber}-${b.district}-D`] = b.candidate;
      if (/Republican/.test(b.nominations)) nom[`${b.chamber}-${b.district}-R`] = b.candidate;
    }
    return [...out.values()].map((o) => {
      const b = sums[o.key] ? r1(sums[o.key].reduce((a, v) => a + v, 0) / sums[o.key].length) : null;
      const a = Math.abs(b), side = b > 0 ? 'D' : 'R';
      const rating = b == null ? '' : a < 4 ? 'Toss-up' : a < 8 ? `Lean ${side}` : a < 15 ? `Likely ${side}` : `Safe ${side}`;
      const shift = o.reg_gap != null && o.gap_2022 != null ? r1(o.reg_gap - o.gap_2022) : null;
      const watch = b != null && shift != null && a < 20 && Math.abs(shift) >= 1.5 && Math.sign(shift) === -Math.sign(b);
      const lr = last[o.key];
      let last_label = '', last_margin = null, last_winner = '';
      if (lr) {
        const top = [...lr.rows].sort((x, y) => y.votes - x.votes);
        last_winner = top[0].party;
        const d = lr.rows.filter((x) => x.party === 'D').reduce((s, x) => s + x.pct, 0);
        const rr = lr.rows.filter((x) => x.party === 'R').reduce((s, x) => s + x.pct, 0);
        if (d > 0 && rr > 0) { last_margin = r1(d - rr); last_label = `${lab(last_margin)} (${lr.year})`; }
        else last_label = `${last_winner} unopposed by ${last_winner === 'D' ? 'R' : 'D'} (${lr.year})`;
      }
      const h = held[o.key];
      return {
        ...o,
        baseline: b, baseline_label: lab(b), rating, abs_baseline: b == null ? null : r1(a),
        pres_2024_label: lab(o.pres_2024), gov_2022_label: lab(o.gov_2022),
        reg_gap_label: lab(o.reg_gap), shift, shift_label: shift == null ? '' : (shift > 0 ? 'Toward D ' : shift < 0 ? 'Toward R ' : '') + Math.abs(shift).toFixed(1),
        watch: watch ? 'Trending competitive' : '',
        last_year: lr ? lr.year : null, last_margin, last_label, last_winner,
        holder: h ? h.name : '', holder_party: h ? h.party : '', holder_since: h ? h.since : '', up2026: h ? (h.up2026 ? 'Yes' : 'No') : '',
        party_switch: h && last_winner && h.party !== last_winner ? `Seat won by ${last_winner} in ${lr.year}; now held by ${h.party}` : '',
        nominee_D: nom[`${o.key}-D`] || '', nominee_R: nom[`${o.key}-R`] || '',
      };
    });
  },
});

dash.calc('chamber_overview', {
  title: 'Chamber overview',
  description: 'Seats held by each party, seats on the 2026 ballot, and seats by rating, for each chamber.',
  inputs: ['district_summary'],
  fn: (district_summary) => ['house', 'senate', 'congress'].map((ch) => {
    const rows = district_summary.filter((r) => r.chamber === ch);
    const n = (f) => rows.filter(f).length;
    return {
      chamber: ch, seats: rows.length,
      held_D: n((r) => r.holder_party === 'D'), held_R: n((r) => r.holder_party === 'R'),
      won_D: n((r) => r.last_winner === 'D'), won_R: n((r) => r.last_winner === 'R'),
      up_2026: n((r) => r.up2026 === 'Yes'),
      competitive: n((r) => r.rating === 'Toss-up' || r.rating.startsWith('Lean')),
      competitive_up: n((r) => r.up2026 === 'Yes' && (r.rating === 'Toss-up' || r.rating.startsWith('Lean'))),
      watch: n((r) => r.watch !== ''),
    };
  }),
});

dash.calc('state_registration', {
  title: 'Statewide registration change',
  description: 'Statewide party shares in the latest monthly report and their change in points since September 2022.',
  inputs: ['reg_shares'],
  fn: (reg_shares) => {
    const latest = reg_shares.reduce((m, r) => (r.month > m ? r.month : m), '');
    const now = reg_shares.find((r) => r.id === `state-OR-${latest}`);
    const then = reg_shares.find((r) => r.id === 'state-OR-2022-09');
    if (!now || !then) return [];
    const d = (f) => Math.round(10 * (now[f] - then[f])) / 10;
    return [{ id: 'OR', month: latest, total: now.total, D_pct: now.D_pct, R_pct: now.R_pct, NAV_pct: now.NAV_pct, gap: now.gap,
      total_chg: now.total - then.total, D_chg: d('D_pct'), R_chg: d('R_pct'), NAV_chg: d('NAV_pct'), gap_chg: d('gap') }];
  },
});

dash.calc('top_races', {
  title: 'Top races, 2026',
  description: 'Seats on the 2026 ballot that rate Toss-up or Lean, were decided by under 8 points last time, are open with a baseline within 15 points, or changed parties; ranked by the closer of baseline and last margin.',
  inputs: ['district_summary'],
  fn: (district_summary) => {
    const out = [];
    for (const o of district_summary) {
      if (o.chamber === 'county' || o.up2026 !== 'Yes') continue;
      const plain = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const last = plain(o.holder).split(' ').pop();
      const own = plain(o.holder_party === 'D' ? o.nominee_D : o.holder_party === 'R' ? o.nominee_R : '');
      const open = !!o.holder && !own.includes(last);
      const lm = o.last_margin == null ? null : Math.abs(o.last_margin);
      const score = Math.min(o.abs_baseline == null ? 99 : o.abs_baseline, lm == null ? 99 : lm);
      const against = o.baseline != null && o.holder_party && Math.abs(o.baseline) >= 1 && (o.baseline > 0 ? 'D' : 'R') !== o.holder_party;
      const reasons = [];
      if (o.rating === 'Toss-up' || o.rating.startsWith('Lean')) reasons.push(`${o.rating} on the statewide baseline`);
      if (lm != null && lm < 8) reasons.push(`Decided by ${lm.toFixed(1)} pts in ${o.last_year}`);
      if (against) reasons.push(`Held by ${o.holder_party} though the district leans ${o.baseline > 0 ? 'D' : 'R'}`);
      if (open && o.abs_baseline < 15) reasons.push('Open seat');
      if (o.party_switch) reasons.push('Incumbent changed parties');
      if (o.watch) reasons.push('Registration moving toward the trailing party');
      if (!(score < 8 || (open && o.abs_baseline < 15) || o.party_switch)) continue;
      out.push({
        key: o.key, chamber: o.chamber, district: o.district, score: Math.round(10 * score) / 10,
        rating: o.rating, baseline_label: o.baseline_label, last_label: o.last_label, pres_2024_label: o.pres_2024_label,
        reg_gap_label: o.reg_gap_label, shift_label: o.shift_label,
        holder: o.holder, holder_party: o.holder_party, open_seat: open ? 'Open seat' : '',
        nominee_D: o.nominee_D, nominee_R: o.nominee_R, reasons: reasons.join(' · '),
      });
    }
    return out.sort((a, b) => a.score - b.score).map((r, i) => ({ ...r, rank: i + 1 }));
  },
});
