/** Public address used in share links. Defaults to wherever the site is served from. */
export const SITE_URL: string =
  import.meta.env.VITE_SITE_URL || (typeof location !== 'undefined' ? location.origin : '');
