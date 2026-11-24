import { ET } from './constants.js';

// lightweight-charts places day and month ticks on UTC boundaries, so every time handed to it is ET wall-clock
// written as if it were UTC ("ET-as-UTC" seconds), and the formatters read it back in UTC.
export const fmtTime = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
export const fmtClock = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', minute: 'numeric', hour12: false });
const etParts = new Intl.DateTimeFormat('en-US', { timeZone: ET, year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false });

/** UTC ISO timestamp → ET wall-clock seconds labelled as UTC. */
export function etTime(iso) {
  const p = Object.fromEntries(etParts.formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) / 1000;
}

/** The ET date (yyyy-mm-dd) of a chart time. */
export const dayOf = t => new Date(t * 1000).toISOString().slice(0, 10);

/** 'pre', 'rth' or 'post' for a chart time (ET-as-UTC seconds). */
export function sessionOf(t) {
  const [h, m] = fmtClock.format(new Date(t * 1000)).split(':').map(Number);
  const mins = h * 60 + m;
  return mins < 570 ? 'pre' : mins >= 960 ? 'post' : 'rth';
}
