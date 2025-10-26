System:
あなたは既存のTypeScript/Nodeフルスタックコードベースに対して、破壊を起こさず最小限の差分でUI側APIテストの失敗を原因究明し、テストと実装を同期させて修復するデバッグエージェントである。常に以下の黄金律・制約・手順に従うこと。

User:

# Context

- リポジトリ: /fs_model
- パッケージマネージャ: yarn
- テストランナー: `npx tsx *.ts`
- ビルド/型: {{調査せよ}}、型厳格度: {{調査せよ}}
- 失敗しているテストコマンド: `{{cd server && npx tsx test/full-integration-test.ts}}` `{{cd server && npx tsx test/test-calculation-rules-api.ts}}`
- 直近の失敗ログ（必須・全文貼付）:

```
(base) apple@TakuK server % npx tsx test/test-calculation-rules-api.ts
[dotenv@17.2.2] injecting env (4) from .env -- tip: 🔐 encrypt with Dotenvx: https://dotenvx.com

============================================================
CALCULATION RULES API COMPREHENSIVE TEST
============================================================

============================================================
CREATE Operations Test - All Parameter Types
============================================================
✓ 1. Input Type (手入力)
  Created rule ID: 23
✓ 2. Growth Rate Type (成長率)
  Created rule ID: 24
✓ 3. Ratio Type (割合)
  Created rule ID: 22
✓ 4. Link Type (連動)
  Created rule ID: 25
✓ 5. Sum Children Type (子科目合計)
  Created rule ID: 23
✗ 6. Custom Calc Type (個別計算)
  Error: Failed to save calculation rule
✓ 7. Previous End + Change Type (前期末+変動)
  Created rule ID: 24

============================================================
READ Operations Test
============================================================
✓ Get all rules
  Retrieved 4 rules
✓ Filter by scenario
  Retrieved 4 rules
✓ Filter by account
  Retrieved 1 rules
✓ Filter by both
  Retrieved 1 rules

============================================================
UPDATE Operations Test
============================================================
✓ Update existing rule
  Updated rule ID: 22

============================================================
Database Verification
============================================================
Rules by type:
  BALANCE_AND_CHANGE: 1 rules
  PARAMETER: 3 rules

Sample rule definitions:

  Account 3 (PARAMETER):
  {
    "type": "growth_rate",
    "value": 0.1
}

  Account 1 (PARAMETER):
  {
    "type": "sum_children"
}

  Account 2 (BALANCE_AND_CHANGE):
  {
    "instructions": [
        {
            "driver": {
                "accountName": "テスト販管費",
                "userAccountId": 3
            },
            "effect": "INCREASE",
            "counter": {
                "accountName": "テスト営業外収益",
                "userAccountId": 4
            }
        },
        {
            "driver": {
                "accountName": "テスト売上高",
                "userAccountId": 1
            },
            "effect": "DECREASE"
        }
    ]
}

============================================================
DELETE Operations Test
============================================================
✓ Delete rule
  Deleted rule ID: 25

============================================================
Error Cases Test
============================================================
✓ Missing required fields
  Error handled correctly
✓ Invalid scenario ID
  Error handled correctly
✓ Invalid account ID format
  Error handled correctly
✓ Unknown parameter type
  Error handled correctly

============================================================
Database Verification
============================================================
Rules by type:
  BALANCE_AND_CHANGE: 1 rules
  PARAMETER: 2 rules

Sample rule definitions:

  Account 3 (PARAMETER):
  {
    "type": "growth_rate",
    "value": 0.1
}

  Account 1 (PARAMETER):
  {
    "type": "sum_children"
}

  Account 2 (BALANCE_AND_CHANGE):
  {
    "instructions": [
        {
            "driver": {
                "accountName": "テスト販管費",
                "userAccountId": 3
            },
            "effect": "INCREASE",
            "counter": {
                "accountName": "テスト営業外収益",
                "userAccountId": 4
            }
        },
        {
            "driver": {
                "accountName": "テスト売上高",
                "userAccountId": 1
            },
            "effect": "DECREASE"
        }
    ]
}

Test data preserved. Run with --cleanup to remove test data.

✨ All tests completed!
```

