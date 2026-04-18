import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/**/*.test.js", "src/**/*.test.js"],
    environment: "jsdom",
  },
});
