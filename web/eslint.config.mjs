import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// A Tailwind arbitrary colour: bg-[#121416], text-[#fff]/50. Colours come from the theme tokens in globals.css.
const ARBITRARY_HEX = String.raw`-\[#[0-9a-fA-F]{3,8}\]`;
const STORAGE = "Nothing goes to browser storage: input pixels never leave memory, and the theme lives in dh-theme.js's cookie.";

/** The rules CLAUDE.md's "Must never happen" table names. Each message says the rule, so a failure explains itself. */
const houseRules = {
  files: ["src/**/*.{ts,tsx}"],
  rules: {
    // Markdown renders as React elements; raw HTML would need a CSP source the page does not have.
    "react/no-danger": "error",
    "no-restricted-imports": ["error", { paths: [{ name: "rehype-raw", message: "Markdown renders as React elements: no raw HTML (CSP)." }] }],
    // The production CSP blocks a server-rendered style attribute. Set styles from the client after mount.
    "react/forbid-dom-props": ["error", { forbid: [{ propName: "style", message: "The CSP blocks a server-rendered style attribute; set it from the client (see placeBeside)." }] }],
    "no-restricted-syntax": [
      "error",
      { selector: `Literal[value=/${ARBITRARY_HEX}/]`, message: "Use a theme token class, not a raw hex colour." },
      { selector: `TemplateElement[value.raw=/${ARBITRARY_HEX}/]`, message: "Use a theme token class, not a raw hex colour." },
    ],
    "no-restricted-globals": ["error", { name: "localStorage", message: STORAGE }, { name: "sessionStorage", message: STORAGE }],
    "no-restricted-properties": [
      "error",
      { object: "window", property: "localStorage", message: STORAGE },
      { object: "window", property: "sessionStorage", message: STORAGE },
      { object: "globalThis", property: "localStorage", message: STORAGE },
      { object: "globalThis", property: "sessionStorage", message: STORAGE },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  houseRules,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
