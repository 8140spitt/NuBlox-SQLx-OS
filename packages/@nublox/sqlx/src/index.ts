// packages/@nublox/sqlx/src/index.ts
import { learn as floLearn, type LearnOutput } from "@nublox/sqlx-flo";
import {
  capabilityFromFamily,
  detectFamilyFromUrl,
  type CapabilityProfile,
} from "@nublox/sqlx-transport";

export type { LearnOutput, CapabilityProfile };

export function capabilities(url?: string): CapabilityProfile {
  if (url) {
    const family = detectFamilyFromUrl(url);
    if (!family) throw new Error(`Could not detect a DB family from URL: ${url}`);
    return capabilityFromFamily(family);
  }
  // default family for now (adjust later)
  return capabilityFromFamily("mysql");
}

// This is the symbol your CLI expects:
export async function learn(url?: string): Promise<LearnOutput> {
  return floLearn(url);
}

export function ping(): string {
  return "pong";
}
