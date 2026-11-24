// Compiled by `npm run lint:types` only: the declarations as a TypeScript user would call them.
import FlashAlphaChart, { mount, registerLayers, type LayerPlugin } from '../types/index';
import * as LightweightCharts from 'lightweight-charts';
const plugin: LayerPlugin = {
  indicator: 'GEX Levels',
  layers: [['vwap', 'VWAP']],
  plots: [{ id: 'vwap', title: 'VWAP', layer: 'vwap', color: '#4fc3f7', priceLine: false }],
  attach(ctx) {
    let line = ctx.level('#fff', 'x', 'vwap');
    const other = ctx.bindPlot('vwap', ctx.chart.addSeries(ctx.LW.LineSeries, {}));
    const width: number = ctx.styleOf('vwap').lineWidth;
    return {
      draw() { line.setData(ctx.bars.map(b => ({ time: b.time as any, value: b.close ?? 0 }))); other.setData([]); },
      legendLevels(row, parts, prev) { parts.push({ label: 'VWAP', value: width, prev: null, plot: 'vwap' }, 'text'); },
    };
  },
};
registerLayers(plugin);
const c = mount(document.body, { symbol: 'SPX', lightweightCharts: LightweightCharts, theme: 'auto', styles: { callWall: { color: '#0f0', lineStyle: 'dashed' } } });
c.setLayers(['levels']).then(() => c.chart.timeScale().fitContent());
c.setStyle('putWall', { visible: false });
const color: string = c.styles.callWall.color;
const ids: string[] = FlashAlphaChart.layers;
