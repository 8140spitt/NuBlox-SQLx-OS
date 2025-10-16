// packages/@nublox/sqlx/src/index.ts
import {
  capabilityFromFamily,
  type CapabilityProfile,
} from "@nublox/sqlx-transport";
import {
  learn as floLearn,
  detectFamilyFromUrl,
  type LearnResult,
} from "@nublox/sqlx-flo";

/**
 * Get a capability profile. If a URL is provided, we detect the family from it;
 * otherwise we default to "mysql".
 */
export function capabilities(urlStr?: string): CapabilityProfile {
  const family = urlStr ? detectFamilyFromUrl(urlStr) ?? "mysql" : "mysql";
  return capabilityFromFamily(family);
}

/** Run the learning flow (family detection + capability profile). */
export async function learn(urlStr: string): Promise<LearnResult> {
  return floLearn(urlStr);
}

/** Simple health check used by the CLI. */
export async function ping(): Promise<"pong"> {
  return "pong";
}

// Re-export types for downstream packages/CLI
export type { CapabilityProfile } from "@nublox/sqlx-transport";
export type { LearnResult } from "@nublox/sqlx-flo";