```
(base) apple@TakuK server % npx tsx test/full-integration-test.ts
[dotenv@17.2.2] injecting env (4) from .env -- tip: 🔐 prevent building .env in docker: https://dotenvx.com/prebuild
🚀 Starting Full Integration Test Suite
=====================================

🧪 Testing All Parameter Types:
--------------------------------
✅ Save input parameter: ID: 23
✅ DB verify input parameter
✅ Retrieve input parameter: Found rule ID: 23
✅ Update input parameter
✅ Delete input parameter
✅ Verify delete input parameter: Successfully deleted
✅ Save growth_rate parameter: ID: 24
❌ DB verify growth_rate parameter: Expected: {"type":"growth_rate","rate":0.05}, Got: {"type":"growth_rate","value":0.05}
✅ Retrieve growth_rate parameter: Found rule ID: 24
✅ Update growth_rate parameter
✅ Delete growth_rate parameter
✅ Verify delete growth_rate parameter: Successfully deleted
✅ Save ratio parameter: ID: 22
❌ DB verify ratio parameter: Expected: {"type":"ratio","reference_id":1,"ratio":0.2}, Got: {"ref":{"accountName":"テスト売上高","userAccountId":1},"type":"ratio","value":0.2}
✅ Retrieve ratio parameter: Found rule ID: 22
✅ Update ratio parameter
✅ Delete ratio parameter
✅ Verify delete ratio parameter: Successfully deleted
✅ Save link parameter: ID: 27
❌ DB verify link parameter: Expected: {"type":"link","reference_id":2}, Got: {"ref":{"accountName":"テスト売上原価","userAccountId":2},"type":"link"}
✅ Retrieve link parameter: Found rule ID: 27
✅ Update link parameter
✅ Delete link parameter
✅ Verify delete link parameter: Successfully deleted
✅ Save sum_children parameter: ID: 28
✅ DB verify sum_children parameter
✅ Retrieve sum_children parameter: Found rule ID: 28
✅ Update sum_children parameter
✅ Delete sum_children parameter
✅ Verify delete sum_children parameter: Successfully deleted
✅ Save custom_calc parameter: ID: 29
❌ DB verify custom_calc parameter: Expected: {"type":"formula","formula":"11 + 12"}, Got: {"type":"custom_calc","formula":{"expression":"@11 - @12","references":[{"accountName":"テスト労務費","userAccountId":11},{"accountName":"テスト経費","userAccountId":12}]}}
✅ Retrieve custom_calc parameter: Found rule ID: 29
✅ Update custom_calc parameter
✅ Delete custom_calc parameter
✅ Verify delete custom_calc parameter: Successfully deleted
✅ Save prev_end_plus_change parameter: ID: 30
❌ DB verify prev_end_plus_change parameter: Expected: {"instructions":[{"type":"add_flow","flow_id":21},{"type":"subtract_flow","flow_id":22}]}, Got: {"instructions":[{"driver":{"accountName":"テスト売掛金","userAccountId":21},"effect":"INCREASE"},{"driver":{"accountName":"テスト棚卸資産","userAccountId":22},"effect":"DECREASE"}]}
✅ Retrieve prev_end_plus_change parameter: Found rule ID: 30
✅ Update prev_end_plus_change parameter
✅ Delete prev_end_plus_change parameter
✅ Verify delete prev_end_plus_change parameter: Successfully deleted

🧪 Testing Error Handling:
❌ Invalid scenario rejection
❌ Invalid account rejection
❌ Invalid parameter type rejection

🧪 Testing Batch Operations:
-----------------------------
✅ Batch create: Created 3 rules
✅ Batch retrieve: Found 7 total rules
✅ Batch cleanup: Deleted 3 test rules

📊 Test Summary:
================
Total Tests: 48
✅ Passed: 40
❌ Failed: 8
📈 Pass Rate: 83.3%

❌ Failed Tests:
  - DB verify growth_rate parameter: Expected: {"type":"growth_rate","rate":0.05}, Got: {"type":"growth_rate","value":0.05}
  - DB verify ratio parameter: Expected: {"type":"ratio","reference_id":1,"ratio":0.2}, Got: {"ref":{"accountName":"テスト売上高","userAccountId":1},"type":"ratio","value":0.2}
  - DB verify link parameter: Expected: {"type":"link","reference_id":2}, Got: {"ref":{"accountName":"テスト売上原価","userAccountId":2},"type":"link"}
  - DB verify custom_calc parameter: Expected: {"type":"formula","formula":"11 + 12"}, Got: {"type":"custom_calc","formula":{"expression":"@11 - @12","references":[{"accountName":"テスト労務費","userAccountId":11},{"accountName":"テスト経費","userAccountId":12}]}}
  - DB verify prev_end_plus_change parameter: Expected: {"instructions":[{"type":"add_flow","flow_id":21},{"type":"subtract_flow","flow_id":22}]}, Got: {"instructions":[{"driver":{"accountName":"テスト売掛金","userAccountId":21},"effect":"INCREASE"},{"driver":{"accountName":"テスト棚卸資産","userAccountId":22},"effect":"DECREASE"}]}
  - Invalid scenario rejection
  - Invalid account rejection
  - Invalid parameter type rejection

✨ Integration test complete!
```

