import { PLAN_NAMES, PLAN_PITCH } from '../constants.js';
import { planRank } from '../plans.js';
import { esc } from '../util.js';

/**
 * "Upgrade" over the chart while a layer that is on needs a higher plan than the key's: names them and the lowest plan.
 * Without a key it says "Sign up free" and links to signupUrl, like the legend's "Not in your plan" line.
 * Hidden for now: shown only with options.upsell: true (the locks in the Indicators menu link to the pricing page).
 */
export function createUpsell(view) {
  const box = view.$('.fac-upsell');
  function render() {
    if (!view.o.upsell) { box.hidden = true; return; }
    const { layerPlan, layerList } = view;
    const wanted = [...view.state.layers].filter(view.locked);
    if (!wanted.length) { box.hidden = true; return; }
    const need = wanted.map(k => layerPlan[k]).sort((a, b) => planRank(a) - planRank(b))[0];
    const names = layerList.filter(([k]) => wanted.includes(k) && layerPlan[k] === need).map(([, l]) => l);
    box.innerHTML = `<span>🔒 ${esc(names.slice(0, 2).join(', '))}${names.length > 2 ? ` +${names.length - 2}` : ''}</span>`
      + (PLAN_PITCH[need] ? `<span class="pitch">${esc(PLAN_PITCH[need])}</span>` : '')
      + `<span class="plan">${esc(PLAN_NAMES[need] || need)}</span>`
      + (view.state.noKey
        ? `<a href="${esc(view.signupHref('upsell'))}" ${view.ctaAttrs('upsell', 'signup')} target="_blank" rel="noopener">Sign up free</a>`
        : `<a href="${esc(view.upgradeHref(wanted[0]))}" ${view.ctaAttrs(wanted[0])} target="_blank" rel="noopener">Upgrade</a>`);
    box.hidden = false;
  }
  return { render };
}
