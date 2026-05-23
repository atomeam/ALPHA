/**
 * ML-Based Anomaly Detection
 * 
 * Uses statistical methods + Workers AI for pattern recognition
 * to detect subtle degradation before thresholds are crossed.
 */

import type { Metric } from './types';

export interface AnomalyResult {
  metric: string;
  isAnomaly: boolean;
  score: number;           // 0-1, higher = more anomalous
  confidence: number;      // 0-1, how confident we are
  pattern: string;         // Description of the pattern
  trend: 'improving' | 'stable' | 'degrading';
  expectedValue: number;
  deviation: number;        // How far from expected
}

interface MetricHistory {
  values: number[];
  timestamps: number[];
  mean: number;
  stdDev: number;
  trend: number;           // Slope of linear trend
}

export class AnomalyDetector {
  private history: Map<string, MetricHistory> = new Map();
  private readonly MAX_HISTORY = 1000;
  private readonly MIN_HISTORY_FOR_TREND = 10;
  private readonly MIN_HISTORY_FOR_ANOMALY = 5;

  constructor(private ai: any = null) {}

  /**
   * Analyze a set of metrics for anomalies
   */
  async analyze(metrics: Metric[]): Promise<AnomalyResult[]> {
    const results: AnomalyResult[] = [];

    for (const metric of metrics) {
      // Update history
      this.updateHistory(metric);

      // Perform statistical analysis
      const statisticalResult = this.analyzeStatistical(metric.name);

      // Enhance with AI if available
      if (this.ai && statisticalResult.isAnomaly && statisticalResult.score > 0.7) {
        const aiEnhancement = await this.enhanceWithAI(metric, statisticalResult);
        results.push(aiEnhancement);
      } else {
        results.push(statisticalResult);
      }
    }

    return results;
  }

  /**
   * Update metric history
   */
  private updateHistory(metric: Metric): void {
    let history = this.history.get(metric.name);

    if (!history) {
      history = {
        values: [],
        timestamps: [],
        mean: 0,
        stdDev: 0,
        trend: 0,
      };
      this.history.set(metric.name, history);
    }

    history.values.push(metric.value);
    history.timestamps.push(metric.timestamp);

    // Trim if needed
    if (history.values.length > this.MAX_HISTORY) {
      history.values = history.values.slice(-this.MAX_HISTORY);
      history.timestamps = history.timestamps.slice(-this.MAX_HISTORY);
    }

    // Recalculate statistics
    history.mean = this.calculateMean(history.values);
    history.stdDev = this.calculateStdDev(history.values, history.mean);
    history.trend = this.calculateTrend(history.values);
  }

  /**
   * Statistical anomaly detection
   */
  private analyzeStatistical(metricName: string): AnomalyResult {
    const history = this.history.get(metricName);

    if (!history || history.values.length < this.MIN_HISTORY_FOR_ANOMALY) {
      return {
        metric: metricName,
        isAnomaly: false,
        score: 0,
        confidence: 0,
        pattern: 'Insufficient history for analysis',
        trend: 'stable',
        expectedValue: 0,
        deviation: 0,
      };
    }

    const currentValue = history.values[history.values.length - 1];
    const recentMean = this.calculateMean(history.values.slice(-10));
    const recentStdDev = this.calculateStdDev(history.values.slice(-10), recentMean);

    // Calculate z-score
    const zScore = recentStdDev > 0
      ? Math.abs((currentValue - recentMean) / recentStdDev)
      : (currentValue !== recentMean ? 1 : 0);

    // Calculate anomaly score (0-1)
    const score = this.zScoreToAnomalyScore(zScore);

    // Determine if anomalous
    const isAnomaly = zScore > 2.5 || this.isExponentialGrowth(history.values);

    // Determine confidence based on history size
    const confidence = Math.min(history.values.length / 50, 1);

    // Determine trend
    const trend = this.determineTrend(history.values, history.trend);

    // Generate pattern description
    const pattern = this.generatePatternDescription(currentValue, recentMean, zScore, trend);

    return {
      metric: metricName,
      isAnomaly,
      score,
      confidence,
      pattern,
      trend,
      expectedValue: recentMean,
      deviation: currentValue - recentMean,
    };
  }

