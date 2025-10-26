# SC-005 データ取り込みワークフローと自動化論点

## 1. ゴール

Import_df（PREVS）から FAM.compute までを常に成功させる。  
そのために **データ投入 → 勘定同期 → ルール注入 → 計算** の一連を再現可能な形でまとめる。

## 2. 手動運用手順（新規データ取り込み時に毎回実施）

1. **Global Accounts / User Accounts の整合**

   ```bash
   npm --prefix server run view:integrated:create
   npm run sync:ua -- --dry-run   # 不足があれば内容を確認
   npm run sync:ua                # 必要に応じて本実行
   ```

   - 目的: GA ↔ UA の対応表を最新化し、`GLOBAL_ONLY` 行をゼロにする。
   - 背景: 以降のルール注入・計算は UA ID が揃っていることが前提。

2. **Import_df（PREVS）の投入**
   - 新しい CSV/JSON を UI からインポートする（手動・既存ツールどちらでも可）。
   - `docs/[docs]_master_data/[dummy]_import_df_data_v2.csv` を参考に、Super Calc の基底勘定を含めたデータであることを確認。
   - チェック項目:
     - 参照勘定（売上高、販管費、資本金など）が欠けていない。
     - PREVS のラベルが `user_accounts.ua_name` と一致している。
     - 期間列が `EOL` で閉じられている。

3. **ルール注入**

```bash
npm run rules:sync-codes
npm run inject:super-calc -- --scenario-id=<SCENARIO_ID>
```

- 目的: PARAMETER/B&C ルールを最新テンプレートに合わせて UPSERT。
- `npm run rules:sync-codes` で `master_rules.v2.json` を生成・更新し、`docs/[docs]_master_data/global_accounts_202510201755.csv` に基づいた `ga_code` へ自動置換する。
- `[SKIP]` が出た場合は該当 GA/UA の不足を `integrated_accounts_view` と PREVS から再チェック。
- **ga_code の統一**: `rules:sync-codes` を実行した後でも該当コードが存在しなければ CSV とマスタの差分が残っている可能性が高い。ズレが解消されるまで差分調査を行うこと。

4. **計算テスト**

   ```bash
   npm --prefix server run calculation:dump -- --model <MODEL_ID> --scenario <SCENARIO_ID> --projection <YEARS>
   ```

   - 実行前にステップ 1 で `GLOBAL_ONLY` が無いことを確認しておく。
   - エラー発生時の判断:
     - `ユーザー勘定が未登録` → `sync:ua` で再同期。
     - `PREVS に未解決の勘定キー` → PREVS のラベルと UA 名を再確認。
     - `補完できません` → 基底勘定のデータ不足。PREVS に加筆または PARAMETER の参照先を見直す。

5. **ログ・結果の記録**
   - CLI の結果はコマンド履歴やログファイル（`server/logs/`）に残し、どのステップで何が起きたかを共有。

## 3. 商用化に向けた自動化観点

| ステップ            | 自動化案                                                                                    | 検討論点                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| View 作成 / UA 同期 | CI/CD やデータ連携バッチの冒頭で `view:integrated:create` → `sync:ua` を実行。              | ビューが存在しない場合のエラー処理、再作成時の `DROP VIEW` 手順、冪等性の担保。    |
| Import_df 取り込み  | API ベース（既存の `/api/import-data`）で定期的に投入。                                     | 負荷対策、バリデーション（勘定ラベル、期間フォーマット）を取り込み前に行う仕組み。 |
| ルール注入          | バッチ完了後に `inject-super-calc` を呼ぶ。                                                 | 開発環境と本番テンプレートの差異管理、シナリオ ID の変化への追従。                 |
| 計算実行            | `calculation:dump` を非同期ジョブとして回し、結果を API/ログに残す。                        | 補完ログの扱い、失敗時のリトライ戦略、パフォーマンス監視。                         |
| 名称ズレ対策        | `sync:ua` に `--sync-names` を追加して、`ga_name/ga_code` を `ua_name/ua_code` に同期する。 | 既存のカスタム UA への影響をどう制御するか、UI での編集との整合。                  |

自動化では、上記の CLI を直接呼ぶか、同等ロジックをサービスに組み込み、ログ・結果をダッシュボード等に連携させることを推奨。

## 4. チェックリスト（エラー再発防止）

1. `integrated_accounts_view` に `GLOBAL_ONLY` が残っていない。
2. PREVS のラベルが UA 名と揃っている（CSV インポート前にエクセル等で照合）。
3. Super Calc の基底勘定が PREVS に含まれている。
4. `calculation:dump` がエラーなく完走する。
5. 補完ログが出た場合は、補完元の勘定を確認して PREVS 側の整備計画を立てる。

以上の流れで、Import_df 取り込みから FAM.compute までを再現性高く運用できる。

## 5. V2 ダミーデータでの検証論点

新しいダミーデータ `docs/[docs]_master_data/[dummy]_import_df_data_v2.csv` を用いて以下を確認する。

1. **UA 同期**: `npm run sync:ua -- --dry-run` で `GLOBAL_ONLY` が無いこと。
2. **PREVS 投入**: `import_df` に V2 を取り込んだ後、`calculation:dump` が補完ログのみで完走する（エラーにならない）。
3. **Super Calc 補完**: V2 は主要な Super Calc を明示的に含めているため、`fillMissingSuperCalcActuals` が残余を補完しても数値が変わらない（テストで担保済み）。
4. **PL/BS 整合**: 掛け算・引き算を含む Super Calc（営業利益、純資産など）の値が PARAMETER の式と一致している。
5. **CF 連携**: `税金等調整前当期純利益` など CF 側の勘定が PREVS に存在し、`calculation:dump` の結果に反映されている。

この一連を毎開発サイクルで通せば、PREVS → UA → FAM.compute の整合を継続的に担保できる。
