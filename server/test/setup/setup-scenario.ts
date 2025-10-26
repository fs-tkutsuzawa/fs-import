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

async function setupTestScenarios() {
  const client = await pool.connect();

  try {
    // Check existing scenarios
    const scenariosCheck = await client.query(
      'SELECT id, scenario_name, model_id FROM scenarios'
    );
    console.log('Existing scenarios:', scenariosCheck.rows);

    if (scenariosCheck.rows.length === 0) {
      console.log('No scenarios found. Creating test data...');

      // Create test company
      await client.query(`
        INSERT INTO companies (id, company_name)
        VALUES (1, 'Test Company')
        ON CONFLICT (id) DO NOTHING
      `);

      // Create test user
      await client.query(`
        INSERT INTO users (id, user_name, email, company_id)
        VALUES (1, 'Test User', 'test@example.com', 1)
        ON CONFLICT (id) DO NOTHING
      `);

      // Create test project
      await client.query(`
        INSERT INTO projects (id, project_name, company_id, created_by_user_id)
        VALUES (1, 'Test Financial Model Project', 1, 1)
        ON CONFLICT (id) DO NOTHING
      `);

      // Create test model
      await client.query(`
        INSERT INTO models (id, model_name, project_id, created_by_user_id)
        VALUES (1, 'Test Model', 1, 1)
        ON CONFLICT (id) DO NOTHING
      `);

      // Create test scenarios
      await client.query(`
        INSERT INTO scenarios (id, scenario_name, model_id, description)
        VALUES 
          (1, 'Base Case', 1, 'Base case scenario for testing'),
          (2, 'Optimistic Case', 1, 'Optimistic scenario for testing'),
          (3, 'Pessimistic Case', 1, 'Pessimistic scenario for testing')
        ON CONFLICT (id) DO NOTHING
      `);

      const newScenarios = await client.query(
        'SELECT id, scenario_name, model_id FROM scenarios'
      );
      console.log('Created scenarios:', newScenarios.rows);
    }

    console.log('Setup complete!');
  } catch (error) {
    console.error('Error setting up scenarios:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

setupTestScenarios();
