# インターフェース同期分析ログ

## 1. 調査対象

- DDL最新版：`docs/[最新版]_DDL_1014.sql`
- 既存インターフェース資料：
  - `docs/interface_specification_report.md`
  - `docs/interface_spec_analysis_and_issues.md`
  - `docs/interface_schema_improvement_proposal.md`
- コアロジック：`server/src/fam/fam.ts`, `server/src/engine/ast.ts`, `server/src/model/*.ts`
- UI/API 実装：`src/pages/FinancialStatementPreview.tsx` ほか CRUD ページ、`server/api/*.ts`

## 2. 目的

コアロジックを改変せずに UI/API 連携仕様を最新 DDL と整合させるため、現状のドキュメントと実装の齟齬を洗い出す。

## 3. 主な所見

1. **`global_accounts` の属性不足**
   - DDL では `ga_code`, `ga_type`, `is_credit`, `parent_ga_id` が必須（`docs/[最新版]_DDL_1014.sql`）。
   - 現行資料は `ga_code` / `ga_type` / `is_credit` をスキップしており、`parent_ga_id` も任意扱い。
   - FAM は GAID から代表 accountId を解決するため `is_credit` を参照できると便利。

2. **`user_accounts` の必須カラム漏れ**
   - `parent_ga_type`（NOT NULL）が JSON スキーマに出力されていない。
   - `is_credit` は DDL 上 NULL 許容だが、CFO 計算の貸借判定に必要（`server/src/fam/fam.ts` 内 `calculateCFO`）。

3. **`periods` テーブルの属性未反映**
   - `display_order`, `period_type`, `period_val` が DDL で必須だが、資料では `period_id`, `period_label`, `af_type` のみ。
   - UI は年度ラベルのみ表示しているが、API 層では並び替えや期間型に依存するためメタ情報を保持すべき。

4. **API 層の責務整理**
   - 設計資料ではアンピボット処理を API 層に任せる方針が明記されているが、最新 DDL で追加された属性を含めた整形手順が未反映。
   - `getTable()` 出力を拡張する場合、`accountsMaster` 由来の列を保持するため FAM にメタ属性を埋め込む必要がある。

5. **未知 accountId の扱い**
   - FAM は `importActuals` でマスタ未登録の accountId を軽量生成するが GAID への正規化は行わない。資料にも「GAID 指定のルールはマスタ登録が前提」と追記が必要。

## 4. 影響範囲

- **ドキュメント更新**：DDL 準拠を謳う箇所を最新仕様に合わせて改稿する必要がある。
- **API 実装**：追加カラム（`ga_type`, `parent_ga_type`, `period_type` 等）を伝搬しないと UI からの利用で差異が発生する恐れ。
- **テスト**：既存の `server/src/tests/*` は貸借判定に `is_credit` を活用しているため、インターフェースでも同情報を共有しておくと検証が容易。

## 5. 今後の対応

1. DDL 項目を網羅した UI 向け JSON スキーマ（V2）を再策定。
2. API 層でのアンピボット処理手順に、追加属性の取得・伝搬を明文化。
3. GAID マッピングの前提条件（マスタ登録が必要）の注記を資料へ盛り込む。

以上。