  /**
   * Enhance analysis with Workers AI
   */
  private async enhanceWithAI(metric: Metric, statisticalResult: AnomalyResult): Promise<AnomalyResult> {
    try {
      // Build context for AI analysis
      const history = this.history.get(metric.name);
      const recentValues = history?.values.slice(-20) || [];

      const prompt = `Analyze this metric for anomalies and provide insights:

Metric: ${metric.name}
Current Value: ${metric.value}
Unit: ${metric.unit || 'unknown'}
Tags: ${JSON.stringify(metric.tags || {})}

Recent Values (last 20): ${JSON.stringify(recentValues)}

Statistical Analysis:
- Z-Score: ${(statisticalResult.deviation / (statisticalResult.expectedValue * 0.1 || 1)).toFixed(2)}
- Trend: ${statisticalResult.trend}
- Expected Value: ${statisticalResult.expectedValue.toFixed(2)}
- Deviation: ${statisticalResult.deviation.toFixed(2)}

Provide a brief (1-2 sentence) description of the anomaly pattern detected and recommended action.`;

      const response = await this.ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: 'You are a systems monitoring expert. Provide concise, actionable insights.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 100,
      });

      // Parse AI response and enhance result
      const aiPattern = response.choices?.[0]?.message?.content || statisticalResult.pattern;

