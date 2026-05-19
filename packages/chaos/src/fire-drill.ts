/**
 * Fire Drill - Stripe Webhook Convene Test
 * 
 * Triggers a deterministic Convene session to showcase cross-assistant coordination.
 * Run this to generate a clean demo run.
 * 
 * Usage: npx tsx packages/chaos/src/fire-drill.ts
 */

const CONVENE_URL = process.env.CONVENE_URL || 'http://localhost:8080';
const PROFILE_ID = process.env.PROFILE_ID || 'prod-user';

interface ConvenePayload {
  question: string;
  context: Record<string, unknown>;
  requiredScopes?: string[];
}

interface ConveneResponse {
  sessionId: string;
  question: string;
  votes: Array<{
    assistantName: string;
    scope: string;
    vote: string;
    confidence: number;
    rationale: string;
  }>;
  consensus: number;
  recommended: string;
  resolution: string;
  narrative: string;
  requiresApproval: boolean;
}

async function triggerFireDrill(): Promise<void> {
  console.log('🔥 Initializing Loxa Fire Drill...\n');

  const payload: ConvenePayload = {
    question: 'Stripe Charge Webhook (ch_3Mv8x) failed with ECONNREFUSED on retry #3.',
    context: {
      customerId: 'cus_AdamBeam88',
      invoiceId: 'in_123_test',
      amount: 4200,
      error: 'ECONNREFUSED',
      gateway: 'stripe',
      retryAttempt: 3,
    },
    requiredScopes: ['payments', 'infrastructure', 'support'],
  };

  console.log(`📋 Question: ${payload.question}`);
  console.log(`📦 Context:`, payload.context);
  console.log(`🎯 Scopes: ${payload.requiredScopes?.join(', ')}\n`);

  try {
    const response = await fetch(`${CONVENE_URL}/api/profile/${PROFILE_ID}/convene`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const session: ConveneResponse = await response.json();

    console.log('🏛️  The Council Has Adjourned:\n');
    console.log(`   Session ID: ${session.sessionId}`);
    console.log(`   Resolution: ${session.resolution.toUpperCase()}`);
    console.log(`   Consensus: ${(session.consensus * 100).toFixed(0)}%`);
    console.log(`   Requires Approval: ${session.requiresApproval ? 'YES' : 'NO'}\n`);

    console.log('📜 Votes Cast:');
    for (const vote of session.votes) {
      console.log(`   • ${vote.assistantName} (${vote.scope}): ${vote.vote.toUpperCase()} (${(vote.confidence * 100).toFixed(0)}%)`);
      console.log(`     └─ ${vote.rationale}\n`);
    }

    console.log(`📖 Narrative:`);
    console.log(`   "${session.narrative}"\n`);

    // Exit with appropriate code
    if (session.resolution === 'escalated_to_triage') {
      console.log('⚠️  Escalated to human review - demo requires manual approval');
      process.exit(0);
    }

    console.log('✅ Fire drill complete');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Fire drill failed:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
triggerFireDrill();