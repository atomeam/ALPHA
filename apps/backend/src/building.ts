export interface BuildingInfo {
  label: string;
  branch: string;
  base: string;
  pr_number: number | null;
  pr_url: string | null;
  repo_url: string;
}

export function readBuildingInfo(env: NodeJS.ProcessEnv = process.env): BuildingInfo {
  return {
    label: env.ALPHA_BUILDING_LABEL ?? 'Phase 1 — backend + alpha-core shell',
    branch: env.ALPHA_BUILDING_BRANCH ?? 'phase-1',
    base: env.ALPHA_BUILDING_BASE ?? 'main',
    pr_number: readOptionalNumber(env.ALPHA_BUILDING_PR),
    pr_url: env.ALPHA_BUILDING_PR_URL ?? null,
    repo_url: 'https://github.com/atomeam/ALPHA',
  };
}

function readOptionalNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}
