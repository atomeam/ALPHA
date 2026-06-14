/**
 * Vital Signs
 * 
 * Meta-health metrics that auto-throttle autonomy.
 */

import { getStats } from '@aether/curator-audit';
import { getPatternConfidences } from '@aether/lessons';
import { snapshot } from '@aether/metrics';

// Health thresholds
export interface Thresholds {
  denialRateCritical: number;
  denialRateWarning: number;
  confidenceDriftWarning: number;
  failureRateWarning: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  denialRateCritical: 0.5,
  denialRateWarning: 0.25,
  confidenceDriftWarning: 0.3,
  failureRateWarning: 10,
};

// Vital signs
export interface VitalSigns {
  status: 'healthy' | 'degraded' | 'critical';
  denialRate: number;
  confidenceDrift: number;
  failureRate: number;
  autonomyLevel: 'full' | 'limited' | 'restricted' | 'locked';
  timestamp: number;
}

// Check vital signs
export async function checkVitals(thresholds = DEFAULT_THRESHOLDS): Promise<VitalSigns> {
  // Get metrics
  let denialRate = 0;
  let failureRate = 0;
  
  try {
    const audit = await getStats();
    denialRate = audit.denial_rate;
    failureRate = audit.denied;
  } catch {}
  
  // Check confidence drift
  let confidenceDrift = 0;
  try {
    const patterns = await getPatternConfidences();
    if (Object.keys(patterns).length > 0) {
      const values = Object.values(patterns);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      // High confidence = good, low = drift
      confidenceDrift = Math.abs(0.5 - mean);
    }
  } catch {}
  
  // Determine status
  let status: VitalSigns['status'] = 'healthy';
  if (denialRate > thresholds.denialRateCritical) status = 'critical';
  else if (denialRate > thresholds.denialRateWarning) status = 'degraded';
  
  // Determine autonomy level
  let autonomyLevel: VitalSigns['autonomyLevel'] = 'full';
  if (status === 'critical') autonomyLevel = 'locked';
  else if (status === 'degraded') autonomyLevel = 'restricted';
  else if (confidenceDrift > thresholds.confidenceDriftWarning) autonomyLevel = 'limited';
  
  return {
    status,
    denialRate,
    confidenceDrift,
    failureRate,
    autonomyLevel,
    timestamp: Date.now(),
  };
}

// Throttle recommendation
export async function getThrottleRecommendation(): Promise<{ action: string; reason: string }> {
  const vitals = await checkVitals();
  
  if (vitals.autonomyLevel === 'locked') {
    return { action: 'lock', reason: 'Critical denial rate' };
  }
  if (vitals.autonomyLevel === 'restricted') {
    return { action: 'restrict', reason: 'Elevated denial rate' };
  }
  if (vitals.autonomyLevel === 'limited') {
    return { action: 'limit', reason: 'High confidence drift' };
  }
  return { action: 'none', reason: 'System healthy' };
}