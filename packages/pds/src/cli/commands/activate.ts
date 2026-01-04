/**
 * Activate account command - enables writes after migration
 */
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import type { Did } from "@atcute/lexicons";
import { getVars } from "../utils/wrangler.js";
import { readDevVars } from "../utils/dotenv.js";
import { PDSClient } from "../utils/pds-client.js";
import {
	getTargetUrl,
	getDomain,
	detectPackageManager,
	formatCommand,
	promptText,
} from "../utils/cli-helpers.js";

/**
 * Prompt user to create a profile if one doesn't exist
 */
async function promptCreateProfile(
	client: PDSClient,
	did: Did,
	handle: string | undefined,
): Promise<void> {
	const spinner = p.spinner();

	spinner.start("Checking profile...");
	const existingProfile = await client.getProfile(did);
	spinner.stop(existingProfile ? "Profile found" : "No profile found");

	if (!existingProfile) {
		const createProfile = await p.confirm({
			message: "Create a profile? (recommended for visibility on the network)",
			initialValue: true,
		});

		if (p.isCancel(createProfile)) {
			p.cancel("Cancelled.");
			process.exit(0);
		}

		if (createProfile) {
			const displayName = await promptText({
				message: "Display name:",
				placeholder: handle || "Your Name",
				validate: (v) => {
					if (v && v.length > 64)
						return "Display name must be 64 characters or less";
					return undefined;
				},
			});

			const description = await promptText({
				message: "Bio (optional):",
				placeholder: "Tell us about yourself",
				validate: (v) => {
					if (v && v.length > 256) return "Bio must be 256 characters or less";
					return undefined;
				},
			});

			spinner.start("Creating profile...");
			try {
				await client.putProfile(did, {
					displayName: displayName || undefined,
					description: description || undefined,
				});
				spinner.stop("Profile created!");
			} catch (err) {
				spinner.stop("Failed to create profile");
				p.log.warn(
					err instanceof Error ? err.message : "Could not create profile",
				);
			}
		}
	}
}

export const activateCommand = defineCommand({
	meta: {
		name: "activate",
		description: "Activate your account to enable writes and go live",
	},
	args: {
		dev: {
			type: "boolean",
			description: "Target local development server instead of production",
			default: false,
		},
	},
	async run({ args }) {
		const pm = detectPackageManager();
		const isDev = args.dev;

		p.intro("🦋 Activate Account");

		// Get target URL
		const vars = getVars();
		let targetUrl: string;
		try {
			targetUrl = getTargetUrl(isDev, vars.PDS_HOSTNAME);
		} catch (err) {
			p.log.error(err instanceof Error ? err.message : "Configuration error");
			p.log.info("Run 'pds init' first to configure your PDS.");
			process.exit(1);
		}

		const targetDomain = getDomain(targetUrl);

		// Load config
		const wranglerVars = getVars();
		const devVars = readDevVars();
		const config = { ...devVars, ...wranglerVars };

		const authToken = config.AUTH_TOKEN;
		const handle = config.HANDLE;

		if (!authToken) {
			p.log.error("No AUTH_TOKEN found. Run 'pds init' first.");
			p.outro("Activation cancelled.");
			process.exit(1);
		}

		// Create client
		const client = new PDSClient(targetUrl, authToken);

		// Check if PDS is reachable
		const spinner = p.spinner();
		spinner.start(`Checking PDS at ${targetDomain}...`);

		const isHealthy = await client.healthCheck();
		if (!isHealthy) {
			spinner.stop(`PDS not responding at ${targetDomain}`);
			p.log.error(`Your PDS isn't responding at ${targetUrl}`);
			if (!isDev) {
				p.log.info(
					`Make sure your worker is deployed: ${formatCommand(pm, "deploy")}`,
				);
			}
			p.outro("Activation cancelled.");
			process.exit(1);
		}

		spinner.stop(`Connected to ${targetDomain}`);

		// Get current account status
		spinner.start("Checking account status...");
		const status = await client.getAccountStatus();
		spinner.stop("Account status retrieved");

		// Check if already active
		if (status.active) {
			p.log.info("Your account is already active.");

			// Check if profile exists and offer to create one
			const did = config.DID;
			if (did) {
				await promptCreateProfile(client, did as Did, handle);
			}

			// Offer to ping the relay
			const pdsHostname = config.PDS_HOSTNAME;
			if (pdsHostname && !isDev) {
				const pingRelay = await p.confirm({
					message: "Notify the relay? (useful if posts aren't being indexed)",
					initialValue: false,
				});

				if (p.isCancel(pingRelay)) {
					p.cancel("Cancelled.");
					process.exit(0);
				}

				if (pingRelay) {
					spinner.start("Notifying relay...");
					const relayPinged = await client.requestCrawl(pdsHostname);
					if (relayPinged) {
						spinner.stop("Relay notified");
					} else {
						spinner.stop("Could not notify relay");
					}
				}
			}

			p.outro("All good!");
			return;
		}

		// Show confirmation
		p.note(
			[
				`@${handle || "your-handle"}`,
				"",
				"This will enable writes and make your account live.",
				"Make sure you've:",
				"  ✓ Updated your DID document to point here",
				"  ✓ Completed email verification (if required)",
			].join("\n"),
			"Ready to go live?",
		);

		const confirm = await p.confirm({
			message: "Activate account?",
			initialValue: true,
		});

		if (p.isCancel(confirm) || !confirm) {
			p.cancel("Activation cancelled.");
			process.exit(0);
		}

		// Activate
		spinner.start("Activating account...");
		try {
			await client.activateAccount();
			spinner.stop("Account activated!");
		} catch (err) {
			spinner.stop("Activation failed");
			p.log.error(
				err instanceof Error ? err.message : "Could not activate account",
			);
			p.outro("Activation failed.");
			process.exit(1);
		}

		// Check if profile exists and offer to create one
		const did = config.DID;
		if (did) {
			await promptCreateProfile(client, did as Did, handle);
		}

		// Ping the relay to request crawl
		const pdsHostname = config.PDS_HOSTNAME;
		if (pdsHostname && !isDev) {
			spinner.start("Notifying relay...");
			const relayPinged = await client.requestCrawl(pdsHostname);
			if (relayPinged) {
				spinner.stop("Relay notified");
			} else {
				spinner.stop("Could not notify relay");
				p.log.warn(
					"Run 'pds activate' again later to retry notifying the relay.",
				);
			}
		}

		p.log.success("Welcome to the Atmosphere! 🦋");
		p.log.info("Your account is now live and accepting writes.");
		p.outro("All set!");
	},
});
