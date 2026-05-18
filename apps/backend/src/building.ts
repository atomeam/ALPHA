// "Building" block surfaced on /api/health. Set HOMEBASE_BUILDING_* envs in deploy to retarget the banner.
// Kept for backwards-compatibility with the HomeBase cockpit while the frontend is still on the legacy shape.

export interface BuildingInfo {
  label: string;
  branch: string;
  base: string;
  pr_number: number;
  pr_url: string;
  repo_url: string;
}

export function readBuildingInfo(): BuildingInfo {
  return {
    label: process.env.HOMEBASE_BUILDING_LABEL ?? 'Alpha — Phase 1 backend cutover',
    branch: process.env.HOMEBASE_BUILDING_BRANCH ?? 'alpha',
    base: process.env.HOMEBASE_BUILDING_BASE ?? 'main',
    pr_number: Number(process.env.HOMEBASE_BUILDING_PR ?? 1),
    pr_url: process.env.HOMEBASE_BUILDING_PR_URL ?? 'https://github.com/atomeam/ALPHA/pull/1',
    repo_url: 'https://github.com/atomeam/ALPHA',
  };
}
