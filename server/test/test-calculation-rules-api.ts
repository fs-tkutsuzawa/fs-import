/**
 * Comprehensive test script for Calculation Rules API
 * Tests all parameter types and CRUD operations
 */

import fetch from 'node-fetch';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = 'http://localhost:3001/api/calculation-rules';
const SCENARIO_ID = '1'; // Test scenario created earlier

// Database connection for verification
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

// Test data for different parameter types
const testCases = [
  {
    name: '1. Input Type (手入力)',
    accountId: 'ua-1',
    data: {
      targetAccountId: 'ua-1',
      scenarioId: SCENARIO_ID,
      type: 'input',
      config: {},
    },
  },
  {
    name: '2. Growth Rate Type (成長率)',
    accountId: 'ua-2',
    data: {
      targetAccountId: 'ua-2',
      scenarioId: SCENARIO_ID,
      type: 'growth_rate',
      config: {
        rate: 5.5, // 5.5% growth
      },
    },
  },
  {
    name: '3. Ratio Type (割合)',
    accountId: 'ua-3',
    data: {
      targetAccountId: 'ua-3',
      scenarioId: SCENARIO_ID,
      type: 'ratio',
      config: {
        targetAccountId: 'ua-1',
        targetAccountName: '売上高',
        ratio: 30, // 30% of target
      },
    },
  },
  {
    name: '4. Link Type (連動)',
    accountId: 'ua-4',
    data: {
      targetAccountId: 'ua-4',
      scenarioId: SCENARIO_ID,
      type: 'link',
      config: {
        targetAccountId: 'ua-1',
        targetAccountName: '売上高',
      },
    },
  },
  {
    name: '5. Sum Children Type (子科目合計)',
    accountId: 'ua-1', // Must have children
    data: {
      targetAccountId: 'ua-1',
      scenarioId: SCENARIO_ID,
      type: 'sum_children',
      config: {},
    },
  },
  {
    name: '6. Custom Calc Type (個別計算)',
    accountId: 'ua-10', // Use a different account to avoid conflicts
    data: {
      targetAccountId: 'ua-10',
      scenarioId: SCENARIO_ID,
      type: 'custom_calc',
      config: {
        children: [
          { accountId: 'ua-11', operator: '+' },
          { accountId: 'ua-12', operator: '-' },
        ],
      },
    },
  },
  {
    name: '7. Previous End + Change Type (前期末+変動)',
    accountId: 'ua-2',
    data: {
      targetAccountId: 'ua-2',
      scenarioId: SCENARIO_ID,
      type: 'prev_end_plus_change',
      config: {
        flows: [
          {
            flowAccountId: 'ua-3',
            flowAccountSheet: 'PL',
            sign: '+',
            counterAccountId: 'ua-4',
          },
          {
            flowAccountId: 'ua-1',
            flowAccountSheet: 'PL',
            sign: '-',
            counterAccountId: '',
          },
        ],
      },
    },
  },
];

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.cyan);
  console.log('='.repeat(60));
}

function logTest(name: string, success: boolean, details?: string) {
  const status = success ? '✓' : '✗';
  const color = success ? colors.green : colors.red;
  log(`${status} ${name}`, color);
  if (details) {
    console.log(`  ${details}`);
  }
}

async function testCreate(testCase: any): Promise<boolean> {
  try {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCase.data),
    });

    const result = await response.json();

    if (response.ok) {
      logTest(testCase.name, true, `Created rule ID: ${result.id}`);
      return true;
    } else {
      logTest(testCase.name, false, `Error: ${result.error || result.details}`);
      return false;
    }
  } catch (error) {
    logTest(testCase.name, false, `Exception: ${error.message}`);
    return false;
  }
}

async function testRead(): Promise<boolean> {
  logSection('READ Operations Test');

  const testQueries = [
    { name: 'Get all rules', query: '' },
    { name: 'Filter by scenario', query: `?scenarioId=${SCENARIO_ID}` },
    { name: 'Filter by account', query: '?targetAccountId=ua-1' },
    {
      name: 'Filter by both',
      query: `?scenarioId=${SCENARIO_ID}&targetAccountId=ua-1`,
    },
  ];

  let allPassed = true;

  for (const test of testQueries) {
    try {
      const response = await fetch(`${API_BASE_URL}${test.query}`);
      const result = await response.json();

      if (response.ok && Array.isArray(result)) {
        logTest(test.name, true, `Retrieved ${result.length} rules`);
      } else {
        logTest(test.name, false, 'Invalid response');
        allPassed = false;
      }
    } catch (error) {
      logTest(test.name, false, `Exception: ${error.message}`);
      allPassed = false;
    }
  }

  return allPassed;
}

async function testUpdate(): Promise<boolean> {
  logSection('UPDATE Operations Test');

  try {
    // First get a rule to update
    const getResponse = await fetch(
      `${API_BASE_URL}?scenarioId=${SCENARIO_ID}`
    );
    const rules = await getResponse.json();

    if (!rules || rules.length === 0) {
      log('No rules found to update', colors.yellow);
      return false;
    }

    const ruleToUpdate = rules[0];

    // Update the rule
    const updateData = {
      id: ruleToUpdate.id,
      type: 'growth_rate',
      config: { rate: 10 }, // Change to 10%
    };

    const updateResponse = await fetch(API_BASE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    });

    const result = await updateResponse.json();

    if (updateResponse.ok) {
      logTest('Update existing rule', true, `Updated rule ID: ${result.id}`);
      return true;
    } else {
      logTest('Update existing rule', false, `Error: ${result.error}`);
      return false;
    }
  } catch (error) {
    logTest('Update operation', false, `Exception: ${error.message}`);
    return false;
  }
}

