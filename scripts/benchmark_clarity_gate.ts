import { verifyClarity } from '../src/lib/chat/clarity-gate';
require('dotenv').config({ path: '.env.local' });

// Mock documents for benchmark validation
const BENCHMARK_CASES = [
  {
    name: 'Case 1: Fully Compliant / Clear Document',
    text: `
      Information Security Policy.
      Approved by: Management Board on Jan 15, 2026.
      This document defines the roles and responsibilities for all staff members.
      Each employee is required to complete the security awareness training annually.
      All access keys are rotated every 90 days.
    `,
    expectedStatus: 'CLEAR',
    expectedIssuesCount: 0,
  },
  {
    name: 'Case 2: Future State Described as Present (Violation of Point 7)',
    text: `
      Our operational backup system runs on a multi-cloud serverless cluster that eliminates all single points of failure.
      We are currently planning to implement database replication across AWS and Google Cloud next year, which is already fully operational today and handles 100% of our transactional load.
    `,
    expectedStatus: 'UNCLEAR',
    expectedIssueCode: 'POINT-7', // Future state as present
  },
  {
    name: 'Case 3: Direct Data Contradiction (Violation of Point 5)',
    text: `
      Corporate Travel Policy.
      The maximum budget allowed for international flights is $1,500 per trip.
      Employees must obtain CFO approval for any flight exceeding $1,000.
      Section 4: The maximum budget allowed for international flights is strictly capped at $800.
    `,
    expectedStatus: 'UNCLEAR',
    expectedIssueCode: 'POINT-5', // Data consistency
  },
  {
    name: 'Case 4: Authoritative Unvalidated Metrics (Violation of Point 4)',
    text: `
      Quarterly Security Operations Report.
      During this quarter, we successfully blocked 100% of all malware attacks.
      Our threat detection team resolved 99.98% of security incidents within 5 minutes.
      We also maintained a 0.00% server failure rate across our main systems.
    `,
    expectedStatus: 'UNCLEAR',
    expectedIssueCode: 'POINT-4', // Authoritative unvalidated data
  }
];

async function runBenchmark() {
  console.log('🏁 Starting Clarity Gate Prompt Benchmark (v2.1)...');
  console.log('--------------------------------------------------');

  let passedTests = 0;

  for (const tc of BENCHMARK_CASES) {
    console.log(`Running case: "${tc.name}"...`);
    try {
      const result = await verifyClarity(tc.text);
      
      console.log(`  → Clarity Status: ${result.clarityStatus}`);
      console.log(`  → Issues Found: ${result.issues.length}`);
      
      let pass = false;
      if (tc.expectedStatus === 'CLEAR') {
        pass = result.clarityStatus === 'CLEAR';
      } else {
        // For UNCLEAR cases, verify that it is UNCLEAR and has detected issues
        pass = result.clarityStatus === 'UNCLEAR' && result.issues.length > 0;
      }

      if (pass) {
        console.log('  ✅ PASS');
        passedTests++;
      } else {
        console.log('  ❌ FAIL');
        console.log('  Response Payload:', JSON.stringify(result, null, 2));
      }
    } catch (err) {
      console.error(`  💥 ERROR executing case:`, err);
    }
    console.log('--------------------------------------------------');
  }

  const successRate = (passedTests / BENCHMARK_CASES.length) * 100;
  console.log(`📊 Benchmark Summary: ${passedTests}/${BENCHMARK_CASES.length} cases passed (${successRate.toFixed(1)}% success)`);

  if (passedTests === BENCHMARK_CASES.length) {
    console.log('✅ Benchmark completed successfully! All cases behaved as expected.');
    process.exit(0);
  } else {
    console.warn('⚠️ Benchmark completed with failures. Prompt adjustments may be needed.');
    process.exit(1);
  }
}

// Check for API key before running
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY environment variable is not defined in .env.local.');
  process.exit(1);
}

runBenchmark();
