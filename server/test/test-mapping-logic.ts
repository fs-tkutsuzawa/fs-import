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

// UIのcreatePredefindMappings関数の動作を確認
async function testMappingLogic() {
  const client = await pool.connect();

  try {
    console.log('🔍 マッピングロジックのテスト');
    console.log('=====================================\n');

    // user_accountsデータを取得
    const userAccountsResult = await client.query(`
      SELECT 
        ua.id,
        ua.ua_name,
        ua.parent_ua_id,
        ua.parent_ga_id,
        ua.parent_ga_type,
        ua.fs_type,
        ga.ga_name as parent_ga_name
      FROM user_accounts ua
      LEFT JOIN global_accounts ga ON ua.parent_ga_id = ga.id
      ORDER BY ua.id
      LIMIT 20
    `);

    console.log('📊 user_accountsデータ（サンプル）:');
    console.log('-------------------------------------');
    userAccountsResult.rows.forEach((row) => {
      console.log(`ID: ${row.id} | ${row.ua_name}`);
      console.log(`  parent_ua_id: ${row.parent_ua_id || 'null'}`);
      console.log(
        `  parent_ga_id: ${row.parent_ga_id || 'null'} (${row.parent_ga_name || 'N/A'})`
      );
      console.log(`  fs_type: ${row.fs_type}`);
      console.log('');
    });

    // global_accountsデータを取得
    const globalAccountsResult = await client.query(`
      SELECT 
        id,
        ga_name,
        ga_type,
        fs_type
      FROM global_accounts
      WHERE fs_type IN ('PL', 'BS')
      ORDER BY id
      LIMIT 10
    `);

    console.log('🌍 global_accountsデータ（サンプル）:');
    console.log('-------------------------------------');
    globalAccountsResult.rows.forEach((row) => {
      console.log(`GA-${row.id} | ${row.ga_name} (${row.ga_type})`);
    });

    // マッピングロジックのシミュレーション
    console.log('\n📋 想定されるマッピング:');
    console.log('-------------------------------------');

    const importedData = userAccountsResult.rows;
    const aggregatedAccountsData = globalAccountsResult.rows.map((ga) => ({
      id: `ga-${ga.id}`,
      account_name: ga.ga_name,
    }));

    const mappings: Record<string, any> = {};

    importedData.forEach((importedItem) => {
      // parent_ua_idがある場合、親科目を探す
      if (importedItem.parent_ua_id) {
        const parentImported = importedData.find(
          (p) => p.id === importedItem.parent_ua_id
        );
        if (parentImported && parentImported.parent_ga_id) {
          const targetAgg = aggregatedAccountsData.find(
            (a) => a.id === `ga-${parentImported.parent_ga_id}`
          );
          if (targetAgg) {
            mappings[importedItem.id] = {
              type: 'childOf',
              targetAccountId: targetAgg.id,
              targetAccountName: targetAgg.account_name,
            };
            console.log(
              `UA-${importedItem.id} (${importedItem.ua_name}) → childOf → ${targetAgg.account_name}`
            );
            return;
          }
        }
      }

      // parent_ga_idがある場合、直接GAにマッピング
      if (importedItem.parent_ga_id) {
        const targetAgg = aggregatedAccountsData.find(
          (a) => a.id === `ga-${importedItem.parent_ga_id}`
        );
        if (targetAgg) {
          const mappingType = importedItem.parent_ua_id ? 'childOf' : 'mapTo';
          mappings[importedItem.id] = {
            type: mappingType,
            targetAccountId: targetAgg.id,
            targetAccountName: targetAgg.account_name,
          };
          console.log(
            `UA-${importedItem.id} (${importedItem.ua_name}) → ${mappingType} → ${targetAgg.account_name}`
          );
        }
      } else {
        console.log(
          `UA-${importedItem.id} (${importedItem.ua_name}) → マッピングなし`
        );
      }
    });

    console.log('\n📊 マッピング統計:');
    console.log('-------------------------------------');
    const mappingTypes = Object.values(mappings).reduce((acc: any, m: any) => {
      acc[m.type] = (acc[m.type] || 0) + 1;
      return acc;
    }, {});

    Object.entries(mappingTypes).forEach(([type, count]) => {
      console.log(`${type}: ${count}件`);
    });

    const totalImported = importedData.length;
    const totalMapped = Object.keys(mappings).length;
    console.log(
      `\n合計: ${totalMapped}/${totalImported}件がマッピングされました`
    );
    console.log(
      `マッピング率: ${((totalMapped / totalImported) * 100).toFixed(1)}%`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

testMappingLogic();
