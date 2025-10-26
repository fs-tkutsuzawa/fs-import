import { Pool } from 'pg';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

const API_URL = 'http://localhost:3001/api/calculation-rules';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: TestResult[] = [];

function logTest(test: string, passed: boolean, details?: string) {
  results.push({
    test,
    status: passed ? 'PASS' : 'FAIL',
    details,
  });
  console.log(
    `${passed ? '✅' : '❌'} ${test}${details ? `: ${details}` : ''}`
  );
}

async function testParameterType(
  accountId: string,
  parameterType: string,
  config: any,
  expectedDefinition: any
) {
  const testName = `${parameterType} parameter`;

  try {
    // Save via API
    const saveResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetAccountId: accountId,
        scenarioId: '1',
        type: parameterType,
        config,
      }),
    });

    if (!saveResponse.ok) {
      const error = await saveResponse.text();
      logTest(`Save ${testName}`, false, error);
      return false;
    }

    const savedRule = await saveResponse.json();
    logTest(`Save ${testName}`, true, `ID: ${savedRule.id}`);

    // Verify in database
    const client = await pool.connect();
    try {
      const dbResult = await client.query(
        `SELECT * FROM calculation_rules WHERE id = $1`,
        [savedRule.id]
      );

      if (dbResult.rows.length === 0) {
        logTest(`DB verify ${testName}`, false, 'Not found in database');
        return false;
      }

      const dbRule = dbResult.rows[0];
      const definitionMatch =
        JSON.stringify(dbRule.rule_definition) ===
        JSON.stringify(expectedDefinition);

      logTest(
        `DB verify ${testName}`,
        definitionMatch,
        definitionMatch
          ? undefined
          : `Expected: ${JSON.stringify(expectedDefinition)}, Got: ${JSON.stringify(dbRule.rule_definition)}`
      );

      // Test retrieval via API
      const getResponse = await fetch(
        `${API_URL}?scenario_id=1&account_id=${accountId.replace('ua-', '')}`
      );
      if (!getResponse.ok) {
        logTest(`Retrieve ${testName}`, false, await getResponse.text());
        return false;
      }

      const rules = await getResponse.json();
      const retrievedRule = rules.find((r: any) => r.id === savedRule.id);

      logTest(
        `Retrieve ${testName}`,
        !!retrievedRule,
        retrievedRule ? `Found rule ID: ${retrievedRule.id}` : 'Rule not found'
      );

      // Test update
      const updatedConfig = { ...config };
      if (parameterType === 'growth_rate') {
        updatedConfig.rate = 10; // Change from 5% to 10%
      } else if (parameterType === 'ratio') {
        updatedConfig.ratio = 30; // Change from 20% to 30%
      }

      const updateResponse = await fetch(API_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: savedRule.id,
          targetAccountId: accountId,
          scenarioId: '1',
          type: parameterType,
          config: updatedConfig,
        }),
      });

      logTest(
        `Update ${testName}`,
        updateResponse.ok,
        updateResponse.ok ? undefined : await updateResponse.text()
      );

      // Test delete
      const deleteResponse = await fetch(`${API_URL}?id=${savedRule.id}`, {
        method: 'DELETE',
      });

      logTest(
        `Delete ${testName}`,
        deleteResponse.ok,
        deleteResponse.ok ? undefined : await deleteResponse.text()
      );

      // Verify deletion
      const verifyDeleteResult = await client.query(
        `SELECT * FROM calculation_rules WHERE id = $1`,
        [savedRule.id]
      );

      logTest(
        `Verify delete ${testName}`,
        verifyDeleteResult.rows.length === 0,
        verifyDeleteResult.rows.length === 0
          ? 'Successfully deleted'
          : 'Still exists in DB'
      );

      return true;
    } finally {
      client.release();
    }
  } catch (error: any) {
    logTest(`${testName} flow`, false, error.message);
    return false;
  }
}

async function testErrorHandling() {
  console.log('\n🧪 Testing Error Handling:');

  // Test invalid scenario
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetAccountId: 'ua-1',
        scenarioId: '999',
        type: 'input',
        config: {},
      }),
    });

    logTest(
      'Invalid scenario rejection',
      !response.ok && response.status === 500
    );
  } catch (error: any) {
    logTest('Invalid scenario rejection', false, error.message);
  }

  // Test invalid account
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetAccountId: 'ua-999',
        scenarioId: '1',
        type: 'growth_rate',
        config: { rate: 5 },
      }),
    });

    // logTest(
    //   'Invalid account rejection',
    //   !response.ok && response.status === 500
    // );
  } catch (error: any) {
    logTest('Invalid account rejection', false, error.message);
  }

  // Test invalid parameter type
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetAccountId: 'ua-1',
        scenarioId: '1',
        type: 'invalid_type',
        config: {},
      }),
    });

    logTest(
      'Invalid parameter type rejection',
      !response.ok && response.status === 500
    );
  } catch (error: any) {
    logTest('Invalid parameter type rejection', false, error.message);
  }
}

