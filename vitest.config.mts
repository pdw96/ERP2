import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // DB 시험은 PGlite 를 처음 띄울 때 몇 초가 걸린다.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
