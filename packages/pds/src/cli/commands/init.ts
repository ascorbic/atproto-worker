/**
 * Interactive PDS setup wizard
 */
import { defineCommand } from "citty";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import * as p from "@clack/prompts";
import { Secp256k1Keypair } from "@atproto/crypto";
import bcrypt from "bcryptjs";
import {
	setSecret,
	setVars,
	getVars,
	type SecretName,
} from "../utils/wrangler.js";
import { readDevVars, writeDevVars } from "../utils/dotenv.js";

/**
 * Run wrangler types to regenerate TypeScript types
 */
function runWranglerTypes(): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn("wrangler", ["types"], {
			stdio: "inherit",
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`wrangler types failed with code ${code}`));
			}
		});

		child.on("error", reject);
	});
}

export const initCommand = defineCommand({
	meta: {
		name: "init",
		description: "Interactive PDS setup wizard",
	},
	args: {
		production: {
			type: "boolean",
			description:
				"Deploy secrets to Cloudflare (prompts to reuse .dev.vars values)",
			default: false,
		},
	},
	async run({ args }) {
		p.intro("PDS Setup Wizard");

		const isProduction = args.production;
		if (isProduction) {
			p.log.info("Production mode: secrets will be deployed via wrangler");
		}

		// Get current config from both sources
		const wranglerVars = getVars();
		const devVars = readDevVars();

		// Use wrangler vars as primary source for public config
		const currentVars = { ...devVars, ...wranglerVars };

		// Prompt for hostname
		const hostname = await p.text({
			message: "PDS hostname:",
			placeholder: "pds.example.com",
			initialValue: currentVars.PDS_HOSTNAME || "",
			validate: (v) => (!v ? "Hostname is required" : undefined),
		});
		if (p.isCancel(hostname)) {
			p.cancel("Cancelled");
			process.exit(0);
		}

		// Prompt for handle
		const handle = await p.text({
			message: "Account handle:",
			placeholder: "alice." + hostname,
			initialValue: currentVars.HANDLE || "",
			validate: (v) => (!v ? "Handle is required" : undefined),
		});
		if (p.isCancel(handle)) {
			p.cancel("Cancelled");
			process.exit(0);
		}

		// Prompt for DID
		const didDefault = "did:web:" + hostname;
		const did = await p.text({
			message: "Account DID:",
			placeholder: didDefault,
			initialValue: currentVars.DID || didDefault,
			validate: (v) => {
				if (!v) return "DID is required";
				if (!v.startsWith("did:")) return "DID must start with did:";
				return undefined;
			},
		});
		if (p.isCancel(did)) {
			p.cancel("Cancelled");
			process.exit(0);
		}

		const spinner = p.spinner();

		// In production mode, we may reuse secrets from .dev.vars
		// Otherwise, we always generate fresh values
		let authToken: string;
		let signingKey: string;
		let signingKeyPublic: string;
		let jwtSecret: string;
		let passwordHash: string;

		if (isProduction) {
			// For each secret, ask if we should reuse from .dev.vars
			authToken = await getOrGenerateSecret("AUTH_TOKEN", devVars, async () => {
				spinner.start("Generating auth token...");
				const token = randomBytes(32).toString("base64url");
				spinner.stop("Auth token generated");
				return token;
			});

			const signingResult = await getOrGenerateSecret(
				"SIGNING_KEY",
				devVars,
				async () => {
					spinner.start("Generating signing keypair...");
					const keypair = await Secp256k1Keypair.create({ exportable: true });
					const key = JSON.stringify(await keypair.export());
					spinner.stop("Signing keypair generated");
					return key;
				},
			);
			signingKey = signingResult;

			// For public key, derive from the signing key we're using
			const keypairForPublic = await Secp256k1Keypair.import(
				JSON.parse(signingKey),
			);
			signingKeyPublic = keypairForPublic.did().replace("did:key:", "");

			jwtSecret = await getOrGenerateSecret("JWT_SECRET", devVars, async () => {
				spinner.start("Generating JWT secret...");
				const secret = randomBytes(32).toString("base64");
				spinner.stop("JWT secret generated");
				return secret;
			});

			passwordHash = await getOrGenerateSecret(
				"PASSWORD_HASH",
				devVars,
				async () => {
					// Need to prompt for password
					const password = await p.password({
						message: "Account password:",
					});
					if (p.isCancel(password)) {
						p.cancel("Cancelled");
						process.exit(0);
					}

					const confirm = await p.password({
						message: "Confirm password:",
					});
					if (p.isCancel(confirm)) {
						p.cancel("Cancelled");
						process.exit(0);
					}

					if (password !== confirm) {
						p.log.error("Passwords do not match");
						process.exit(1);
					}

					spinner.start("Hashing password...");
					const hash = await bcrypt.hash(password, 10);
					spinner.stop("Password hashed");
					return hash;
				},
			);
		} else {
			// Local mode: always prompt for password and generate fresh secrets
			const password = await p.password({
				message: "Account password:",
			});
			if (p.isCancel(password)) {
				p.cancel("Cancelled");
				process.exit(0);
			}

			const confirm = await p.password({
				message: "Confirm password:",
			});
			if (p.isCancel(confirm)) {
				p.cancel("Cancelled");
				process.exit(0);
			}

			if (password !== confirm) {
				p.log.error("Passwords do not match");
				process.exit(1);
			}

			spinner.start("Hashing password...");
			passwordHash = await bcrypt.hash(password, 10);
			spinner.stop("Password hashed");

			spinner.start("Generating JWT secret...");
			jwtSecret = randomBytes(32).toString("base64");
			spinner.stop("JWT secret generated");

			spinner.start("Generating auth token...");
			authToken = randomBytes(32).toString("base64url");
			spinner.stop("Auth token generated");

			spinner.start("Generating signing keypair...");
			const keypair = await Secp256k1Keypair.create({ exportable: true });
			signingKey = JSON.stringify(await keypair.export());
			signingKeyPublic = keypair.did().replace("did:key:", "");
			spinner.stop("Signing keypair generated");
		}

		// Always set public vars in wrangler.jsonc
		spinner.start("Updating wrangler.jsonc...");
		setVars({
			PDS_HOSTNAME: hostname,
			DID: did,
			HANDLE: handle,
			SIGNING_KEY_PUBLIC: signingKeyPublic,
		});
		spinner.stop("wrangler.jsonc updated");

		// Set secrets based on mode
		if (isProduction) {
			// Deploy secrets via wrangler
			spinner.start("Setting AUTH_TOKEN...");
			await setSecret("AUTH_TOKEN", authToken);
			spinner.stop("AUTH_TOKEN set");

			spinner.start("Setting SIGNING_KEY...");
			await setSecret("SIGNING_KEY", signingKey);
			spinner.stop("SIGNING_KEY set");

			spinner.start("Setting JWT_SECRET...");
			await setSecret("JWT_SECRET", jwtSecret);
			spinner.stop("JWT_SECRET set");

			spinner.start("Setting PASSWORD_HASH...");
			await setSecret("PASSWORD_HASH", passwordHash);
			spinner.stop("PASSWORD_HASH set");
		} else {
			// Write secrets to .dev.vars for local development
			spinner.start("Writing secrets to .dev.vars...");
			writeDevVars({
				AUTH_TOKEN: authToken,
				SIGNING_KEY: signingKey,
				JWT_SECRET: jwtSecret,
				PASSWORD_HASH: passwordHash,
			});
			spinner.stop("Secrets written to .dev.vars");
		}

		// Generate TypeScript types
		spinner.start("Generating TypeScript types...");
		try {
			await runWranglerTypes();
			spinner.stop("TypeScript types generated");
		} catch {
			spinner.stop("Failed to generate types (wrangler types)");
		}

		p.note(
			[
				"Configuration summary:",
				"",
				"  PDS_HOSTNAME: " + hostname,
				"  DID: " + did,
				"  HANDLE: " + handle,
				"  SIGNING_KEY_PUBLIC: " + signingKeyPublic,
				"",
				isProduction
					? "Secrets deployed to Cloudflare"
					: "Secrets saved to .dev.vars",
				"",
				"Auth token (save this!):",
				"  " + authToken,
			].join("\n"),
			"Setup Complete",
		);

		if (isProduction) {
			p.outro("Your PDS is configured! Run 'wrangler deploy' to deploy.");
		} else {
			p.outro("Your PDS is configured! Run 'pnpm dev' to start locally.");
		}
	},
});

/**
 * Helper to get a secret from .dev.vars or generate a new one
 */
async function getOrGenerateSecret(
	name: SecretName,
	devVars: Record<string, string>,
	generate: () => Promise<string>,
): Promise<string> {
	if (devVars[name]) {
		const useExisting = await p.confirm({
			message: `Use ${name} from .dev.vars?`,
			initialValue: true,
		});
		if (p.isCancel(useExisting)) {
			p.cancel("Cancelled");
			process.exit(0);
		}
		if (useExisting) {
			return devVars[name];
		}
	}
	return generate();
}
