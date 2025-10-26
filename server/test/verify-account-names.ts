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

async function verifyAccountNames() {
  const client = await pool.connect();

  try {
    console.log('🔍 参照科目名の確認');
    console.log('=====================================\n');

    // ratio型のデータ確認
    const ratioResult = await client.query(`
      SELECT 
        cr.id,
        cr.target_user_account_id,
        ua.ua_name as target_name,
        cr.rule_definition
      FROM calculation_rules cr
      LEFT JOIN user_accounts ua ON cr.target_user_account_id = ua.id
      WHERE cr.scenario_id = 1
      AND cr.rule_definition::text LIKE '%"type":"ratio"%'
      ORDER BY cr.id DESC
    `);

    console.log('📊 比率(ratio)タイプのルール:');
    console.log('-------------------------------');
    ratioResult.rows.forEach((row) => {
      const def = row.rule_definition;
      console.log(
        `ID: ${row.id} | 対象: ${row.target_name} (UA-${row.target_user_account_id})`
      );
      console.log(`  参照科目ID: ${def.ref?.userAccountId || 'NULL'}`);
      console.log(`  参照科目名: "${def.ref?.userAccountName || 'EMPTY'}"`);
      console.log(`  比率: ${(def.value * 100).toFixed(0)}%`);
      console.log('');
    });

    // link型のデータ確認
    const linkResult = await client.query(`
      SELECT 
        cr.id,
        cr.target_user_account_id,
        ua.ua_name as target_name,
        cr.rule_definition
      FROM calculation_rules cr
      LEFT JOIN user_accounts ua ON cr.target_user_account_id = ua.id
      WHERE cr.scenario_id = 1
      AND cr.rule_definition::text LIKE '%"type":"link"%'
      ORDER BY cr.id DESC
    `);

    console.log('🔗 リンク(link)タイプのルール:');
    console.log('-------------------------------');
    linkResult.rows.forEach((row) => {
      const def = row.rule_definition;
      console.log(
        `ID: ${row.id} | 対象: ${row.target_name} (UA-${row.target_user_account_id})`
      );
      console.log(`  参照科目ID: ${def.ref?.userAccountId || 'NULL'}`);
      console.log(`  参照科目名: "${def.ref?.userAccountName || 'EMPTY'}"`);
      console.log('');
    });

    // custom_calc型のデータ確認
    const calcResult = await client.query(`
      SELECT 
        cr.id,
        cr.target_user_account_id,
        ua.ua_name as target_name,
        cr.rule_definition
      FROM calculation_rules cr
      LEFT JOIN user_accounts ua ON cr.target_user_account_id = ua.id
      WHERE cr.scenario_id = 1
      AND cr.rule_definition::text LIKE '%formula%'
      ORDER BY cr.id DESC
    `);

    console.log('📐 カスタム計算(custom_calc)タイプのルール:');
    console.log('--------------------------------------------');
    calcResult.rows.forEach((row) => {
      const def = row.rule_definition;
      console.log(
        `ID: ${row.id} | 対象: ${row.target_name} (UA-${row.target_user_account_id})`
      );
      console.log(`  計算式: ${def.formula}`);
      if (def.references) {
        console.log('  参照科目:');
        def.references.forEach((ref: any) => {
          console.log(
            `    - UA-${ref.userAccountId}: "${ref.userAccountName}"`
          );
        });
      }
      console.log('');
    });

    // BALANCE_AND_CHANGE型のデータ確認
    const balanceResult = await client.query(`
      SELECT 
        cr.id,
        cr.target_user_account_id,
        ua.ua_name as target_name,
        cr.rule_definition
      FROM calculation_rules cr
      LEFT JOIN user_accounts ua ON cr.target_user_account_id = ua.id
      WHERE cr.scenario_id = 1
      AND cr.rule_type = 'BALANCE_AND_CHANGE'
      ORDER BY cr.id DESC
    `);

    console.log('💰 前期末残高＋増減(BALANCE_AND_CHANGE)タイプのルール:');
    console.log('-------------------------------------------------------');
    balanceResult.rows.forEach((row) => {
      const def = row.rule_definition;
      console.log(
        `ID: ${row.id} | 対象: ${row.target_name} (UA-${row.target_user_account_id})`
      );
      if (def.instructions) {
        console.log('  フロー指示:');
        def.instructions.forEach((inst: any) => {
          console.log(
            `    ${inst.sign} フローID: ${inst.flow_user_account_id} "${inst.flow_user_account_name || 'EMPTY'}"`
          );
          if (inst.counter_user_account_id) {
            console.log(
              `      相手科目ID: ${inst.counter_user_account_id} "${inst.counter_user_account_name || 'EMPTY'}"`
            );
          }
        });
      }
      console.log('');
    });

    // サマリー
    console.log('\n📊 検証サマリー:');
    console.log('================');

    // 名前が空のものをカウント
    const emptyNameCount = await client.query(`
      SELECT COUNT(*) as count
      FROM calculation_rules
      WHERE scenario_id = 1
      AND (
        rule_definition::text LIKE '%"userAccountName":""%'
        OR rule_definition::text LIKE '%"userAccountName":null%'
      )
    `);

    const totalCount = await client.query(`
      SELECT COUNT(*) as count
      FROM calculation_rules
      WHERE scenario_id = 1
    `);

    console.log(`総ルール数: ${totalCount.rows[0].count}`);
    console.log(`空の科目名を含むルール数: ${emptyNameCount.rows[0].count}`);

    if (emptyNameCount.rows[0].count === '0') {
      console.log('✅ 全ての参照科目名が正しく設定されています！');
    } else {
      console.log('⚠️ 一部の参照科目名が空になっています');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

verifyAccountNames();
