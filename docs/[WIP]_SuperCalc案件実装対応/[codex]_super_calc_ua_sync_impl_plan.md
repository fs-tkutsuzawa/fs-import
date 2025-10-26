# Super Calc × UA Sync 実装計画書 (v1)

## 0. ゴール

Super Calc を含む全勘定について、いつでも FAM の `compute` を確実に実行できる状態を担保する。  
そのために **GA ⇒ UA 同期 / 整合チェック / ルール注入 / 計算** を一貫させる実装と運用フローを整備する。

## 1. スコープ

- 対象層: `server/`（バックエンド CLI & サービス層）、`docs/`（運用手順）
- 非対象: React UI 側のレイアウト調整や新規モジュール（後続タスクで吸収）
- 既存要素: `global_accounts`, `user_accounts`, `calculation_rules`, `import_df`, `calculation:dump` CLI

## 2. 方針サマリ

1. **Integrated Accounts View**
   - GA / UA を統合したビュー `integrated_accounts_view` を追加し、常に最新状態で勘定メタを提供。
   - `GLOBAL_ONLY` 行で UA 未整備を検出できるようにする。

2. **UA 同期 CLI**
   - GA の Super Calc を含む全レコードを、シナリオ単位で UA に生成する自動スクリプトを作成。
   - VIEW を参照して不足行のみ挿入、実行ログで整合状況と差分を明示する。

3. **データローダ整備**
   - `calculationDataLoader` を VIEW ベースに改修し、PREVS のキー（UA 名 / UA コード / GA 名 / GA コード）を UA ID に正規化。
   - 未解決キーは例外として扱い、運用 CLI に整備を促す。

4. **CLI ハードガード & E2E**
   - `calculation:dump` などの運用 CLI で、必須 GA/UA が欠けている場合は即エラーを返す。
   - ダミーデータを使った UA 同期 → ルール注入 → 計算の E2E テストを追加し、常に計算可能な状態を CI で保証する。

5. **ドキュメント整備**
   - CLI 手順（UI 運用手順を含む）を最新化し、`docs/[TDD]/[principle]_TDD_constraints.v2.md` の方針に則ったタスク分解を明文化。

## 3. 実装タスク（チケット案）

### Ticket A: integrated_accounts_view の追加

- **目的**: GA/UA の統合ビューを作成し、整合確認の唯一の窓口を提供。
- **作業**:
- View DDL 追加 (`server/src/db` またはマイグレーション方式)。
- `GLOBAL_ONLY` 行を返す仕掛けと、ドキュメント更新（運用ポイントの明文化）。
- 最低限のスモークテスト（View の行数・カラム構造）を追加。
- **完了条件**:
  - View 経由で UA / GA メタが取得でき、UA が欠けた GA が `GLOBAL_ONLY` で検出できる。
  - Docs に利用方法と注意点を掲載。
  - **マスター整合ルール**: `global_accounts` の `ga_code` は `docs/[docs]_master_data/global_accounts_202510201755.csv` を正とし、以降すべてのテンプレート・CLI で同じ記述を使用すること。

### Ticket B: GA ⇒ UA 同期 CLI

- **目的**: GA 定義に基づき UA を自動生成し、整合を確実にする。
- **作業**:
  - `scripts/cli/sync-user-accounts.ts`（仮称）を作成。
  - `integrated_accounts_view` を使って不足行のみ挿入、実行差分をログ出力。
  - Dry-run / 強制再同期オプションなど最小限の運用フラグを実装。
- `docs/[WIP]_SuperCalc案件実装対応/` に手順書を追加。
- **完了条件**:
  - CLI 実行後、Super Calc を含む全 GA に対応する UA が生成される。
  - `GLOBAL_ONLY` 行が解消されることを CLI の最終ログで確認可能。
  - **補足**: `master_rules.json` や追加ルールで参照する `ga_code` は、必ず `docs/[docs]_master_data/global_accounts_202510201755.csv` の `ga_code` と一致させること。ズレがある場合はテンプレート側を修正する。

