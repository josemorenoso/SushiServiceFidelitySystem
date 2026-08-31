import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // AIOS Constelarys: proyecto SEPARADO (repo y Supabase propios), con su
    // propio tsconfig y su propio eslint. Vive aquí solo como carpeta de
    // trabajo y está en .gitignore. Sin esta línea, `npm run lint` recorre sus
    // fuentes Y su node_modules: ~11.700 problemas ajenos que sepultan los
    // propios. Mismo motivo por el que se excluye en tsconfig.json.
    "Level 2.0/**",
    "**/node_modules/**",
  ]),
]);

export default eslintConfig;
