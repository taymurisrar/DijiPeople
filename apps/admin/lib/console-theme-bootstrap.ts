/**
 * The theme, settled before the first paint.
 *
 * `ConsolePreferencesApplier` writes the theme attributes from a `useEffect`,
 * which runs *after* the browser has already painted. So every operator whose
 * preference is Dark saw a light flash on every full page load: the server
 * emitted no `data-admin-*` attribute, every dark rule in `globals.css` keys on
 * one, and the correction arrived only once React had hydrated.
 *
 * Two pieces close that gap, and they divide the work by what each side can
 * actually know.
 *
 * The **cookie** carries the preference across a boundary the API cannot: the
 * root layout sits outside the `(internal)` route group, above the code that
 * fetches `/platform-users/me/preferences`, so it has no way to ask. The cookie
 * is a rendering hint and nothing else — no decision is made from it, and a
 * forged value costs the forger a wrongly-coloured page.
 *
 * The **script** resolves `SYSTEM`, which the server cannot: that needs
 * `matchMedia`, and there is no such thing during SSR. It is deliberately tiny
 * and deliberately blocking, because anything deferred runs after the paint it
 * exists to precede.
 */

/** Read by the root layout, written by `applyConsolePreferences`. */
export const ADMIN_THEME_COOKIE = "dp-admin-theme";

/**
 * Runs in `<head>`, before anything paints.
 *
 * Written as a string rather than a module because it must be inline: a
 * `<script src>` is a network round trip, and a bundled one is deferred. It is
 * wrapped in try/catch because a browser that refuses `document.cookie` or
 * `matchMedia` must still render the console — light, which is the same outcome
 * as today, rather than a blank page.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{
var m=document.cookie.match(/(?:^|;\\s*)${ADMIN_THEME_COOKIE}=([^;]*)/);
var p=m?decodeURIComponent(m[1]):"system";
var d=p==="dark"||(p!=="light"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);
var r=document.documentElement;
r.dataset.adminScheme=d?"dark":"light";
if(p==="dark"||p==="light")r.dataset.adminTheme=p;else delete r.dataset.adminTheme;
}catch(e){}})();`;
