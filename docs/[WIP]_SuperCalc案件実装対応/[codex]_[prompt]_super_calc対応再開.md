# Prompt: Super Calc テンプレート整合タスク

## 1. 指令

Super Calc テンプレートの適用課題を再開する。  
目標は、テンプレートと `user_accounts`/`global_accounts` の整合を取り、CLI（または将来の API）で注入した際に `[SKIP]` 無しで `calculation_rules` が作成される状態にする。

## 2. 参照資料

- `docs/[codex]_[report]_super_calcテンプレート適用概要.md`（現状概要とプロンプト）
- `docs/[codex]_[report]_super_calcテンプレート適用課題.md`（詳細な課題レポート）
- `docs/[codex]_interface_specification_V2.md`（JSON スキーマ）
- `server/src/templates/master_rules.json`（現行テンプレート）
- `scripts/cli/inject-super-calc.ts` / `scripts/cli/show-calculation-rules.ts`
- `docs/[docs]_master_data/global_accounts_202510141854.csv`
- DDL: `docs/[最新版]_DDL_1014.sql`
- `server/src/model/types.ts`（RuleInput 型）
- `docs/[codex]_[report]_super_calc_api_requirements.md`（将来 API 化）

## 3. 実行フロー

1. **現状把握**
   - `user_accounts` と `global_accounts` の GA コード一覧を取得し、テンプレート記載コードとの差分を洗い出す。
   - CLI のドライラン結果 (`SKIP` ログ) を再確認し、原因となる GA コードを特定。
2. **整合方針の決定**
   - どの GA コードを `user_accounts` に追加（or 編集）するか、テンプレート側をどう修正するか、またはマッピングレイヤーを入れるかを検討。
   - 必要に応じて、テンプレート生成プロンプト（`super_calcテンプレート適用概要.md` 参照）を用いて新テンプレートを生成。
3. **実装計画の提示**
   - 選択した方針に基づき、具体的な作業手順（SQL 例、テンプレート編集手順、検証方法）を整理。
   - `yarn inject-super-calc --scenario-id=<id> --dry-run` → 本実行 → `yarn show:rules` の検証ステップを明記。

## 4. 出力フォーマット

- `現状理解`: GA コード差分、CLI ログの分析、未整備箇所。
- `方針候補`: A/B/C（勘定追加・テンプレート調整・マッピング）。採用案が決まっていれば根拠も記述。
- `実装計画`: 作業チェックリスト、SQL/TODO、テスト手順。
- `次のステップ`: 今後の動作確認や API 化への接続。