### Ticket C: calculationDataLoader の VIEW 対応

- **目的**: PREVS / ルール整備の負債を取り除き、UA ベースで確実に解決。
- **作業**:
  - `createCalculationDataLoader` に `integrated_accounts_view` の依存を追加。
  - `normalizePrevsAccountIds` を拡張し、GA 名・コードでも解決できるようマップ作成。
  - 未解決キーを例外化し、メッセージに同期 CLI への誘導を含める。
  - 既存テストを更新／追加し、ダミー PREVS で 40 科目が正規化されることを確認。
- **完了条件**:
  - PREVS に存在するすべてのキーが UA ID として正規化される（UA 未整備時は即例外）。
  - 既存テスト群が通り、新規テストで拡張マッピングを担保。

### Ticket D: 運用 CLI のガード強化 & E2E テスト

- **目的**: 計算 CLI を実行した瞬間に整合欠如を検知し、安全に失敗させる。  
  また、ダミーデータで必ず計算が成功することを CI レベルで保証する。
- **作業**:
  - `calculation:dump` 実行時に `integrated_accounts_view` を確認し、必須 GA/UA が揃っていなければエラーで終了。
  - UA 同期 → ルール注入 → `calculation:dump` ドライランを結んだ統合テスト（Jest or CLI ベース）を作成。
  - `docs/[docs]_master_data/[dummy]_import_df_data.csv` に合わせた期待値検証を追加。
- **完了条件**:
  - CLI が UA 不足を検知した際に明示的なエラーメッセージで終了する。
  - 統合テストが通り、FAM compute の正常完走を自動チェックできる。

### Ticket E: ドキュメント & 手順更新

- **目的**: 運用と実装の切り分けを明文化し、迷いなく CLI/UI を使える状態を作る。
- **作業**:
  - `docs/[WIP]_SuperCalc案件実装対応/` に運用マニュアル（UA 同期 → ルール注入 → 計算）を追記。
  - `context.md` や関連メモに、VIEW / CLI / データフローの位置づけを反映。
  - チケット各種のテスト観点（TDD constraints 準拠）を明示。
- **完了条件**:
  - 運用手順が最新フローを反映し、CLI 実行順とチェックポイントが明記されている。
  - 既存メモとの齟齬がないことをレビューで確認。

## 4. マイルストーン

| フェーズ | 内容         | 期待成果                                                            |
| -------- | ------------ | ------------------------------------------------------------------- |
| Phase 1  | Ticket A + B | View & 同期 CLI が導入され、UA 欠落の検知と整備が可能になる         |
| Phase 2  | Ticket C     | PREVS 正規化の抜け漏れがなくなり、FAM への入力が UA ID に統一される |
| Phase 3  | Ticket D     | 計算 CLI が常に安全に実行され、E2E テストで回帰防止が効く           |
| Phase 4  | Ticket E     | 運用手順と実装が一致し、開発・運用双方が迷わずにフローを再現できる  |

## 5. リスクと対策

- **UA 同期の冪等性**
  - 対策: CLI は `UPSERT` を採用し、差分ログで確認。テストで二回実行しても整合が崩れないことを担保。

- **VIEW の性能・依存**
  - 対策: 必要なカラムのみに絞り、必要に応じ索引を検討（今回は UA/GA の PK 参照で十分）。

- **PREVS 形式の揺れ**
  - 対策: 旧形式（ラベル配列）にも対応する現行ロジックを維持しつつ、新形式（UA ID）との両立をテストで保証。

## 6. 次のアクション

- 本計画書をレビューに回し、チケット（A〜E）を発行。
- チケット順序は Phase ベースで進め、各タスクで TDD 原則（最小差分・既存テスト合格）を徹底する。
- Phase 1 着手前に DB / CLI の現状を snapshot 化し、既存データとの互換に留意する。

---

以上。
