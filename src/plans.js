import { PLANS } from './constants.js';
import { global } from './env.js';

/** Index of a plan name in PLANS; an unknown name counts as the lowest. */
export const planRank = p => Math.max(0, PLANS.indexOf(String(p || '').toLowerCase()));

/** Default key for every chart mounted later (setLicenseKey); options.apiKey wins. */
let licenseKey = null;

/** The key every chart mounted after this call uses when options.apiKey is not given. */
export function setLicenseKey(key) { licenseKey = key || null; }

export const getLicenseKey = () => licenseKey;

/** The upgrade (or sign-up: campaign 'signup') link, tagged so flashalpha.com can count where buyers came from. */
export function upgradeHref(upgradeUrl, what, campaign = 'upgrade') {
  const u = new URL(upgradeUrl, global.location ? global.location.href : undefined);
  u.searchParams.set('utm_source', 'chart'); u.searchParams.set('utm_medium', 'embed'); u.searchParams.set('utm_campaign', campaign);
  if (what) u.searchParams.set('utm_content', what);
  if (global.location && global.location.hostname) u.searchParams.set('utm_term', global.location.hostname);
  return u.toString();
}
