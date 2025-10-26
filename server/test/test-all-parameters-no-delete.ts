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

interface TestCase {
  name: string;
  accountId: string;
  type: string;
  config: any;
  description: string;
}

const testCases: TestCase[] = [
  {
    name: '入力値パラメータ',
    accountId: 'ua-1',
    type: 'input',
    config: {},
    description: '手動入力値（計算なし）',
  },
  {
    name: '成長率パラメータ',
    accountId: 'ua-2',
    type: 'growth_rate',
    config: { rate: 5 },
    description: '前期比5%成長',
  },
  {
    name: '比率パラメータ（20%）',
    accountId: 'ua-3',
    type: 'ratio',
    config: { referenceId: 'ua-1', ratio: 20 },
    description: '売上高の20%として計算',
  },
  {
    name: 'リンクパラメータ',
    accountId: 'ua-4',
    type: 'link',
    config: { referenceId: 'ua-2' },
    description: '他科目の値を参照',
  },
  {
    name: '子科目合計',
    accountId: 'ua-5',
    type: 'sum_children',
    config: {},
    description: '子科目の自動合計',
  },
  {
    name: 'カスタム計算式',
    accountId: 'ua-10',
    type: 'custom_calc',
    config: {
      children: [
        { accountId: 'ua-11', operator: '+' },
        { accountId: 'ua-12', operator: '-' },
      ],
    },
    description: '材料費 + 労務費 - 経費',
  },
  {
    name: '前期末残高＋増減',
    accountId: 'ua-20',
    type: 'prev_end_plus_change',
    config: {
      flows: [
        { accountId: 'ua-21', operator: '+' },
        { accountId: 'ua-22', operator: '-' },
      ],
    },
    description: 'BS科目: 前期末 + 売掛金増 - 売掛金減',
  },
  {
    name: '成長率10%',
    accountId: 'ua-11',
    type: 'growth_rate',
    config: { rate: 10 },
    description: '前期比10%成長',
  },
  {
    name: '比率パラメータ（50%）',
    accountId: 'ua-12',
    type: 'ratio',
    config: { referenceId: 'ua-2', ratio: 50 },
    description: '売上原価の50%として計算',
  },
  {
    name: '複雑なカスタム計算',
    accountId: 'ua-21',
    type: 'custom_calc',
    config: {
      children: [
        { accountId: 'ua-1', operator: '+' },
        { accountId: 'ua-2', operator: '+' },
        { accountId: 'ua-3', operator: '-' },
        { accountId: 'ua-4', operator: '-' },
      ],
    },
    description: '売上高 + 売上原価 - 販管費 - 営業外収益',
  },
];

async function saveParameter(testCase: TestCase) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetAccountId: testCase.accountId,
        scenarioId: '1',
        type: testCase.type,
        config: testCase.config,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const result = await response.json();
    return { success: true, id: result.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('🚀 パラメータ設定の全件テスト開始');
  console.log('=====================================\n');

  const results: any[] = [];

  // 各テストケースを実行
  for (const testCase of testCases) {
    console.log(`\n📝 ${testCase.name}`);
    console.log(`   科目: ${testCase.accountId}`);
    console.log(`   タイプ: ${testCase.type}`);
    console.log(`   説明: ${testCase.description}`);

    const result = await saveParameter(testCase);

    if (result.success) {
      console.log(`   ✅ 登録成功 (ID: ${result.id})`);
      results.push({ ...testCase, id: result.id, status: 'success' });
    } else {
      console.log(`   ❌ 登録失敗: ${result.error}`);
      results.push({ ...testCase, error: result.error, status: 'failed' });
    }
  }

  // データベース確認
  console.log('\n\n📊 データベース登録状況確認');
  console.log('================================');

  const client = await pool.connect();
  try {
    // 登録件数確認
    const countResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM calculation_rules 
      WHERE scenario_id = 1
    `);
    console.log(`\n総登録件数: ${countResult.rows[0].count}件`);

    // タイプ別集計
    const typeResult = await client.query(`
      SELECT rule_type, COUNT(*) as count 
      FROM calculation_rules 
      WHERE scenario_id = 1
      GROUP BY rule_type
      ORDER BY rule_type
    `);

    console.log('\nルールタイプ別件数:');
    typeResult.rows.forEach((row) => {
      console.log(`  ${row.rule_type}: ${row.count}件`);
    });

    // 登録データ詳細
    const detailResult = await client.query(`
      SELECT 
        cr.id,
        cr.target_user_account_id,
        ua.ua_name,
        cr.rule_type,
        cr.rule_definition
      FROM calculation_rules cr
      LEFT JOIN user_accounts ua ON cr.target_user_account_id = ua.id
      WHERE cr.scenario_id = 1
      ORDER BY cr.id DESC
      LIMIT 20
    `);

    console.log('\n最新登録データ（上位20件）:');
    console.log('----------------------------------------');
    detailResult.rows.forEach((row) => {
      const def = JSON.stringify(row.rule_definition);
      const truncated = def.length > 60 ? def.substring(0, 60) + '...' : def;
      console.log(
        `ID: ${row.id} | UA-${row.target_user_account_id} (${row.ua_name || 'N/A'}) | ${row.rule_type}`
      );
      console.log(`  定義: ${truncated}`);
    });
  } finally {
    client.release();
  }

  // サマリー表示
  console.log('\n\n📈 テスト結果サマリー');
  console.log('====================');
  const successCount = results.filter((r) => r.status === 'success').length;
  const failCount = results.filter((r) => r.status === 'failed').length;

  console.log(`実行テスト数: ${testCases.length}`);
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失敗: ${failCount}`);
  console.log(
    `成功率: ${((successCount / testCases.length) * 100).toFixed(1)}%`
  );

  if (failCount > 0) {
    console.log('\n失敗したテスト:');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
  }

  console.log('\n✨ テスト完了（データは削除していません）');

  await pool.end();
}

// サーバー起動確認
async function checkServer() {
  try {
    await fetch(`${API_URL}?scenario_id=1`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();

  if (!serverRunning) {
    console.error('❌ サーバーが起動していません (port 3001)');
    console.error('先にサーバーを起動してください: cd server && npm run dev');
    process.exit(1);
  }

  await runAllTests();
}

main();