      return {
        ...statisticalResult,
        confidence: Math.min(statisticalResult.confidence + 0.2, 1),
        pattern: `[ML Enhanced] ${aiPattern}`,
      };
    } catch (error) {
      console.error('AI enhancement failed, using statistical analysis:', error);
      return statisticalResult;
    }
  }

  /**
   * Convert z-score to anomaly score (0-1)
   */
  private zScoreToAnomalyScore(zScore: number): number {
    // Sigmoid-like function to map z-score to 0-1
    // z=0 -> 0, z=2 -> 0.5, z=4 -> 0.98
    return 1 / (1 + Math.exp(-(zScore - 2) * 1.5));
  }

  /**
   * Detect exponential growth pattern
   */
  private isExponentialGrowth(values: number[]): boolean {
    if (values.length < 5) return false;

    // Check if growth rate is increasing
    const recent = values.slice(-5);
    const growthRates: number[] = [];

    for (let i = 1; i < recent.length; i++) {
      if (recent[i - 1] > 0) {
        growthRates.push((recent[i] - recent[i - 1]) / recent[i - 1]);
      }
    }

    if (growthRates.length < 2) return false;

    // Check if growth rate is increasing
    let increasingCount = 0;
    for (let i = 1; i < growthRates.length; i++) {
      if (growthRates[i] > growthRates[i - 1]) {
        increasingCount++;
      }
    }

    return increasingCount >= growthRates.length * 0.7; // 70% of growth rates are increasing
  }

  /**
   * Calculate mean
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[], mean: number): number {
    if (values.length < 2) return 1;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Calculate trend (slope) using linear regression
   */
  private calculateTrend(values: number[]): number {
    if (values.length < 3) return 0;

    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  /**
   * Determine trend direction
   */
  private determineTrend(values: number[], slope: number): 'improving' | 'stable' | 'degrading' {
    const mean = this.calculateMean(values);
    const normalizedSlope = mean !== 0 ? slope / mean : 0;

    if (normalizedSlope > 0.02) return 'improving';
    if (normalizedSlope < -0.02) return 'degrading';
    return 'stable';
  }

  /**
   * Generate pattern description
   */
  private generatePatternDescription(
    currentValue: number,
    mean: number,
    zScore: number,
    trend: 'improving' | 'stable' | 'degrading'
  ): string {
    const deviationPercent = mean !== 0 ? ((currentValue - mean) / mean * 100).toFixed(1) : '0';
    const direction = currentValue > mean ? 'above' : 'below';

    if (zScore > 4) {
      return `Major deviation: ${deviationPercent}% ${direction} expected (z=${zScore.toFixed(1)})`;
    } else if (zScore > 3) {
      return `Significant deviation: ${deviationPercent}% ${direction} normal (z=${zScore.toFixed(1)})`;
    } else if (zScore > 2) {
      return `Moderate deviation: ${deviationPercent}% ${direction} baseline`;
    } else {
      return `Normal range: ${deviationPercent}% ${direction} average, trend ${trend}`;
    }
  }

  /**
   * Get correlation between two metrics
   */
  getCorrelation(metricA: string, metricB: string): number {
    const historyA = this.history.get(metricA);
    const historyB = this.history.get(metricB);

    if (!historyA || !historyB) return 0;

    // Find common timestamps
    const valuesA: number[] = [];
    const valuesB: number[] = [];

    for (let i = 0; i < historyA.timestamps.length; i++) {
      const idx = historyB.timestamps.indexOf(historyA.timestamps[i]);
      if (idx !== -1) {
        valuesA.push(historyA.values[i]);
        valuesB.push(historyB.values[idx]);
      }
    }

    if (valuesA.length < 3) return 0;

    const meanA = this.calculateMean(valuesA);
    const meanB = this.calculateMean(valuesB);

    let numerator = 0;
    let denomA = 0;
    let denomB = 0;

    for (let i = 0; i < valuesA.length; i++) {
      const diffA = valuesA[i] - meanA;
      const diffB = valuesB[i] - meanB;
      numerator += diffA * diffB;
      denomA += diffA * diffA;
      denomB += diffB * diffB;
    }

    const denominator = Math.sqrt(denomA * denomB);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Reset history for a metric
   */
  resetMetric(metricName: string): void {
    this.history.delete(metricName);
  }

  /**
   * Reset all history
   */
  reset(): void {
    this.history.clear();
  }
}

/**
 * Ensemble anomaly detector - combines multiple detection methods
 */
export class EnsembleAnomalyDetector {
  private statistical = new AnomalyDetector();
  private rollingWindow: Map<string, number[]> = new Map();
  private readonly WINDOW_SIZE = 20;

  constructor(private ai: any = null) {}

  /**
   * Detect anomalies using ensemble methods
   */
  async detect(metrics: Metric[]): Promise<AnomalyResult[]> {
    const results = await this.statistical.analyze(metrics);

    // Enhance with rolling window analysis
    for (const result of results) {
      const rollingScore = this.rollingWindowAnalysis(result.metric, result.score);
      const iqrScore = this.interquartileRangeAnalysis(result.metric, result.score);

      // Combine scores (weighted average)
      const combinedScore = result.score * 0.4 + rollingScore * 0.3 + iqrScore * 0.3;

      // If ensemble detects anomaly but statistical didn't, flag it
      if (combinedScore > 0.6 && !result.isAnomaly) {
        result.isAnomaly = true;
        result.score = combinedScore;
        result.pattern = `[Ensemble] ${result.pattern}`;
      }
    }

    return results;
  }

  /**
   * Rolling window analysis
   */
  private rollingWindowAnalysis(metricName: string, baseScore: number): number {
    const window = this.rollingWindow.get(metricName) || [];
    window.push(baseScore);

    if (window.length > this.WINDOW_SIZE) {
      window.shift();
    }

    this.rollingWindow.set(metricName, window);

    if (window.length < 5) return 0;

    // Check if current score is in top 20% of window
    const sorted = [...window].sort((a, b) => b - a);
    const threshold = sorted[Math.floor(window.length * 0.2)] || 0;

    return baseScore > threshold ? 0.8 : 0.2;
  }

  /**
   * Interquartile range analysis
   */
  private interquartileRangeAnalysis(metricName: string, baseScore: number): number {
    const history = this.statistical['history']?.get(metricName);
    if (!history || history.values.length < 10) return 0;

    const sorted = [...history.values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;

    const currentValue = history.values[history.values.length - 1];
    const upperBound = q3 + 1.5 * iqr;
    const lowerBound = q1 - 1.5 * iqr;

    if (currentValue > upperBound || currentValue < lowerBound) {
      return 0.9;
    }

    return 0.1;
  }
}