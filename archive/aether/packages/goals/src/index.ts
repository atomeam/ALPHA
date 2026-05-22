/**
 * Goals / Intent Layer
 * 
 * Top-down direction for the agent system.
 * Objectives, priorities, and current focus above the reactive loop.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Goal definition
export interface Goal {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'active' | 'completed' | 'paused' | 'archived';
  focus: string; // Current area of focus (e.g., "fix-auth", "performance", "security")
  outcomes: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

const GOALS_PATH = path.resolve(process.cwd(), '../../logs/goals.jsonl');

function ensureDir() {
  const dir = path.dirname(GOALS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Create a new goal
export function createGoal(options: {
  title: string;
  description?: string;
  priority?: Goal['priority'];
  focus?: string;
  outcomes?: string[];
}): Goal {
  ensureDir();
  
  const goal: Goal = {
    id: crypto.randomUUID(),
    title: options.title,
    description: options.description || '',
    priority: options.priority || 'medium',
    status: 'active',
    focus: options.focus || 'general',
    outcomes: options.outcomes || [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  fs.appendFileSync(GOALS_PATH, JSON.stringify(goal) + '\n');
  return goal;
}

// Get active goals
export function getActiveGoals(limit = 10): Goal[] {
  if (!fs.existsSync(GOALS_PATH)) return [];
  
  const content = fs.readFileSync(GOALS_PATH, 'utf-8');
  const goals = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Goal);
  
  return goals
    .filter(g => g.status === 'active')
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, limit);
}

// Get current focus area
export function getCurrentFocus(): string {
  const active = getActiveGoals(1);
  return active.length > 0 ? active[0].focus : 'general';
}

// Check if task aligns with goals
export function alignsWithGoals(taskPattern: string): { aligned: boolean; goalId?: string; reasoning: string } {
  const active = getActiveGoals(3);
  
  if (active.length === 0) {
    return { aligned: true, reasoning: 'No active goals - default allow' };
  }
  
  for (const goal of active) {
    // Check if focus matches
    if (taskPattern.toLowerCase().includes(goal.focus.toLowerCase())) {
      return { aligned: true, goalId: goal.id, reasoning: `Matches goal focus: ${goal.focus}` };
    }
    
    // Check outcomes
    for (const outcome of goal.outcomes) {
      if (taskPattern.toLowerCase().includes(outcome.toLowerCase())) {
        return { aligned: true, goalId: goal.id, reasoning: `Matches goal outcome: ${outcome}` };
      }
    }
  }
  
  return { 
    aligned: false, 
    reasoning: `No active goal matches: ${taskPattern}` 
  };
}

// Complete a goal
export function completeGoal(id: string): Goal | null {
  if (!fs.existsSync(GOALS_PATH)) return null;
  
  const content = fs.readFileSync(GOALS_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  let found = null;
  const newLines = lines.map(line => {
    const goal = JSON.parse(line) as Goal;
    if (goal.id === id && goal.status === 'active') {
      goal.status = 'completed';
      goal.completedAt = Date.now();
      goal.updatedAt = Date.now();
      found = goal;
    }
    return JSON.stringify(goal);
  });
  
  if (found) {
    fs.writeFileSync(GOALS_PATH, newLines.join('\n') + '\n');
  }
  
  return found;
}

// Pause a goal
export function pauseGoal(id: string): Goal | null {
  if (!fs.existsSync(GOALS_PATH)) return null;
  
  const content = fs.readFileSync(GOALS_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  let found = null;
  const newLines = lines.map(line => {
    const goal = JSON.parse(line) as Goal;
    if (goal.id === id) {
      goal.status = 'paused';
      goal.updatedAt = Date.now();
      found = goal;
    }
    return JSON.stringify(goal);
  });
  
  if (found) {
    fs.writeFileSync(GOALS_PATH, newLines.join('\n') + '\n');
  }
  
  return found;
}

// Get goals by focus area
export function getGoalsByFocus(focus: string): Goal[] {
  if (!fs.existsSync(GOALS_PATH)) return [];
  
  const content = fs.readFileSync(GOALS_PATH, 'utf-8');
  const goals = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Goal);
  
  return goals.filter(g => g.focus === focus && g.status === 'active');
}

// List all unique focus areas
export function getFocusAreas(): string[] {
  if (!fs.existsSync(GOALS_PATH)) return [];
  
  const content = fs.readFileSync(GOALS_PATH, 'utf-8');
  const goals = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Goal);
  
  const areas = new Set(goals.map(g => g.focus));
  return Array.from(areas);
}