import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Relative base so the bundle works from any GitHub Pages sub-path.
export default defineConfig({
  base: "./",
  plugins: [svelte()],
});
