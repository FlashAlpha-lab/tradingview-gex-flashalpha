import { levelsPlugin } from './plugins/levels.js';

/** Layers every chart has: the core GEX levels. */
const builtins = [levelsPlugin];
const plugins = [];

/** Adds layers to charts mounted after this call. See docs/plugins.md for the plugin shape. */
export function registerLayers(plugin) {
  if (!plugin || !Array.isArray(plugin.layers) || typeof plugin.attach !== 'function')
    throw new Error('registerLayers expects { layers: [[id, label]], attach(ctx) }');
  plugins.push(plugin);
}

/** The built-in plugins, then the registered ones, in order. */
export const activePlugins = () => builtins.concat(plugins);

/** Every layer id a chart mounted now would offer. */
export const layerIds = () => activePlugins().flatMap(p => p.layers).map(l => l[0]);
