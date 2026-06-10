import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/jobs": "http://localhost:3000",
      "/api": "http://localhost:3000",
      "/setup": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
