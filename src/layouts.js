/**
 * Chart layouts for a chart group (group.js), like TradingView's: 1 to 4 charts. `areas` is a CSS grid-template-areas,
 * one string per row, with a letter per chart in reading order (a = the first chart); `cols` / `rows` are the track sizes
 * in fr (default: equal). The toolbar's Layout menu draws each one from these (layoutIcon).
 */
export const LAYOUTS = [
  { id: '1', areas: ['a'] },
  { id: '2v', areas: ['a b'] },
  { id: '2h', areas: ['a', 'b'] },
  { id: '3v', areas: ['a b c'] },
  { id: '3h', areas: ['a', 'b', 'c'] },
  { id: '3l', areas: ['a b', 'a c'] },
  { id: '3r', areas: ['a c', 'b c'] },
  { id: '3t', areas: ['a b', 'c c'] },
  { id: '3b', areas: ['a a', 'b c'] },
  { id: '4', areas: ['a b', 'c d'] },
  { id: '4h', areas: ['a', 'b', 'c', 'd'] },
  { id: '4v', areas: ['a b c d'] },
  { id: '4l', areas: ['a b', 'a c', 'a d'] },
  { id: '4r', areas: ['a d', 'b d', 'c d'] },
  { id: '4t', areas: ['a a a', 'b c d'] },
  { id: '4b', areas: ['a b c', 'd d d'] },
  { id: '4lc', areas: ['a b c', 'a b d'] },
  { id: '4rc', areas: ['a c d', 'b c d'] },
  { id: '4tr', areas: ['a b', 'c c', 'd d'], rows: [2, 1, 1] },
].map(l => {
  const grid = l.areas.map(r => r.split(' '));
  const n = new Set(grid.flat()).size;
  return Object.assign({ n, cols: grid[0].map(() => 1), rows: grid.map(() => 1) }, l, { grid });
});

/** The most charts a group shows. */
export const MAX_CHARTS = 4;

export const layoutById = id => LAYOUTS.find(l => l.id === id) || LAYOUTS[0];

/** CSS grid properties for a layout. */
export function gridStyle(l) {
  return { gridTemplateAreas: l.areas.map(r => `"${r}"`).join(' '), gridTemplateColumns: l.cols.map(x => x + 'fr').join(' '),
    gridTemplateRows: l.rows.map(x => x + 'fr').join(' ') };
}

/** The grid letter of the i-th chart (0 = 'a'). */
export const areaOf = i => String.fromCharCode(97 + i);

/** A small outline of the layout: a rounded frame and one rectangle per chart (inline SVG, drawn in the text colour). */
export function layoutIcon(l, size = 18) {
  const W = 20, H = 16, x0 = 1, y0 = 1, w = W - 2, h = H - 2;
  const sum = a => a.reduce((s, v) => s + v, 0);
  const at = (tracks, i, len) => len * sum(tracks.slice(0, i)) / sum(tracks);
  let lines = '';
  for (const c of new Set(l.grid.flat())) {
    const rs = l.grid.map((r, i) => r.includes(c) ? i : -1).filter(i => i >= 0);
    const cs = l.grid[rs[0]].map((x, i) => x === c ? i : -1).filter(i => i >= 0);
    const x = x0 + at(l.cols, cs[0], w), y = y0 + at(l.rows, rs[0], h);
    const xe = x0 + at(l.cols, cs[cs.length - 1] + 1, w), ye = y0 + at(l.rows, rs[rs.length - 1] + 1, h);
    lines += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(xe - x).toFixed(2)}" height="${(ye - y).toFixed(2)}"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${size}" height="${Math.round(size * H / W)}" aria-hidden="true" focusable="false" fill="none" `
    + `stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="2.5"/>${lines}</svg>`;
}
