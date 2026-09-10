import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
export default defineConfig([
  ...next,
  {
    rules: {
      // Static export has no image optimization server; these are already-sized CDN assets.
      "@next/next/no-img-element": "off",
      // React Compiler is not enabled; its memo inference is not an application correctness rule.
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "src-tauri/**", "public/workers/**", "training/**"]),
]);
