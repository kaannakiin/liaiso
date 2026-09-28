import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: { port: 5180 },
  resolve: { tsconfigPaths: true },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        /**
         * Guard: the crawler follows every link, reads the response with `text()` and writes it
         * over the copy from `public/`, so a linked `.xlsx` sample was served as a corrupt zip.
         */
        filter: (page) => !page.path.startsWith("/samples/"),
      },
    }),
    viteReact(),
    tailwindcss(),
  ],
});
