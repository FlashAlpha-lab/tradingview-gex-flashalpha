import { LINE_STYLES, THEMES } from '../constants.js';
import { fmtClock } from '../time.js';
import { LevelsOverlay, levelRuns, pct, regimeRuns } from './levels-overlay.js';

/** The indicator (Indicators menu group) the core layers belong to; layer plugins join it with the same `indicator` name. */
export const CORE_INDICATOR = 'GEX Levels';

/** Daily levels are computed on all expiries and settled open interest only: not drawn under a 0DTE or live-flow query. */
const dailyQuery = q => (q.scope || 'all') === 'all' && (q.basis || 'settled') === 'settled';

/**
 * The walls a candle can close through: the call wall when it closes above it, the put wall when it closes below it.
 * The marker sits on the side the price broke out to. `broken`: the plot that shows the breaks (off by default).
 */
const WALLS = [
  { id: 'callWall', broken: 'callWallBroken', field: 'call_wall', title: 'Call wall', through: (close, wall) => close > wall, position: 'aboveBar', shape: 'arrowUp' },
  { id: 'putWall', broken: 'putWallBroken', field: 'put_wall', title: 'Put wall', through: (close, wall) => close < wall, position: 'belowBar', shape: 'arrowDown' },
];

/** The lines that get an edge label when out of view: plot id and title. */
const LEVEL_TITLES = [['callWall', 'Call wall'], ['putWall', 'Put wall'], ['flip', 'Gamma flip'], ['maxPain', 'Max pain']];

/** The lines the overlay draws as flat segments (no vertical step): their series only keep the price line and axis label. */
const FLAT = ['callWall', 'putWall', 'flip', 'maxPain'];

/** The walls and the flip: their price line, axis label and edge label show only while the latest session is in view. */
const LATEST_ONLY = ['callWall', 'putWall', 'flip'];

