// Stand-alone runtime for the public Oregon Election Atlas.
// Provides the small `dash` API the page scripts use, backed by static JSON files in /data,
// and polls for new election-night results every 60 seconds.
(function () {
  window.OEA_PUBLIC = true;
  const FILES = ['geo', 'registration', 'races', 'statewide', 'officeholders', 'nominees_2026', 'ballot_2026', 'finance', 'cd_counties',
    'live_races', 'live_results', 'live_feed', 'live_status', 'live_counties'];
  const LIVE = ['live_races', 'live_results', 'live_feed', 'live_status', 'live_counties'];
  const store = {}, failed = new Set(), calcs = [], cbs = [];
  // big, rarely needed files load the first time a page asks for them (precinct maps)
  const LAZY = ['precincts', 'precinct_results', 'precinct_notes'];
  const lazyStarted = new Set();
  // Analysis that stays in the private edition: ratings, trend flags, competitiveness counts.
  const PRIVATE_FIELDS = {
    district_summary: { rating: '', watch: '', abs_baseline: null },
    chamber_overview: { competitive: null, competitive_up: null, watch: null },
  };
  function compute() {
    for (const c of calcs) {
      if (!c.o.inputs.every((i) => store[i])) continue;
      let out = c.o.fn(...c.o.inputs.map((i) => store[i]));
      if (PRIVATE_FIELDS[c.id] && Array.isArray(out)) out = out.map((r) => ({ ...r, ...PRIVATE_FIELDS[c.id] }));
      store[c.id] = out;
    }
  }
  function fire() {
    try { compute(); } catch (e) { console.error(e); }
    for (const f of cbs) { try { f(); } catch (e) { console.error(e); } }
  }
  window.dash = {
    calc(id, o) { if (id !== 'top_races') calcs.push({ id, o }); },
    data(id) {
      if (LAZY.includes(id) && !store[id] && !lazyStarted.has(id)) {
        lazyStarted.add(id);
        load(id, false).then(fire).catch(() => { failed.add(id); });
      }
      if (store[id]) return { status: 'ok', data: store[id], columns: store[id][0] ? Object.keys(store[id][0]) : [] };
      return { status: failed.has(id) ? 'error' : 'loading', data: [] };
    },
    onData(fn) { cbs.push(fn); try { fn(); } catch (e) { console.error(e); } },
    // '#go-<tab>' never matches an element id, so the browser does not jump down the page to it on load
    setLink(name) { try { history.replaceState(null, '', '#go-' + name); } catch (e) { /* ignore */ } },
    params() { return {}; }, setParams() {}, resetParams() {}, refresh() {}, colors: [],
  };
  async function load(id, fresh) {
    const r = await fetch(`data/${id}.json${fresh ? `?t=${Date.now()}` : ''}`, { cache: fresh ? 'no-store' : 'default' });
    if (!r.ok) throw new Error(`${id}: ${r.status}`);
    store[id] = await r.json();
    failed.delete(id);
  }
  Promise.allSettled(FILES.map((id) => load(id, LIVE.includes(id)).catch(() => failed.add(id)))).then(() => {
    lastKey = JSON.stringify(store.live_status || null);
    fire();
  });
  let lastKey = null;
  async function poll() {
    try {
      const r = await fetch(`data/live_status.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const s = await r.json();
      const key = JSON.stringify(s);
      window.OEA_LAST_CHECK = new Date().toISOString();
      if (key !== lastKey) {
        lastKey = key;
        await Promise.all(LIVE.map((id) => load(id, true).catch(() => {})));
        fire();
      } else {
        const el = document.getElementById('pub-checked');
        if (el) el.textContent = `Page checked for new results at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      }
    } catch (e) { /* offline: try again next minute */ }
  }
  setInterval(poll, 60000);
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(fire, 200); });
})();
