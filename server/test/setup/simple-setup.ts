import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

async function createMinimalTestData() {
  const client = await pool.connect();

  try {
    // Ensure a test project and model exist
    await client.query(`
      INSERT INTO projects (id, project_name, company_id, created_by_user_id)
      VALUES (999, 'Test Project', 1, 1) ON CONFLICT (id) DO NOTHING;
    `);
    await client.query(`
      INSERT INTO models (id, model_name, project_id, created_by_user_id)
      VALUES (999, 'Test Model', 999, 1) ON CONFLICT (id) DO NOTHING;
    `);

    console.log('Checking for existing test scenario...');

    // Create scenario with ID=1 and a guaranteed model_id
    const result = await client.query(`
      INSERT INTO scenarios (id, scenario_name, model_id)
      VALUES (1, 'Test Scenario', 999)
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `);

    if (result.rows.length > 0) {
      console.log('Created test scenario:', result.rows[0]);
    } else {
      console.log('Test scenario with ID=1 already exists.');
    }

    // Show all scenarios
    const allScenarios = await client.query(
      'SELECT id, scenario_name, model_id FROM scenarios ORDER BY id'
    );
    console.log('\nAll scenarios in database:');
    allScenarios.rows.forEach((s) => {
      console.log(
        `  ID: ${s.id}, Name: ${s.scenario_name}, Model: ${s.model_id}`
      );
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

createMinimalTestData();
