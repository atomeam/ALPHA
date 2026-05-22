/**
 * Scheduler
 * 
 * Cron-like job scheduling for the agent system.
 */

import { EventEmitter } from 'events';

// Job definition
export interface Job {
  id: string;
  name: string;
  schedule: string; // cron format: "*/5 * * * *"
  handler: () => Promise<void>;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
}

// Parse cron to next run
function parseCron(schedule: string): number {
  const parts = schedule.split(' ');
  if (parts.length !== 5) throw new Error('Invalid cron: need 5 parts');
  
  const now = new Date();
  const next = new Date(now);
  
  // Simple implementation: support */N minute format
  if (parts[0].startsWith('*/')) {
    const mins = parseInt(parts[0].slice(2));
    next.setMinutes(now.getMinutes() + mins);
    next.setSeconds(0, 0);
  } else {
    // Default: every minute
    next.setMinutes(now.getMinutes() + 1);
    next.setSeconds(0, 0);
  }
  
  return next.getTime();
}

export class Scheduler extends EventEmitter {
  private jobs = new Map<string, Job>();
  private running = false;
  private interval?: NodeJS.Timeout;
  
  // Add a job
  addJob(name: string, schedule: string, handler: () => Promise<void>): string {
    const job: Job = {
      id: crypto.randomUUID(),
      name,
      schedule,
      handler,
      enabled: true,
    };
    
    job.nextRun = parseCron(schedule);
    this.jobs.set(name, job);
    this.emit('jobAdded', job);
    
    return job.id;
  }
  
  // Remove a job
  removeJob(name: string) {
    this.jobs.delete(name);
  }
  
  // Enable/disable
  enableJob(name: string, enabled: boolean) {
    const job = this.jobs.get(name);
    if (job) job.enabled = enabled;
  }
  
  // Start scheduler
  start() {
    if (this.running) return;
    this.running = true;
    
    this.interval = setInterval(() => this.tick(), 10000); // Check every 10s
    this.emit('started');
  }
  
  // Stop scheduler
  stop() {
    if (this.interval) clearInterval(this.interval);
    this.running = false;
    this.emit('stopped');
  }
  
  // Tick: run due jobs
  private async tick() {
    const now = Date.now();
    
    for (const [name, job] of this.jobs) {
      if (!job.enabled) continue;
      if (!job.nextRun || now < job.nextRun) continue;
      
      try {
        await job.handler();
        job.lastRun = now;
        this.emit('jobRun', { job: name, status: 'success' });
      } catch (e) {
        this.emit('jobRun', { job: name, status: 'error', error: (e as Error).message });
      }
      
      job.nextRun = parseCron(job.schedule);
    }
  }
  
  // List jobs
  listJobs() {
    return Array.from(this.jobs.values()).map(j => ({
      name: j.name,
      schedule: j.schedule,
      enabled: j.enabled,
      lastRun: j.lastRun,
      nextRun: j.nextRun,
    }));
  }
  
  // Get job
  getJob(name: string) {
    return this.jobs.get(name);
  }
}

// Default scheduler instance
export const scheduler = new Scheduler();

// Common job helpers
export function everyNMinutes(n: number, handler: () => Promise<void>) {
  return `*/${n} * * * *`;
}

import crypto from 'crypto';