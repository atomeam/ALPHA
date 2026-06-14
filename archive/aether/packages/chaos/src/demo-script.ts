/**
 * Demo Script - What the Viewer Sees
 * 
 * Copy this narrative for your 60-second demo video.
 * 
 * ======================
 * 00:00 - 00:15 [THE CHAOS]
 * ======================
 * 
 * Terminal showing webhook failure:
 * 
 * $ stripe webhook listen --forward-to localhost:8080/webhook
 * > 2024-01-15T03:42:00Z ch_3Mv8x: charge.failed
 * > 2024-01-15T03:42:01Z ch_3Mv8x: retry 1/3
 * > 2024-01-15T03:42:15Z ch_3Mv8x: retry 2/3
 * > 2024-01-15T03:42:30Z ch_3Mv8x: retry 3/3 FAILED
 * > ECONNREFUSED - downstream unavailable
 * 
 * ======================
 * 00:15 - 00:45 [THE MEETING]
 * ======================
 * 
 * Switch to Loxa Dashboard - Convene Panel:
 * 
 * ┌─────────────────────────────────────────────┐
 * │  🏛️ COUNCIL IN SESSION              │
 * │                                     │
 * │  Issue: Stripe webhook failed retry #3    │
 * │                                     │
 * │  ─── VOTING NOW ───               │
 * │  ⚡ Aether Evaluator (code)     [██████] 82%
 * │     "Pattern matches lesson #4471"        │
 * │                                     │
 * │  📡 Aether Foresight (infra) [█████] 65%
 * │     "Predicts 40% cascade"            │
 * │                                     │
 * │  ─── CONSENSUS ───               │
 * │  Consensus: 73%                  │
 * │  → ESCALATE TO HUMAN               │
 * │                                     │
 * └─────────────────────────────────────────────┘
 * 
 * ======================
 * 00:45 - 01:00 [THE RESOLUTION]
 * ======================
 * 
 * Storyteller Ticket (auto-generated):
 * 
 * ┌─────────────────────────────────────────────┐
 * │  🔖 TICKET #4471-2024              │
 * │                                     │
 * │  Stripe webhook failed               │
 * │  2 assistants convened           │
 * │  Consensus: 73%                 │
 * │                                     │
 * │  RECOMMENDATION: Full refund     │
 * │     └─ Aether Evaluator (82%)        │
 * │     └─ Aether Foresight (65%)        │
 * │                                     │
 * │  [✓ APPROVE] [✗ REJECT]       │
 * └─────────────────────────────────────────────┘
 * 
 * ======================
 * BUMPER STICKER
 * ======================
 * "Your AI tools don't just have memory. 
 *  They have meetings."
 */

export const DEMO_SCRIPT = `
TITLE: Loxa - AI Coordination Demo
DURATION: 60 seconds

[OPEN on split terminal + dashboard]

TERMINAL (left):
> stripe webhook listen
> ch_3Mv8x: charge.failed
> ch_3Mv8x: retry 1/3... retry 2/3... retry 3/3 FAILED
> ECONNREFUSED

VOICEOVER (you):
"Every AI assistant you use handles its own errors. 
This one? It talks to the others."

[DASHBOARD - Convene panel fills in live]

VOICEOVER:
"Let's see what happens when Stripe, your codebase, 
and your predictive system talk it through."

[SINGLE APPROVE BUTTON]

VOICEOVER:
"One recommendation. One click. Your AI team sorted it."

[END on bumper sticker]
"Your AI tools don't just have memory.
 They have meetings."
`;

export const UI_MOCKUP = {
  sessionPanel: {
    header: '🏛️ COUNCIL IN SESSION',
    issue: 'Stripe webhook failed retry #3',
    votes: [
      { assistant: 'Aether Evaluator', scope: 'code', vote: 'approve', confidence: 0.82, rationale: 'Pattern matches lesson #4471' },
      { assistant: 'Aether Foresight', scope: 'infrastructure', vote: 'escalate', confidence: 0.65, rationale: '40% cascade risk' },
    ],
    consensus: 0.73,
    recommended: 'escalate',
    resolution: 'escalated_to_triage',
  },
  ticket: {
    id: '#4471-2024',
    issue: 'Stripe webhook failed',
    assistantsConvered: 2,
    consensus: '73%',
    recommendation: 'Full refund',
    votes: ['Aether Evaluator (82%)', 'Ather Foresight (65%)'],
  },
};

console.log(DEMO_SCRIPT);
console.log('\nRun this script to see the demo narrative.');