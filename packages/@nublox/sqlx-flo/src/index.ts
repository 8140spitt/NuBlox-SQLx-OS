// packages/@nublox/sqlx-flo/src/index.ts
import {
  familyFromUrl,
  capabilityFromFamily,
  type CapabilityProfile,
} from "@nublox/sqlx-transport";

export type LearnResult = {
  family: string;
  profile: CapabilityProfile;
};

/**
 * Back-compat shim: expose the name the caller expected.
 */
export function detectFamilyFromUrl(urlStr: string): string | undefined {
  return familyFromUrl(urlStr);
}

/**
 * Minimal “learn” flow:
 * - detect the protocol family from the URL
 * - load the family capability profile from the transport registry
 */
export async function learn(urlStr: string): Promise<LearnResult> {
  const fam = familyFromUrl(urlStr) ?? "mysql"; // sensible default
  const profile = capabilityFromFamily(fam);
  return { family: fam, profile };
}
