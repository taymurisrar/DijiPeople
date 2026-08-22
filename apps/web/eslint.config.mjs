import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * `jsx-a11y` rules are turned on explicitly.
 *
 * `apps/web/AGENTS.md` has always required labelled controls, focus-trapped
 * dialogs and keyboard-navigable tables, and none of the three held: the app
 * had 22 `htmlFor` against 193 raw `<input>` and 99 raw `<select>`, no modal
 * trapped focus, and the primary list interaction — opening a record — was
 * mouse-only. The rule existed; nothing enforced it. BUG-0043.
 *
 * The plugin ships with `eslint-config-next` already, so this adds no
 * dependency — Next registers it and then enables almost none of it. The rules
 * below are the ones that catch the class of defect actually found, set to
 * `error` so they cannot accumulate as warnings the way this did.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    // No `plugins` key: `eslint-config-next` already registers `jsx-a11y`, and
    // redefining a registered plugin is a flat-config error. It registers it
    // without turning the recommended set on, which is the gap below closes.
    rules: {
      // A control with no accessible name is invisible to a screen reader,
      // whatever its placeholder says.
      "jsx-a11y/label-has-associated-control": [
        "error",
        { assert: "either", depth: 3 },
      ],
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      // The clickable-<tr> shape: an interaction the keyboard cannot reach.
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/no-autofocus": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
