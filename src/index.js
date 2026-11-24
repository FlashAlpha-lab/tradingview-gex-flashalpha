import { mount } from './group.js';
import { chartEngineSource } from './source.js';
import { registerLayers, layerIds } from './registry.js';
import { setLicenseKey } from './plans.js';
import { PLANS } from './constants.js';

export { mount, chartEngineSource, registerLayers, setLicenseKey };

export const plans = PLANS;

export const version = typeof __FAC_VERSION__ !== 'undefined' ? __FAC_VERSION__ : '0.0.0-dev';

/** The object the script build puts on window.FlashAlphaChart. */
const FlashAlphaChart = {
  mount, chartEngineSource, registerLayers, setLicenseKey, plans,
  get layers() { return layerIds(); },
  version,
};

export default FlashAlphaChart;
