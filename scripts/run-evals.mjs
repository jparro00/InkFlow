/**
 * Agent Eval Runner
 *
 * Calls the agent-parse edge function for each eval case and checks
 * the response against expected values. Outputs a pass/fail report.
 *
 * Usage:
 *   npm run eval
 *
 * Required env vars (in .env or exported):
 *   EVAL_EMAIL    — Supabase auth email for the dev project
 *   EVAL_PASSWORD — Supabase auth password for the dev project
 *
 * Or pass them inline:
 *   EVAL_EMAIL=you@example.com EVAL_PASSWORD=secret npm run eval
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ── Config ──────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://kshwkljbhbwyqumnxuzu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzaHdrbGpiaGJ3eXF1bW54dXp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNDg1NzgsImV4cCI6MjA5MTgyNDU3OH0.cOQA-iz60Ut-4RRpRPnKKXf7U1OqjUqCe-aJUEyXkzs';

// ── Load env from .env file if vars not already set ─────────────────

function loadEnv() {
  if (process.env.EVAL_EMAIL && process.env.EVAL_PASSWORD) return;
  try {
    const envFile = readFileSync('.env', 'utf-8');
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env not found, that's fine
  }
}

loadEnv();

const email = process.env.EVAL_EMAIL;
const password = process.env.EVAL_PASSWORD;

if (!email || !password) {
  console.error(
    '\n  Missing EVAL_EMAIL and/or EVAL_PASSWORD.\n' +
      '  Set them in your .env file or pass inline:\n\n' +
      '    EVAL_EMAIL=you@example.com EVAL_PASSWORD=secret npm run eval\n'
  );
  process.exit(1);
}

// ── Load evals ──────────────────────────────────────────────────────

const evalsFile = JSON.parse(readFileSync('evals/agent-evals.json', 'utf-8'));
const evals = evalsFile.evals;

// ── Auth ────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function authenticate() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    console.error('Auth failed:', error.message);
    process.exit(1);
  }
  return data.session;
}

// ── Call edge function ──────────────────────────────────────────────

async function callAgentParse(text, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { error: `HTTP ${res.status}: ${body}` };
  }

  return res.json();
}

// ── Assertion helpers ───────────────────────────────────────────────

function checkAgent(actual, expected) {
  if (actual !== expected) {
    return { pass: false, msg: `agent: expected "${expected}", got "${actual}"` };
  }
  return { pass: true };
}

function checkAction(actual, expected) {
  if (actual !== expected) {
    return { pass: false, msg: `action: expected "${expected}", got "${actual}"` };
  }
  return { pass: true };
}

function checkEntities(actual, expected) {
  const failures = [];

  for (const [key, expectedVal] of Object.entries(expected)) {
    // Skip date fields — they depend on "today" and we can't assert exact ISO values.
    // `dob` is included because month-only prompts ("april 15") can't pin a specific year.
    if (
      key === 'date' ||
      key === 'date_range_start' ||
      key === 'date_range_end' ||
      key === 'dob'
    ) {
      // Just check the field was extracted (present and non-empty)
      if (expectedVal && !actual[key]) {
        failures.push(`${key}: expected a value, got nothing`);
      }
      continue;
    }

    const actualVal = actual[key];

    // String comparison (case-insensitive for names)
    if (typeof expectedVal === 'string') {
      if (typeof actualVal !== 'string') {
        failures.push(`${key}: expected "${expectedVal}", got ${JSON.stringify(actualVal)}`);
      } else if (key === 'client_name' || key === 'name') {
        // Case-insensitive for names
        if (actualVal.toLowerCase() !== expectedVal.toLowerCase()) {
          failures.push(`${key}: expected "${expectedVal}", got "${actualVal}"`);
        }
      } else if (actualVal !== expectedVal) {
        failures.push(`${key}: expected "${expectedVal}", got "${actualVal}"`);
      }
      continue;
    }

    // Number comparison
    if (typeof expectedVal === 'number') {
      if (actualVal !== expectedVal) {
        failures.push(`${key}: expected ${expectedVal}, got ${actualVal}`);
      }
      continue;
    }

    // Boolean comparison
    if (typeof expectedVal === 'boolean') {
      if (actualVal !== expectedVal) {
        failures.push(`${key}: expected ${expectedVal}, got ${actualVal}`);
      }
      continue;
    }

    // Array comparison (tags)
    if (Array.isArray(expectedVal)) {
      if (!Array.isArray(actualVal)) {
        failures.push(`${key}: expected array, got ${JSON.stringify(actualVal)}`);
      }
      // Don't check exact array contents — just that it's an array
      continue;
    }
  }

  // Check for notes containing client names (a common AI mistake)
  if (actual.notes && actual.client_name) {
    if (actual.notes.toLowerCase().includes(actual.client_name.toLowerCase())) {
      failures.push(`notes contains client_name "${actual.client_name}" — should only have tattoo details`);
    }
  }

  return failures;
}

// ── Run ─────────────────────────────────────────────────────────────

async function run() {
  console.log('\n  InkBloop Agent Eval Runner');
  console.log('  ─────────────────────────\n');

  const session = await authenticate();
  console.log(`  Authenticated as ${email}`);
  console.log(`  Running ${evals.length} evals against agent-parse...\n`);

  const results = [];
  let passed = 0;
  let failed = 0;

  // Filter by category if CLI arg provided
  const filterArg = process.argv[2];
  const filtered = filterArg
    ? evals.filter((e) => e.category.includes(filterArg))
    : evals;

  if (filterArg) {
    console.log(`  Filtering to category: "${filterArg}" (${filtered.length} evals)\n`);
  }

  // Verbose mode: show prompts for all evals (default). Use --quiet for compact.
  const quiet = process.argv.includes('--quiet') || process.argv.includes('-q');
  let currentCategory = '';

  for (const evalCase of filtered) {
    const { id, prompt, expected_parse, category, resolution } = evalCase;

    // Print category header when it changes
    if (category !== currentCategory) {
      currentCategory = category;
      console.log(`\n  ── ${category} ${'─'.repeat(Math.max(0, 50 - category.length))}\n`);
    }

    const result = await callAgentParse(prompt, session.access_token);

    if (result.error) {
      console.log(`  ❌ ${id}`);
      console.log(`     Prompt:  "${prompt}"`);
      console.log(`     Error:   ${result.error}\n`);
      results.push({ id, status: 'error', error: result.error });
      failed++;
      continue;
    }

    const failures = [];

    // Check agent
    const agentCheck = checkAgent(result.agent, expected_parse.agent);
    if (!agentCheck.pass) failures.push(agentCheck.msg);

    // Check action
    const actionCheck = checkAction(result.action, expected_parse.action);
    if (!actionCheck.pass) failures.push(actionCheck.msg);

    // Check entities
    if (expected_parse.entities) {
      const entityFailures = checkEntities(result.entities || {}, expected_parse.entities);
      failures.push(...entityFailures);
    }

    // Format key entities for display (skip date ISOs, just show what matters)
    const entitiesDisplay = Object.entries(result.entities || {})
      .filter(([k]) => k !== 'date' && k !== 'date_range_start' && k !== 'date_range_end')
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    const hasDate = result.entities?.date || result.entities?.date_range_start;
    const dateNote = hasDate ? ' +date' : '';
    const parsedLine = `${result.agent}/${result.action} → {${entitiesDisplay}${dateNote}}`;

    if (failures.length === 0) {
      if (quiet) {
        console.log(`  ✅ ${id}`);
      } else {
        console.log(`  ✅ ${id}`);
        console.log(`     Prompt:  "${prompt}"`);
        console.log(`     Parsed:  ${parsedLine}`);
        console.log(`     Expect:  ${resolution}`);
      }
      results.push({ id, status: 'pass', actual: result });
      passed++;
    } else {
      console.log(`  ❌ ${id}`);
      console.log(`     Prompt:  "${prompt}"`);
      console.log(`     Parsed:  ${parsedLine}`);
      console.log(`     Expect:  ${expected_parse.agent}/${expected_parse.action}`);
      for (const f of failures) {
        console.log(`     FAIL:    ${f}`);
      }
      results.push({ id, status: 'fail', failures, actual: result });
      failed++;
    }

    // Small delay to avoid hammering the API
    await new Promise((r) => setTimeout(r, 200));
  }

  // ── Summary ───────────────────────────────────────────────────────

  // ── Write detailed results file ────────────────────────────────────

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const detailedResults = filtered.map((evalCase) => {
    const result = results.find((r) => r.id === evalCase.id);
    return {
      id: evalCase.id,
      category: evalCase.category,
      prompt: evalCase.prompt,
      context: evalCase.context,
      expected: {
        agent: evalCase.expected_parse.agent,
        action: evalCase.expected_parse.action,
        entities: evalCase.expected_parse.entities,
      },
      actual: result?.actual || null,
      expected_resolution: evalCase.resolution,
      expected_outcome: evalCase.expected_outcome,
      status: result?.status || 'unknown',
      failures: result?.failures || [],
    };
  });

  const report = {
    timestamp: new Date().toISOString(),
    total: filtered.length,
    passed,
    failed,
    pass_rate: `${((passed / filtered.length) * 100).toFixed(0)}%`,
    filter: filterArg || null,
    results: detailedResults,
  };

  mkdirSync('evals/results', { recursive: true });
  const resultsPath = `evals/results/eval-${timestamp}.json`;
  const latestPath = 'evals/results/latest.json';
  writeFileSync(resultsPath, JSON.stringify(report, null, 2));
  writeFileSync(latestPath, JSON.stringify(report, null, 2));

  // ── Console summary ───────────────────────────────────────────────

  console.log(`\n  ${'═'.repeat(56)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${filtered.length} (${((passed / filtered.length) * 100).toFixed(0)}%)`);
  console.log(`  Detailed results: ${resultsPath}`);

  // Category breakdown
  const byCategory = {};
  for (const r of results) {
    const evalCase = filtered.find((e) => e.id === r.id);
    const cat = evalCase?.category || 'unknown';
    if (!byCategory[cat]) byCategory[cat] = { passed: 0, failed: 0, evals: [] };
    if (r.status === 'pass') byCategory[cat].passed++;
    else byCategory[cat].failed++;
    byCategory[cat].evals.push(r);
  }

  console.log('\n  By category:');
  for (const [cat, data] of Object.entries(byCategory)) {
    const total = data.passed + data.failed;
    const icon = data.failed === 0 ? '✅' : '❌';
    const failedIds = data.evals
      .filter((r) => r.status !== 'pass')
      .map((r) => r.id);
    const failNote = failedIds.length > 0 ? `  ← failed: ${failedIds.join(', ')}` : '';
    console.log(`    ${icon} ${cat}: ${data.passed}/${total}${failNote}`);
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
