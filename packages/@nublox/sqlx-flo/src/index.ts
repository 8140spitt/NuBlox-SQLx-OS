import {
  capabilityFromFamily,
  detectFamilyFromUrl,
  type CapabilityProfile,
} from "@nublox/sqlx-transport";

export type LearnOutput = {
  family: string;
  capabilities: CapabilityProfile;
};

function requireUrl(url?: string): string {
  const resolved = url ?? process.env.DATABASE_URL ?? "";
  if (!resolved) {
    throw new Error(
      "No connection URL provided. Pass a URL or set DATABASE_URL."
    );
  }
  return resolved;
}

export async function learn(url?: string): Promise<LearnOutput> {
  const inputUrl = requireUrl(url);
  const family = detectFamilyFromUrl(inputUrl);
  if (!family) {
    throw new Error(`Could not detect a DB family from URL: ${inputUrl}`);
  }
  const capabilities = capabilityFromFamily(family);
  return { family, capabilities };
}
