import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [
		cloudflare({
			miniflare: {
				// Disable inspector to prevent connection errors in CI/test environments
				inspector: false,
			},
		}),
	],
	resolve: {
		alias: {
			// Required for dev mode - pino (used by @atproto) doesn't work in Workers
			pino: "pino/browser.js",
		},
	},
});
