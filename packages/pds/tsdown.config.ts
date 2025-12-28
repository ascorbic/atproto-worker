import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: { index: "src/index.ts" },
		format: ["esm"],
		fixedExtension: false,
		dts: true,
		external: [/^cloudflare:/],
	},
	{
		entry: { cli: "src/cli/index.ts" },
		format: ["esm"],
		fixedExtension: false,
		outDir: "dist",
	},
]);