- 想定APIエンドポイント/契約（分かる範囲）: {{わからないので調べること}}
- UIレイヤ: {{Next.js/React}}
- モック/スタブ: わからないので調べること

# Goal

1. 失敗テストの再現手順をコードレベルで固定化し、原因の一次要因を特定する。
2. 破壊を避けつつ、最小限の差分で修復し、関連テストを含めグリーン化する。
3. API契約とUIの整合性を明確化し、回帰防止のテストを追加する（必要最小限）。
4. 変更点・根因・今後の監視ポイントをPR記述用に要約する。

# 黄金律（要件黄金律）

- 原因→現象→仮説→検証→確証→最小修正→回帰確認 の順序から逸脱しない。
- 1テスト赤→最小実装→緑→リファクタ のTDDサイクルを1単位とし、同一単位で3回以上失敗が続いたらループを止めて「全体俯瞰チェック」に戻る。
- 破壊禁止: 公開APIの型・レスポンス構造・ユーザ可視UI挙動を暗黙に変えない。変える場合は互換レイヤを追加し段階移行。
- 変更は局所化: フロントのアダプタ/データマッピング層で吸収し、ドメイン/契約を軽々に動かさない。
- 事実ベース: ログ・型エラー・スナップショット以外の推測で実装しない。

# 制約

- 書き換え対象は UI API呼び出し層、データ変換、テスト/モック。サーバ契約変更は禁止（必要なら互換パス追加）。
- 既存で通っているテストは落とさない。スナップショットは無差別更新禁止。
- 差分は小さく、コミットは意味単位で分割。1コミット1意図。
- 依存追加は事前に根拠を列挙。大型リファクタ禁止。
- 型安全優先（any禁止、narrowing/guard追加を優先）。

# 前段調査（自動で実行）

1. 影響範囲スキャン
   - 失敗テストに出現するシンボル/モジュールを逆参照して依存グラフを生成。
   - APIコール箇所、レスポンス型、モック定義、変換関数（mapper/normalizer）を列挙。

2. 契約差分チェック
   - 実際のモック/録画（VCR/MSW）レスポンスと型定義/期待値の差異を表にする。

3. 再現固定化
   - `{{test_cmd}} --runInBand --reporters=verbose` 等で安定再現。フレーク検知のため3回実行し、失敗パターンを確定。

4. エラーツリー分解
   - 失敗アサーション→直前のデータ→取得元API→変換→UI消費 の順でツリー化。各段で観測点（ログ/型）を挿入。

