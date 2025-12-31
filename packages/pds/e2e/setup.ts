import type { ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

let serverProcess: ChildProcess;
let tempDir: string;

function runCommand(
	cmd: string,
	args: string[],
	cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		const proc = spawn(cmd, args, { cwd, shell: true });
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (data) => (stdout += data));
		proc.stderr.on("data", (data) => (stderr += data));
		proc.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
	});
}

export async function setup() {
	// Create tmp dir
	tempDir = await mkdtemp(join(tmpdir(), "pds-e2e-"));
	console.log(`Creating e2e test fixture in: ${tempDir}`);

	// Path to the pds package (one level up from e2e/)
	const pdsPackagePath = resolve(__dirname, "..");

	// Create src directory
	await mkdir(join(tempDir, "src"), { recursive: true });

	// Write src/index.ts - re-export from the package
	await writeFile(
		join(tempDir, "src/index.ts"),
		`export { default, AccountDurableObject } from "@ascorbic/pds";\n`,
	);

	// Write package.json with file: reference to local pds package
	await writeFile(
		join(tempDir, "package.json"),
		JSON.stringify(
			{
				name: "pds-e2e-test",
				version: "1.0.0",
				type: "module",
				private: true,
				dependencies: {
					"@ascorbic/pds": `file:${pdsPackagePath}`,
				},
				devDependencies: {
					"@cloudflare/vite-plugin": "^1.17.0",
					vite: "^6.4.1",
					wrangler: "^4.54.0",
				},
			},
			null,
			"\t",
		),
	);

	// Write wrangler.jsonc
	await writeFile(
		join(tempDir, "wrangler.jsonc"),
		JSON.stringify(
			{
				name: "pds-e2e-test",
				main: "src/index.ts",
				compatibility_date: "2025-01-01",
				compatibility_flags: ["nodejs_compat"],
				durable_objects: {
					bindings: [
						{ name: "ACCOUNT", class_name: "AccountDurableObject" },
					],
				},
				migrations: [
					{ tag: "v1", new_sqlite_classes: ["AccountDurableObject"] },
				],
				r2_buckets: [{ binding: "BLOBS", bucket_name: "test-blobs" }],
			},
			null,
			"\t",
		),
	);

	// Write .dev.vars with test credentials
	await writeFile(
		join(tempDir, ".dev.vars"),
		`DID=did:web:test.local
HANDLE=test.local
PDS_HOSTNAME=test.local
AUTH_TOKEN=test-token
SIGNING_KEY=e5b452e70de7fb7864fdd7f0d67c6dbd0f128413a1daa1b2b8a871e906fc90cc
SIGNING_KEY_PUBLIC=zQ3shbUq6umkAhwsxEXj6fRZ3ptBtF5CNZbAGoKjvFRatUkVY
JWT_SECRET=test-jwt-secret-at-least-32-chars-long
PASSWORD_HASH=$2b$10$B6MKXNJ33Co3RoIVYAAvvO3jImuMiqL1T1YnFDN7E.hTZLtbB4SW6
INITIAL_ACTIVE=true
`,
	);

	// Write vite.config.ts for the fixture
	await writeFile(
		join(tempDir, "vite.config.ts"),
		`import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [cloudflare()],
	resolve: {
		alias: {
			// Required for dev mode - pino (used by @atproto) doesn't work in Workers
			pino: "pino/browser.js",
		},
	},
});
`,
	);

	// Install dependencies
	console.log("Installing dependencies in temp fixture...");
	const installResult = await runCommand("npm", ["install"], tempDir);
	if (installResult.code !== 0) {
		console.error("npm install failed:", installResult.stderr);
		throw new Error(`npm install failed with code ${installResult.code}`);
	}
	console.log("Dependencies installed");

	// Start Vite dev server as subprocess
	const port = await startViteServer(tempDir);

	console.log(`E2E test server started on port ${port}`);

	(globalThis as Record<string, unknown>).__e2e_port__ = port;
	(globalThis as Record<string, unknown>).__e2e_tempDir__ = tempDir;
}

function startViteServer(cwd: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const proc = spawn("npx", ["vite", "--port", "0"], {
			cwd,
			shell: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		serverProcess = proc;

		let output = "";
		const timeout = setTimeout(() => {
			proc.kill();
			reject(new Error(`Vite server startup timeout. Output: ${output}`));
		}, 60000);

		proc.stdout?.on("data", (data: Buffer) => {
			output += data.toString();
			// Look for the local URL in Vite's output
			// e.g., "Local:   http://localhost:5173/"
			const match = output.match(/Local:\s+http:\/\/localhost:(\d+)/);
			if (match?.[1]) {
				clearTimeout(timeout);
				resolve(parseInt(match[1], 10));
			}
		});

		proc.stderr?.on("data", (data: Buffer) => {
			output += data.toString();
		});

		proc.on("error", (err) => {
			clearTimeout(timeout);
			reject(err);
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				clearTimeout(timeout);
				reject(new Error(`Vite exited with code ${code}. Output: ${output}`));
			}
		});
	});
}

export async function teardown() {
	if (serverProcess) {
		serverProcess.kill();
		console.log("E2E test server stopped");
	}

	// Clean up temp directory
	if (tempDir) {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	}
}
