// GET /api/health — service status, version, git sha, building info, config flags.

import type { RequestHandler } from 'express';

export interface HealthConfig {
  VERSION: string;
  GIT_SHA: string;
  STARTED_AT: string;
  BUILDING: {
    label: string;
    branch: string;
    base: string;
    pr_number: number;
    pr_url: string;
    repo_url: string;
  };
  PROMPT_NAMES: string[];
}

export function healthRoute(config: HealthConfig): RequestHandler {
  return (_req, res) => {
    res.json({
      status: 'ok',
      service: 'alpha-backend',
      version: config.VERSION,
      git_sha: config.GIT_SHA,
      started_at: config.STARTED_AT,
      gemini: {
        configured: Boolean(process.env['GEMINI_API_KEY']),
        model: process.env['GEMINI_MODEL'] || 'gemini-2.5-flash',
      },
      building: config.BUILDING,
      prompts: config.PROMPT_NAMES,
    });
  };
}
