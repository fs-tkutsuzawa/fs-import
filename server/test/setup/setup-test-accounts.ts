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

async function setupTestAccounts() {
  const client = await pool.connect();

  try {
    console.log('Creating test user accounts...');

    // Get a global account to use as parent
    const globalAccounts = await client.query(`
      SELECT id, ga_type FROM global_accounts 
      WHERE fs_type = 'PL' 
      LIMIT 1
    `);

    if (globalAccounts.rows.length === 0) {
      console.error(
        'No global accounts found. Please ensure global_accounts table has data.'
      );
      return;
    }

    const parentGaId = globalAccounts.rows[0].id;
    const parentGaType = globalAccounts.rows[0].ga_type;
    console.log(
      `Using global account ${parentGaId} (${parentGaType}) as parent`
    );

    // Create test user accounts with unique names
    const testAccounts = [
      { id: 1, name: 'テスト売上高', fs_type: 'PL', parent_ga_id: parentGaId },
      {
        id: 2,
        name: 'テスト売上原価',
        fs_type: 'PL',
        parent_ga_id: parentGaId,
      },
      { id: 3, name: 'テスト販管費', fs_type: 'PL', parent_ga_id: parentGaId },
      {
        id: 4,
        name: 'テスト営業外収益',
        fs_type: 'PL',
        parent_ga_id: parentGaId,
      },
      {
        id: 5,
        name: 'テスト営業外費用',
        fs_type: 'PL',
        parent_ga_id: parentGaId,
      },
      {
        id: 10,
        name: 'テスト材料費',
        fs_type: 'PL',
        parent_ga_id: parentGaId,
        parent_ua_id: 2,
      },
      {
        id: 11,
        name: 'テスト労務費',
        fs_type: 'PL',
        parent_ga_id: parentGaId,
        parent_ua_id: 2,
      },
      {
        id: 12,
        name: 'テスト経費',
        fs_type: 'PL',
        parent_ga_id: parentGaId,
        parent_ua_id: 2,
      },
    ];

    for (const account of testAccounts) {
      await client.query(
        `
        INSERT INTO user_accounts (id, ua_name, fs_type, parent_ga_id, parent_ga_type, parent_ua_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          ua_name = EXCLUDED.ua_name,
          fs_type = EXCLUDED.fs_type,
          parent_ga_id = EXCLUDED.parent_ga_id,
          parent_ga_type = EXCLUDED.parent_ga_type,
          parent_ua_id = EXCLUDED.parent_ua_id
      `,
        [
          account.id,
          account.name,
          account.fs_type,
          account.parent_ga_id,
          parentGaType,
          account.parent_ua_id || null,
        ]
      );

      console.log(`  Created/Updated account: ${account.id} - ${account.name}`);
    }

    // Also create some BS accounts for testing prev_end_plus_change
    const bsGlobalAccount = await client.query(`
      SELECT id, ga_type FROM global_accounts 
      WHERE fs_type = 'BS' 
      LIMIT 1
    `);

    if (bsGlobalAccount.rows.length > 0) {
      const bsParentGaId = bsGlobalAccount.rows[0].id;
      const bsParentGaType = bsGlobalAccount.rows[0].ga_type;

      const bsAccounts = [
        {
          id: 20,
          name: 'テスト現金及び預金',
          fs_type: 'BS',
          parent_ga_id: bsParentGaId,
        },
        {
          id: 21,
          name: 'テスト売掛金',
          fs_type: 'BS',
          parent_ga_id: bsParentGaId,
        },
        {
          id: 22,
          name: 'テスト棚卸資産',
          fs_type: 'BS',
          parent_ga_id: bsParentGaId,
        },
      ];

      for (const account of bsAccounts) {
        await client.query(
          `
          INSERT INTO user_accounts (id, ua_name, fs_type, parent_ga_id, parent_ga_type, is_credit)
          VALUES ($1, $2, $3, $4, $5, false)
          ON CONFLICT (id) DO UPDATE SET
            ua_name = EXCLUDED.ua_name,
            fs_type = EXCLUDED.fs_type,
            parent_ga_id = EXCLUDED.parent_ga_id,
            parent_ga_type = EXCLUDED.parent_ga_type
        `,
          [
            account.id,
            account.name,
            account.fs_type,
            account.parent_ga_id,
            bsParentGaType,
          ]
        );

        console.log(
          `  Created/Updated BS account: ${account.id} - ${account.name}`
        );
      }
    }

    // Show summary
    const countResult = await client.query(
      'SELECT COUNT(*) FROM user_accounts'
    );
    console.log(`\nTotal user accounts: ${countResult.rows[0].count}`);

    // Show parent-child relationships
    const parentChildResult = await client.query(`
      SELECT 
        p.id as parent_id, 
        p.ua_name as parent_name, 
        COUNT(c.id) as child_count
      FROM user_accounts p
      LEFT JOIN user_accounts c ON c.parent_ua_id = p.id
      GROUP BY p.id, p.ua_name
      HAVING COUNT(c.id) > 0
      ORDER BY p.id
    `);

    console.log('\nParent-child relationships:');
    parentChildResult.rows.forEach((row) => {
      console.log(
        `  ${row.parent_name} (ID: ${row.parent_id}) has ${row.child_count} children`
      );
    });
  } catch (error) {
    console.error('Error setting up test accounts:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

setupTestAccounts();
