/**
 * Feature-flag service for progressive rollout (#425).
 *
 * Flags are resolved in priority order:
 *   1. Runtime overrides set via the admin API (in-memory, cleared on restart)
 *   2. Environment variable `FEATURE_<FLAG_NAME>=true|false`
 *   3. Compiled-in defaults below
 *
 * Flag state is exposed in the health payload so ops can verify what is
 * active without access to the admin UI.
 */

// ─── Flag registry ────────────────────────────────────────────────────────────

/** All known feature flags. Add new ones here. */
export const KNOWN_FLAGS = [
  "streaming_responses",
  "dag_preview",
  "experimental_agents",
  "quality_scorer",
  "reconciliation",
  "agent_ownership_proof",
] as const;

export type FeatureFlag = (typeof KNOWN_FLAGS)[number];

/** Compiled-in defaults — lowest precedence. */
const DEFAULTS: Record<FeatureFlag, boolean> = {
  streaming_responses: true,
  dag_preview: false,
  experimental_agents: false,
  quality_scorer: true,
  reconciliation: true,
  // Enforced by default. Setting this to `false` re-opens the *unsigned*
  // register/heartbeat path so existing agent clients keep working during a
  // migration window — see AGENT_AUTH_SUNSET_DATE for the cutover date.
  agent_ownership_proof: true,
};

// ─── Store ────────────────────────────────────────────────────────────────────

/** Runtime overrides set via admin API. Cleared on process restart. */
const runtimeOverrides = new Map<FeatureFlag, boolean>();

// ─── Resolution ───────────────────────────────────────────────────────────────

import { getConfig } from "../config";

function readEnvFlag(flag: FeatureFlag): boolean | undefined {
  const cfg = getConfig() as Record<string, any>;
  const key = `FEATURE_${flag.toUpperCase()}`;
  const val = cfg[key];
  // `.env` files copied from `.env.example` ship these keys empty; an empty
  // value means "not configured", never "false" — otherwise merely copying the
  // example would silently disable safety flags such as agent_ownership_proof.
  if (val === undefined || val === null || (typeof val === "string" && val.trim() === "")) {
    return undefined;
  }
  if (typeof val === "boolean") return val;
  return val === "1" || String(val).toLowerCase() === "true";
}

/**
 * Returns whether a feature flag is currently enabled.
 * Resolution order: runtime override → env var → compiled default.
 */
export function isEnabled(flag: FeatureFlag): boolean {
  if (runtimeOverrides.has(flag)) return runtimeOverrides.get(flag)!;
  const envVal = readEnvFlag(flag);
  if (envVal !== undefined) return envVal;
  return DEFAULTS[flag];
}

/**
 * Set a runtime override.  Pass `null` to clear the override and fall back to
 * env/default.
 */
export function setFlag(flag: FeatureFlag, value: boolean | null): void {
  if (value === null) {
    runtimeOverrides.delete(flag);
  } else {
    runtimeOverrides.set(flag, value);
  }
}

/** Returns a snapshot of all flag states with their resolution source. */
export function getAllFlags(): Record<FeatureFlag, { enabled: boolean; source: "runtime" | "env" | "default" }> {
  const result = {} as Record<FeatureFlag, { enabled: boolean; source: "runtime" | "env" | "default" }>;
  for (const flag of KNOWN_FLAGS) {
    if (runtimeOverrides.has(flag)) {
      result[flag] = { enabled: runtimeOverrides.get(flag)!, source: "runtime" };
    } else {
      const envVal = readEnvFlag(flag);
      if (envVal !== undefined) {
        result[flag] = { enabled: envVal, source: "env" };
      } else {
        result[flag] = { enabled: DEFAULTS[flag], source: "default" };
      }
    }
  }
  return result;
}

/** Clears all runtime overrides (useful in tests). */
export function clearRuntimeOverrides(): void {
  runtimeOverrides.clear();
}