# 改善実装の手順（TDDループ）

A. 赤を最小化

- 期待契約を明文化する契約テスト/型アサーションを先に追加（UIアダプタ単体テスト）。
  B. 緑にする最小変更
- mapper/型定義/クエリキー/キャッシュ無効化条件のうち一次要因に対する最小修正のみ行う。
  C. リファクタ（任意）
- 重複ロジックを関数化。動作が等価であることをテストで担保。
  D. 回帰確認
- 影響範囲の関連テストを選択実行→全体実行。パフォーマンス/フレーク監視も併記。

# チェックリスト

- 前提
  - [ ] 失敗テストの再現ログを保存し、コミットに添付可能な形で要約した。
  - [ ] API契約（入出力型・必須/任意フィールド・デフォルト値）の表を作成した。
  - [ ] モックが実契約に追随しているかチェックした。

- 実装
  - [ ] 変更はUIアダプタ層に限定した（例: `services/apiClient.ts`, `mappers/*`）。
  - [ ] Null/undefined/Optionalの境界を型で防御した（type guard, zod等）。
  - [ ] キャッシュ戦略（react-query等）のキーと無効化条件を検証した。

- テスト
  - [ ] 失敗を再現する最小ケースの単体テストを追加。
  - [ ] モックレスポンスと型の差異を埋めた（過不足フィールドの扱いを明文化）。
  - [ ] フレーク対策（タイミング依存のwait/retiesを定数化、固定待機禁止）。

- 出力
  - [ ] 原因、対処、代替案、残リスクをPR説明に記述。
  - [ ] 次の観測ポイント（メトリクス/ログ）の追加。

# 期待する出力（この順で必ず出力）

1. 「原因分析レポート.md」: 根因、再現手順、影響範囲、契約差分の表
2. 「修正提案.diff」: 最小差分のパッチ（統一diff）
3. 「追加入力テスト.diff」: 追加/修正テストの差分
4. 「PR_DESCRIPTION.md」: 変更概要、根因、代替案、リスク、ロールバック手順
5. 実行コマンドリスト: ローカル再現と全テスト実行コマンド

# 実装ガード（破壊防止）

- 公開型の後方互換を壊す変更は行わない。必要時はdeprecatedフィールドを残しアダプタで両対応。
- スナップショットはフィールド順序や日付の揺れを正規化してから更新。丸ごと更新禁止。
- UI表示仕様を変える変更は不可。文言/並び順の変更は対象外。
- FE/BEの契約不一致が根因の場合、FE側でフォールバック/デフォルト埋めを実装。BE変更は要求しない。

# 代表的な原因の切り分けテンプレ

- 型不一致: レスポンスのOptional→必須化で落ちている → guard追加とデフォルト埋め
- キャッシュ: クエリキーにuserId等の識別子欠落 → キー再定義と無効化条件追加
- タイミング: Async UI待機不足 → ユーザ可視条件に基づくwaitFor、固定sleep禁止
- モック乖離: MSWのfixtureが古い → fixture更新＋契約テスト追加
- 正規化欠落: mapperが部分的 → 不変条件のユニットテスト追加

# 出力フォーマット厳守

- コードは統一diffのみ。説明はMarkdown。無関係な提案は出さない。
- 変更が1ファイル100行を超える場合は分割提案とする。

# 実行アシスト（コマンド例）

- 依存グラフ: `npx madge src --extensions ts,tsx --image graph.svg`
- 型: `{{pkg}} run typecheck`
- テスト: `{{test_cmd}} --runInBand --coverage`
- フレーク検出: `{{test_cmd}} -w=1 --maxWorkers=1 --repeatEach=3`
- MSW 監査: 機能別fixtureと型の対比表を生成

# 最後に行う全体俯瞰チェック

- 変更が黄金律とチェックリストに合致するか自己検証し、逸脱時は再計画を提示してから差分を再提案せよ。
