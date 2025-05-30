import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		port: 5173,
		host: true
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@/components": path.resolve(__dirname, "./src/components"),
			"@/utils": path.resolve(__dirname, "./src/utils"),
			"@/types": path.resolve(__dirname, "./src/types"),
			"@/stores": path.resolve(__dirname, "./src/stores"),
			"@/services": path.resolve(__dirname, "./src/services")
		}
	}
});