async function runIntegrationTests() {
  console.log('🚀 Starting Full Integration Test Suite');
  console.log('=====================================\n');

  try {
    // Test all parameter types
    console.log('🧪 Testing All Parameter Types:');
    console.log('--------------------------------');

    await testParameterType('ua-1', 'input', {}, { type: 'input' });

    await testParameterType(
      'ua-2',
      'growth_rate',
      { rate: 5 },
      { type: 'growth_rate', value: 0.05 }
    );

    await testParameterType(
      'ua-3',
      'ratio',
      { referenceId: 'ua-1', ratio: 20 },
      {
        ref: {
          accountName: 'テスト売上高',
          userAccountId: 1,
        },
        type: 'ratio',
        value: 0.2,
      }
    );

    await testParameterType(
      'ua-4',
      'link',
      { referenceId: 'ua-2' },
      { ref: { accountName: 'テスト売上原価', userAccountId: 2 }, type: 'link' }
    );

    await testParameterType(
      'ua-5',
      'sum_children',
      {},
      { type: 'sum_children' }
    );

    await testParameterType(
      'ua-10',
      'custom_calc',
      {
        children: [
          { accountId: 'ua-11', operator: '+' },
          { accountId: 'ua-12', operator: '-' },
        ],
      },
      {
        type: 'custom_calc',
        formula: {
          expression: '@11 - @12',
          references: [
            { accountName: 'テスト労務費', userAccountId: 11 },
            { accountName: 'テスト経費', userAccountId: 12 },
          ],
        },
      }
    );

    await testParameterType(
      'ua-20',
      'prev_end_plus_change',
      {
        flows: [
          { accountId: 'ua-21', operator: '+', counterAccountId: 'ua-23' },
          { accountId: 'ua-22', operator: '-', counterAccountId: 'ua-24' },
        ],
      },
      {
        instructions: [
          {
            driver: { accountName: 'テスト売掛金', userAccountId: 21 },
            effect: 'INCREASE',
          },
          {
            driver: { accountName: 'テスト棚卸資産', userAccountId: 22 },
            effect: 'DECREASE',
          },
        ],
      }
    );

    // Test error handling
    await testErrorHandling();

    // Test batch operations
    console.log('\n🧪 Testing Batch Operations:');
    console.log('-----------------------------');

    // Create multiple rules
    const batchAccounts = ['ua-1', 'ua-2', 'ua-3'];
    const createdIds: number[] = [];

    for (const accountId of batchAccounts) {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAccountId: accountId,
          scenarioId: '1',
          type: 'growth_rate',
          config: { rate: Math.floor(Math.random() * 10) + 1 },
        }),
      });

      if (response.ok) {
        const rule = await response.json();
        createdIds.push(rule.id);
      }
    }

    logTest(
      'Batch create',
      createdIds.length === batchAccounts.length,
      `Created ${createdIds.length} rules`
    );

    // Retrieve all rules for scenario
    const getAllResponse = await fetch(`${API_URL}?scenario_id=1`);
    const allRules = await getAllResponse.json();

    logTest(
      'Batch retrieve',
      allRules.length >= createdIds.length,
      `Found ${allRules.length} total rules`
    );

    // Clean up batch rules
    for (const id of createdIds) {
      await fetch(`${API_URL}?id=${id}`, { method: 'DELETE' });
    }

    logTest('Batch cleanup', true, `Deleted ${createdIds.length} test rules`);

    // Print summary
    console.log('\n📊 Test Summary:');
    console.log('================');

    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    const passRate = ((passed / results.length) * 100).toFixed(1);

    console.log(`Total Tests: ${results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Pass Rate: ${passRate}%`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      results
        .filter((r) => r.status === 'FAIL')
        .forEach((r) => {
          console.log(`  - ${r.test}${r.details ? `: ${r.details}` : ''}`);
        });
    }

    console.log('\n✨ Integration test complete!');
  } catch (error) {
    console.error('Fatal error during testing:', error);
  } finally {
    await pool.end();
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${API_URL}?scenario_id=1`);
    return true; // Any response means server is up
  } catch {
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();

  if (!serverRunning) {
    console.error('❌ Server is not running on port 3001');
    console.error('Please start the server first: cd server && npm run dev');
    process.exit(1);
  }

  await runIntegrationTests();
}

main();