/** A colour at 35 % opacity (#rgb, #rrggbb, rgb() or rgba()); any other colour as it is. */
export function faded(c) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c || '');
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1];
    return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, 0.35)`;
  }
  const rgb = /^rgba?\(\s*([^,\s]+)\s*,\s*([^,\s]+)\s*,\s*([^,\s)]+)/i.exec(c || '');
  return rgb ? `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0.35)` : c;
}

/**
 * The core GEX layers, written as a layer plugin (the same shape as FlashAlphaChart.registerLayers takes) and always
 * registered first:
 *   levels   call wall, put wall, gamma flip (in the "unverified" colour when the flip is not certified)
 *   maxpain  max pain
 * A level is a step line through the day (where the wall or the flip stood at each bar; a gap where it is unknown), cut
 * between sessions (no step from one session's level to the next), and a dotted line at its latest value across the chart
 * (ctx.level). Each line is a plot: its colour, width, style and visibility are set in the indicator's Settings (Style
 * tab). The default colours and styles are those of the GEX-by-strike chart (@flashalpha-lab/gex-charts): walls solid,
 * flip and max pain dashed, an unverified flip in the flip colour at 45 %.
 * The walls, the flip and max pain are drawn by the overlay instead, as flat segments (one per run of the same value, cut
 * between sessions, never a vertical step), 2 px by default; their series keep the line across the chart and the axis
 * label, the walls' and the flip's only while the latest session is in view. Intraday, with
 * the levels or max pain on, the session under the crosshair stands out (the overlay veils the other sessions).
 * Both layers also draw the daily levels (the API's levels_daily rows) on 1d/1w: each session gets the previous session's
 * close levels as a dashed step. Intraday the walls and the flip come from the exposure rows only; max pain keeps the daily
 * value before the first intraday row that has one (the sampler's rows leave it NULL), "(daily)" in the legend. The legend
 * calls them "Daily levels". Only with all expiries and settled OI (query scope/basis).
 * On the candles' pane (levels-overlay.js) the gamma regime is tinted either side of the flip, and a level outside the
 * visible price range gets a label pinned to the top or bottom edge. The legend gives each wall and the flip its distance
 * from spot, "Call wall 750.00 (+4.6%)".
 * A wall a candle closes through (the call wall closed above, the put wall closed below) is broken for the rest of the
 * session: its line is faded from that bar on, a marker "Put wall broken 10:30" sits on the bar, and the legend reads
 * "Put wall 730.00 (broken)" from that bar on. A new session, or a new wall value, starts unbroken. Shown only with the
 * wall's "broken" plot on (Style tab: "Call wall broken", "Put wall broken"; off by default, the marker in its colour).
 */
export const levelsPlugin = {
  indicator: CORE_INDICATOR,
  layers: [['levels', 'Walls & gamma flip'], ['maxpain', 'Max pain']],
  defaults: ['levels'],
  plans: { levels: 'basic', maxpain: 'basic' },
  plots: [
    { id: 'callWall', title: 'Call wall', layer: 'levels', color: '#059669', lineWidth: 2 },
    { id: 'putWall', title: 'Put wall', layer: 'levels', color: '#f84040', lineWidth: 2 },
    { id: 'flip', title: 'Gamma flip', layer: 'levels', color: '#fbbf24', lineStyle: 'dashed', lineWidth: 2 },
    { id: 'flipUnverified', title: 'Gamma flip (unverified)', layer: 'levels', color: 'rgba(251,191,36,0.45)', colorOnly: true },
    { id: 'callWallBroken', title: 'Call wall broken', layer: 'levels', color: '#059669', visible: false, toggle: true },
    { id: 'putWallBroken', title: 'Put wall broken', layer: 'levels', color: '#f84040', visible: false, toggle: true },
    { id: 'maxPain', title: 'Max pain', layer: 'maxpain', color: '#a78bfa', lineStyle: 'dashed', lineWidth: 2 },
  ],
  apiLayers(ctx) {
    if (!['levels', 'maxpain'].some(ctx.on)) return [];
    const out = ctx.intraday() ? ['exposure'] : [];
    if (dailyQuery(ctx.query)) out.push('levels_daily');
    return out;
  },
  attach(ctx) {
    const { LW } = ctx;
    const { dayOf } = ctx.util;
    const flip = e => e.gamma_flip || {};
    const color = id => ctx.styleOf(id).color;
    let s = null, daily = null, markers = null, overlay = null;
    /** The daily row drawn at each bar time (see drawDaily), and where each daily line hands over to the intraday one. */
    let dailyByTime = new Map(), dailyCut = {};
    /** Per wall id: "day|wall value" → chart time of the first candle that closed through that wall in that session. */
    let broken = {};
    /** The wall's breaks are shown: its "broken" plot is on. */
    const showBreaks = w => ctx.styleOf(w.broken).visible !== false;
    /** True when the wall of row `e` was broken at or before `e`'s bar (and its breaks are shown). */
    const isBroken = (w, e) => {
      if (!showBreaks(w)) return false;
      const t = broken[w.id] && broken[w.id].get(dayOf(e.time) + '|' + e[w.field]);
      return t != null && e.time >= t;
    };
    /** The first close through each wall, session by session, over the candles that have an exposure row. */
    function findBreaks() {
      const rows = new Map(ctx.exposure.map(e => [e.time, e]));
      broken = {};
      for (const w of WALLS) broken[w.id] = new Map();
      for (const b of ctx.bars) {
        const e = rows.get(b.time);
        if (!e || b.close == null) continue;
        for (const w of WALLS) {
          const key = dayOf(b.time) + '|' + e[w.field];
          if (e[w.field] != null && w.through(b.close, e[w.field]) && !broken[w.id].has(key)) broken[w.id].set(key, b.time);
        }
      }
    }
    /** A new session starts between points a and b: a level line never runs on across it. */
    const newSession = (a, b) => dayOf(a.time) !== dayOf(b.time);

    /**
     * The overlay segments of a FLAT line (hidden plot: none): one per run of the same value, in the plot's colour (or
     * the point's), width and style; `style` overrides the plot's (the daily levels are dashed).
     */
    function flatLines(id, points, split, style) {
      const st = ctx.styleOf(id);
      if (st.visible === false) return [];
      const width = Number(st.lineWidth) || 1, ls = style ?? LINE_STYLES[st.lineStyle] ?? 0;
      return levelRuns(points.map(p => ({ time: p.time, value: p.value, color: p.color || st.color })), split)
        .map(r => Object.assign(r, { width, style: ls }));
    }

    /** Every session of the bars: [{ from, to }] (chart times of its first and last bar). */
    function sessions() {
      const days = [];
      for (const b of ctx.bars) {
        const d = days[days.length - 1];
        if (d && dayOf(d.to) === dayOf(b.time)) d.to = b.time;
        else days.push({ from: b.time, to: b.time });
      }
      return days;
    }

    /**
     * The session in focus: intraday, with the levels or max pain on and more than one session, the one under the
     * crosshair (the overlay veils the others); null off the chart.
     */
    let focusable = [], focus = null;
    function setFocus(f) {
      if (f === focus) return;
      focus = f;
      overlay.set({ focus });
    }

    /**
     * The walls' and the flip's price line, axis label and edge label show only while a bar of the latest session is in view (scrolled
     * back past it they would mark a level of another day). Applied when that changes, and with `force` again while
     * hidden (a style change puts the plot's own settings back).
     */
    let latestShown = true;
    function syncLatest(force) {
      const bars = ctx.bars, last = bars[bars.length - 1];
      const r = last ? ctx.chart.timeScale().getVisibleRange() : null;
      let shown = true;
      if (r) {
        let i = bars.length - 1;
        while (i > 0 && !newSession(bars[i - 1], last)) i--;
        shown = r.to >= bars[i].time;
      }
      if (shown === latestShown && (shown || !force)) return;
      latestShown = shown;
      for (const id of LATEST_ONLY) {
        const st = ctx.styleOf(id);
        s[id].applyOptions({ priceLineVisible: st.priceLine && shown, lastValueVisible: st.axisLabel && shown });
      }
      overlay.set({ hidden: shown ? [] : LATEST_ONLY });
    }

    /**
     * Each session gets the close levels of the session before it (the levels going into its open). On 1d/1w on every bar;
     * intraday the walls and the flip not at all (the exposure rows draw them). Max pain intraday until the first exposure
     * point that has one: the sampler's rows leave it NULL all day, and settled-OI max pain is the same all session. A
     * session whose previous session has no ok row gets a gap, never an older row.
     */
    function drawDaily(rows) {
      dailyByTime = new Map();
      const days = (rows || []).map(r => Object.assign({}, r, { day: String(r.ts).slice(0, 10) })).sort((a, b) => a.day < b.day ? -1 : 1);
      const exposure = ctx.exposure;
      dailyCut = { gex: ctx.intraday() ? -Infinity : Infinity,
        maxPain: Math.min(Infinity, ...exposure.filter(e => e.max_pain != null).map(e => e.time)) };
      const end = Math.max(dailyCut.gex, dailyCut.maxPain);
      let i = -1, day = null, prev = null, row = null;
      for (const b of ctx.bars) {
        if (b.time >= end) break;
        if (dayOf(b.time) !== day) {
          prev = day; day = dayOf(b.time);
          while (i + 1 < days.length && days[i + 1].day < day) i++;
          row = i >= 0 && (prev == null || days[i].day >= prev) && (days[i].status || 'ok') === 'ok' ? days[i] : null;
        }
        if (row) dailyByTime.set(b.time, row);
      }
      // Dashed, in the colour of the intraday plot; hidden with it.
      const pts = (show, id, until, pick, paint) => {
        const st = ctx.styleOf(id);
        daily[id].applyOptions({ color: st.color, visible: st.visible !== false });
        return !show ? [] : ctx.bars.map(b => {
          const r = b.time < until ? dailyByTime.get(b.time) : null, v = r ? pick(r) : null;
          return v == null ? { time: b.time } : paint ? { time: b.time, value: v, color: paint(r) } : { time: b.time, value: v };
        });
      };
      const out = {
        flip: pts(ctx.on('levels'), 'flip', dailyCut.gex, r => r.gamma_flip,
          r => r.gamma_flip_status === 'available' ? color('flip') : color('flipUnverified')),
        callWall: pts(ctx.on('levels'), 'callWall', dailyCut.gex, r => r.call_wall),
        putWall: pts(ctx.on('levels'), 'putWall', dailyCut.gex, r => r.put_wall),
        maxPain: pts(ctx.on('maxpain'), 'maxPain', dailyCut.maxPain, r => r.max_pain),
      };
      for (const [id, data] of Object.entries(out)) daily[id].setData(data);
      return out;
    }

    /** The latest value of each line drawn (the intraday one, else the daily one), for the edge labels; hidden plots left out. */
    function latestLevels(drawn, dailyDrawn, now) {
      const last = data => { for (let i = data.length - 1; i >= 0; i--) if (data[i].value != null) return data[i].value; return null; };
      // The newest row's value first: a session's first row is drawn as a gap, but its level is the current one.
      const pick = id => drawn[id].length ? (now[id] ?? last(drawn[id])) : last(dailyDrawn[id]);
      return LEVEL_TITLES.filter(([id]) => ctx.styleOf(id).visible !== false).map(([id, title]) => {
        const value = pick(id);
        return value == null ? null : { id, title, value, color: id === 'flip' && !now.flipOk ? color('flipUnverified') : color(id) };
      }).filter(Boolean);
    }

    return {
      // After the candles, so the levels are drawn over them. The price-scale labels use the names of the menu and the
      // legend ("Call wall", not "call wall"). The daily levels come first, without a title or a line across the chart, so
      // they read as the backdrop of the intraday levels. Like the intraday levels, they do not drive the price scale.
      ready() {
        const dailyLevel = c => ctx.chart.addSeries(LW.LineSeries, { color: c, lineWidth: 1, lineStyle: LW.LineStyle.Dashed,
          lineType: LW.LineType.WithSteps, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => null });
        daily = { flip: dailyLevel(color('flip')), callWall: dailyLevel(color('callWall')), putWall: dailyLevel(color('putWall')),
          maxPain: dailyLevel(color('maxPain')) };
        // the short titles where the full ones do not fit (phones, a panel at the pane's right edge): the levels' tags
        s = { flip: ctx.level(color('flip'), 'Gamma flip', 'flip', 'Flip'), callWall: ctx.level(color('callWall'), 'Call wall', 'callWall', 'CW'),
          putWall: ctx.level(color('putWall'), 'Put wall', 'putWall', 'PW'), maxPain: ctx.level(color('maxPain'), 'Max pain', 'maxPain', 'MP') };
        // The overlay draws the walls', the flip's and max pain's lines (flat, no vertical step): their series draw none.
        for (const id of FLAT) for (const x of [s[id], daily[id]]) x.applyOptions({ lineVisible: false });
        markers = LW.createSeriesMarkers(ctx.candles, []);
        overlay = new LevelsOverlay(() => {
          const st = ctx.root.style;
          return { light: st.getPropertyValue('--fac-text').trim() === THEMES.light.text,
            bg: st.getPropertyValue('--fac-bg').trim() || THEMES.dark.bg, right: ctx.reservedRight || 0 };
        });
        ctx.candles.attachPrimitive(overlay);
        ctx.chart.timeScale().subscribeVisibleLogicalRangeChange(() => syncLatest(false));
      },
      draw(c) {
        const rows = ctx.exposure;
        // The first row of a session after another one is a gap (with `cut`): the line does not step from one session's
        // level to the next. The overlay's flat lines take every row (they are cut per session themselves).
        const pts = (show, pick, paint, cut = true) => !show ? [] : rows.map((e, i) => {
          if (cut && i > 0 && dayOf(e.time) !== dayOf(rows[i - 1].time)) return { time: e.time };
          const v = pick(e), col = v != null && paint ? paint(e) : null;
          return v == null ? { time: e.time } : col ? { time: e.time, value: v, color: col } : { time: e.time, value: v };
        });
        findBreaks();
        const wall = (w, cut) => pts(ctx.on('levels'), e => e[w.field], e => isBroken(w, e) ? faded(color(w.id)) : null, cut);
        const flipPts = cut => pts(ctx.on('levels'), e => flip(e).last,
          e => flip(e).status === 'available' ? color('flip') : color('flipUnverified'), cut);
        const drawn = {
          flip: flipPts(), callWall: wall(WALLS[0]), putWall: wall(WALLS[1]), maxPain: pts(ctx.on('maxpain'), e => e.max_pain),
        };
        for (const [id, data] of Object.entries(drawn)) s[id].setData(data);
        const flat = { flip: flipPts(false), callWall: wall(WALLS[0], false), putWall: wall(WALLS[1], false),
          maxPain: pts(ctx.on('maxpain'), e => e.max_pain, null, false) };
        // A marker on the bar that closed through a wall (none for a hidden wall, or with its breaks off), in time order as
        // lightweight-charts wants.
        markers.setMarkers(!ctx.on('levels') ? [] : WALLS.filter(w => ctx.styleOf(w.id).visible !== false && showBreaks(w))
          .flatMap(w => [...broken[w.id].values()].map(t => ({ time: t, position: w.position, shape: w.shape, color: color(w.broken),
            text: `${w.title} broken ${fmtClock.format(new Date(t * 1000))}` })))
          .sort((a, b) => a.time - b.time));
        // levels_daily also comes for a plugin's daily values (net GEX pane): the daily levels are drawn only with their layers on.
        const dailyDrawn = drawDaily(ctx.query && dailyQuery(ctx.query) && c && ['levels', 'maxpain'].some(ctx.on) ? c.levels_daily : []);
        // The regime either side of the flip (intraday rows, else the daily flips on 1d/1w), and the edge labels.
        const showRegime = ctx.on('levels') && ctx.styleOf('flip').visible !== false;
        const flips = rows.length ? rows.map(e => ({ time: e.time, flip: flip(e).last })) : dailyDrawn.flip.map(p => ({ time: p.time, flip: p.value }));
        const last = ctx.bars[ctx.bars.length - 1];
        const lastRow = rows[rows.length - 1], lastDaily = [...dailyByTime.values()].pop();
        const now = lastRow ? { flip: flip(lastRow).last, callWall: lastRow[WALLS[0].field], putWall: lastRow[WALLS[1].field],
          maxPain: lastRow.max_pain, flipOk: flip(lastRow).status === 'available' || flip(lastRow).last == null }
          : { flipOk: !lastDaily || lastDaily.gamma_flip_status === 'available' || lastDaily.gamma_flip == null };
        // The levels as flat segments, cut per session intraday (the daily max pain too); the daily levels dashed.
        const dailySplit = ctx.intraday() ? newSession : undefined, days = sessions();
        const lines = FLAT.flatMap(id => [...flatLines(id, flat[id], newSession), ...flatLines(id, dailyDrawn[id], dailySplit, LINE_STYLES.dashed)]);
        overlay.set({ runs: showRegime ? regimeRuns(flips) : [], levels: latestLevels(drawn, dailyDrawn, now), spot: last ? last.close : null,
          lines });
        syncLatest(true);
        // A redraw keeps the session in focus (by its first bar), or drops it when it is gone.
        focusable = ctx.intraday() && ['levels', 'maxpain'].some(ctx.on) && days.length > 1 ? days : [];
        setFocus(focus && focusable.find(d => d.from === focus.from) || null);
      },
      clear() {
        dailyByTime = new Map(); dailyCut = {}; broken = {};
        for (const x of [...Object.values(s), ...Object.values(daily)]) x.setData([]);
        markers.setMarkers([]);
        focusable = []; focus = null;
        overlay.set({ runs: [], levels: [], spot: null, lines: [], focus: null });
      },
      /** True when the last draw has daily levels: on 1d/1w the chart then has levels to show (no "pick 1m to 1h" note). */
      hasDaily: () => dailyByTime.size > 0,
      // The session under the crosshair stands out: the overlay veils the other sessions (none off the chart).
      crosshair(time) {
        setFocus(time == null ? null : focusable.find(d => time >= d.from && time <= d.to) || null);
      },
      // The indicator's line in the legend: { label, value, prev, plot } items (change vs the previous
      // session; the value in the plot's colour, left out while the plot is hidden). A wall broken at or before the bar
      // reads "(broken)".
      legendLevels(g, parts, prev) {
        const f = flip(g), pf = (prev && prev.gamma_flip) || {}, ok = f.status === 'available' || f.last == null;
        // The distance from spot, then "broken" for a wall a candle has closed through: "Put wall 730.00 (−1.9%, broken)".
        const spot = g.spot && g.spot.last;
        const note = (value, w) => [pct(value, spot), w && isBroken(w, g) ? 'broken' : ''].filter(Boolean).join(', ') || undefined;
        // The walls and the flip only while Walls & gamma flip is on (max pain below, while Max pain is on).
        if (ctx.on('levels')) parts.push(
          { label: 'Call wall', value: g.call_wall, prev: prev && prev.call_wall, plot: 'callWall', note: note(g.call_wall, WALLS[0]) },
          { label: 'Put wall', value: g.put_wall, prev: prev && prev.put_wall, plot: 'putWall', note: note(g.put_wall, WALLS[1]) },
          { label: ok ? 'Gamma flip' : 'Gamma flip (unverified)', value: f.last, prev: pf.last, plot: 'flip',
            color: ok ? undefined : color('flipUnverified'), note: note(f.last) },
        );
        // A row without max pain (the sampler's settled rows) shows the daily max pain drawn at that bar, "(daily)".
        const dm = g.max_pain == null && g.time < dailyCut.maxPain ? dailyByTime.get(g.time) : null;
        if (ctx.on('maxpain') && dm && dm.max_pain != null) parts.push({ label: 'Max pain (daily)', value: dm.max_pain, plot: 'maxPain' });
        else if (ctx.on('maxpain')) parts.push({ label: 'Max pain', value: g.max_pain, prev: prev && prev.max_pain, plot: 'maxPain' });
      },
    };
  },
};
