import js from "@eslint/js";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".next/**", "dist/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@next/next": next, "jsx-a11y": jsxA11y, "react-hooks": reactHooks },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
      ...jsxA11y.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off"
    }
  }
);
