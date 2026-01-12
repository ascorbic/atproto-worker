import type { AuthVariables } from "./middleware/auth";
import type { AccountDurableObject } from "./account-do";

/**
 * Jurisdiction options for Durable Object data placement.
 * These provide hard guarantees that data never leaves the specified region.
 */
export type Jurisdiction = "eu" | "fedramp";

/**
 * Location hint options for Durable Object placement.
 * These are best-effort suggestions for initial DO placement.
 * Unlike jurisdiction, hints are not guarantees.
 */
export type LocationHint =
	| "wnam" // Western North America
	| "enam" // Eastern North America
	| "sam" // South America
	| "weur" // Western Europe
	| "eeur" // Eastern Europe
	| "apac" // Asia-Pacific
	| "oc" // Oceania
	| "afr" // Africa
	| "me"; // Middle East

/**
 * Environment bindings required by the PDS worker.
 * Consumers must provide these bindings in their wrangler config.
 */
export interface PDSEnv {
	/** The account's DID (e.g., did:web:example.com) */
	DID: string;
	/** The account's handle (e.g., alice.example.com) */
	HANDLE: string;
	/** Public hostname of the PDS */
	PDS_HOSTNAME: string;
	/** Bearer token for write operations */
	AUTH_TOKEN: string;
	/** Private signing key (hex-encoded) */
	SIGNING_KEY: string;
	/** Public signing key (multibase-encoded) */
	SIGNING_KEY_PUBLIC: string;
	/** Secret for signing session JWTs */
	JWT_SECRET: string;
	/** Bcrypt hash of account password */
	PASSWORD_HASH: string;
	/** Durable Object namespace for account storage */
	ACCOUNT: DurableObjectNamespace<AccountDurableObject>;
	/** R2 bucket for blob storage (optional) */
	BLOBS?: R2Bucket;
	/** Initial activation state for new accounts (default: true) */
	INITIAL_ACTIVE?: string;
	/**
	 * Jurisdiction for Durable Object data placement.
	 * Provides hard guarantees that data stays within the specified region.
	 * Options: "eu" (European Union), "fedramp" (FedRAMP-compliant datacenters)
	 *
	 * IMPORTANT: This only affects newly-created DOs. Existing DOs cannot be
	 * migrated - you must export data and create a new PDS with jurisdiction set.
	 */
	JURISDICTION?: Jurisdiction;
	/**
	 * Location hint for Durable Object placement.
	 * Best-effort suggestion for where to place the DO - not a guarantee.
	 * Options: "wnam", "enam", "sam", "weur", "eeur", "apac", "oc", "afr", "me"
	 */
	LOCATION_HINT?: LocationHint;
}

/**
 * Base app environment with bindings only.
 * Used for routes that don't require authentication.
 */
export type AppEnv = {
	Bindings: PDSEnv;
};

/**
 * App environment with auth variables.
 * Used for routes that require authentication.
 */
export type AuthedAppEnv = {
	Bindings: PDSEnv;
	Variables: AuthVariables;
};
