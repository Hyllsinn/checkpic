import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 8080 },
  test: { environment: "happy-dom" },
} as Parameters<typeof defineConfig>[0]);
