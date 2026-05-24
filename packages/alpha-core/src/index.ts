// Alpha v0 — public entry point.
export * from './types';
export * from './config';
export { evaluateProposal } from './curator';
export { runApplier, nextNeighborhoodState } from './applier';
export { OrchestrationBrain } from './orchestration-brain';
export type {
  AgentTransitionEvent,
  SystemStateSnapshot,
  TransitionResult,
} from './orchestration-brain';

// PR1 — Pipeline
export { AlphaPipeline } from './pipeline.js';
export type { AlphaPipelineDeps } from './pipeline.js';
export {
  InputMetricsProvider,
  KVMetricsProvider,
  AmplitudeMetricsProvider,
  MetricsProviderChain,
} from './metrics-provider.js';
export {
  KVLessonSink,
  NotionLessonSink,
  MemoryLessonSink,
  LessonSinkChain,
} from './lesson-sink.js';
export type { MetricsProvider, LessonSink } from './types.js';