async function testDelete(): Promise<boolean> {
  logSection('DELETE Operations Test');

  try {
    // Get a rule to delete
    const getResponse = await fetch(
      `${API_BASE_URL}?scenarioId=${SCENARIO_ID}`
    );
    const rules = await getResponse.json();

    if (!rules || rules.length === 0) {
      log('No rules found to delete', colors.yellow);
      return false;
    }

    const ruleToDelete = rules[rules.length - 1];

    // Delete the rule
    const deleteResponse = await fetch(
      `${API_BASE_URL}?id=${ruleToDelete.id}`,
      {
        method: 'DELETE',
      }
    );

    const result = await deleteResponse.json();

    if (deleteResponse.ok) {
      logTest('Delete rule', true, `Deleted rule ID: ${ruleToDelete.id}`);
      return true;
    } else {
      logTest('Delete rule', false, `Error: ${result.error}`);
      return false;
    }
  } catch (error) {
    logTest('Delete operation', false, `Exception: ${error.message}`);
    return false;
  }
}

async function testErrorCases(): Promise<boolean> {
  logSection('Error Cases Test');

  const errorCases = [
    {
      name: 'Missing required fields',
      data: { type: 'growth_rate' },
      expectedError: true,
    },
    {
      name: 'Invalid scenario ID',
      data: {
        targetAccountId: 'ua-1',
        scenarioId: '999999',
        type: 'input',
        config: {},
      },
      expectedError: true,
    },
    {
      name: 'Invalid account ID format',
      data: {
        targetAccountId: 'invalid-format',
        scenarioId: SCENARIO_ID,
        type: 'input',
        config: {},
      },
      expectedError: true,
    },
    {
      name: 'Unknown parameter type',
      data: {
        targetAccountId: 'ua-1',
        scenarioId: SCENARIO_ID,
        type: 'unknown_type',
        config: {},
      },
      expectedError: true,
    },
  ];

  let allPassed = true;

  for (const errorCase of errorCases) {
    try {
      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorCase.data),
      });

      if (!response.ok && errorCase.expectedError) {
        logTest(errorCase.name, true, 'Error handled correctly');
      } else if (response.ok && !errorCase.expectedError) {
        logTest(errorCase.name, true, 'Success as expected');
      } else {
        logTest(errorCase.name, false, 'Unexpected result');
        allPassed = false;
      }
    } catch (error) {
      if (errorCase.expectedError) {
        logTest(errorCase.name, true, 'Error expected and caught');
      } else {
        logTest(
          errorCase.name,
          false,
          `Unexpected exception: ${error.message}`
        );
        allPassed = false;
      }
    }
  }

  return allPassed;
}

async function verifyDatabase(): Promise<void> {
  logSection('Database Verification');

  const client = await pool.connect();

  try {
    // Count rules by type
    const typeCount = await client.query(
      `
      SELECT rule_type, COUNT(*) as count
      FROM calculation_rules
      WHERE scenario_id = $1
      GROUP BY rule_type
    `,
      [SCENARIO_ID]
    );

    log('Rules by type:', colors.blue);
    typeCount.rows.forEach((row) => {
      console.log(`  ${row.rule_type}: ${row.count} rules`);
    });

    // Show sample rule definitions
    const sampleRules = await client.query(
      `
      SELECT 
        target_user_account_id,
        rule_type,
        jsonb_pretty(rule_definition) as definition
      FROM calculation_rules
      WHERE scenario_id = $1
      LIMIT 3
    `,
      [SCENARIO_ID]
    );

    log('\nSample rule definitions:', colors.blue);
    sampleRules.rows.forEach((row) => {
      console.log(
        `\n  Account ${row.target_user_account_id} (${row.rule_type}):`
      );
      console.log(`  ${row.definition}`);
    });
  } finally {
    client.release();
  }
}

async function cleanup(): Promise<void> {
  logSection('Cleanup');

  const client = await pool.connect();

  try {
    // Delete all test rules
    const result = await client.query(
      `
      DELETE FROM calculation_rules
      WHERE scenario_id = $1
    `,
      [SCENARIO_ID]
    );

    log(`Deleted ${result.rowCount} test rules`, colors.yellow);
  } finally {
    client.release();
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  log('CALCULATION RULES API COMPREHENSIVE TEST', colors.magenta);
  console.log('='.repeat(60));

  try {
    // Test CREATE operations for all parameter types
    logSection('CREATE Operations Test - All Parameter Types');

    for (const testCase of testCases) {
      await testCreate(testCase);
      await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay between requests
    }

    // Test READ operations
    await testRead();

    // Test UPDATE operations
    await testUpdate();

    // Verify database state
    await verifyDatabase();

    // Test DELETE operations
    await testDelete();

    // Test error cases
    await testErrorCases();

    // Final verification
    await verifyDatabase();

    // Cleanup
    const cleanupAnswer = process.argv[2];
    if (cleanupAnswer === '--cleanup') {
      await cleanup();
    } else {
      log(
        '\nTest data preserved. Run with --cleanup to remove test data.',
        colors.yellow
      );
    }

    log('\n✨ All tests completed!', colors.green);
  } catch (error) {
    log(`\n❌ Test failed with error: ${error.message}`, colors.red);
    console.error(error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Check if server is running
fetch(API_BASE_URL)
  .then(() => {
    runAllTests();
  })
  .catch(() => {
    log('❌ Server is not running on http://localhost:3001', colors.red);
    log(
      'Please start the server with: cd /workspace/server && npm run dev',
      colors.yellow
    );
    process.exit(1);
  });
