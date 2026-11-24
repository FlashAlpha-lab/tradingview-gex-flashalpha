/** The page's window in a browser, globalThis elsewhere (tests, server-side rendering). */
export const global = typeof window !== 'undefined' ? window : globalThis;
