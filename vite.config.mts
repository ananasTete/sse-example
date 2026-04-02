import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

const APP_PORT = Number(process.env.PORT ?? 3673);

export default defineConfig({
  server: {
    port: APP_PORT,
    strictPort: true,
    watch: {
      ignored: ["**/src/routeTree.gen.ts"],
    },
  },
  preview: {
    port: APP_PORT,
    strictPort: true,
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      srcDirectory: "src",
      router: {
        routesDirectory: "./routes",
        generatedRouteTree: "./routeTree.gen.ts",
        plugin: {
          vite: {
            environmentName: "client",
          },
        },
      },
    }),
    react(),
  ],
});
