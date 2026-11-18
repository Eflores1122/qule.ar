import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, Vite hace de proxy al API para que todo quede en el mismo origen (cookies de sesión).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/socket.io": { target: "http://localhost:3001", ws: true },
    },
  },
});
