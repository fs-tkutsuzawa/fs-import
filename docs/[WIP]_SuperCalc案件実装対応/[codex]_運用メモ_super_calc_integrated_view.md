# integrated_accounts_view 運用メモ

## 目的

- `global_accounts` と `user_accounts` を結合した最新メタデータを提供し、UA 未整備な GA を即座に検出する。
- Super Calc を含む全勘定の整合を可視化し、UA 同期 CLI (SC-002) の前提をつくる。

## 作成方法

```bash
npm --prefix server run view:integrated:create
```

- 上記コマンドは `server/src/scripts/createIntegratedAccountsView.ts` を実行し、`integrated_accounts_view` を作成/更新する。
- DB 接続情報は `POSTGRES_*` 環境変数 （もしくは `server/.env`）を利用。

## ビュー構造（抜粋）

| column                | description                                      |
| --------------------- | ------------------------------------------------ |
| `source`              | `USER_ACCOUNT` or `GLOBAL_ONLY`                  |
| `user_account_id`     | 対応する UA ID (`GLOBAL_ONLY` の場合は NULL)     |
| `ua_name` / `ua_code` | UA 名称 / コード（GA の場合は `ga_name` を流用） |
| `global_account_id`   | 参照元 GA ID                                     |
| `ga_name` / `ga_code` | GA 名称 / コード                                 |
| `ga_type`             | aggregate / super_calc                           |
| `sort_num`            | 表示順序                                         |
| `indent_num`          | 階層インデント                                   |

## 利用ポイント

- `source='GLOBAL_ONLY'` の行は「UA が未登録の GA」であり、UA 同期 CLI のターゲットになる。
- `calculationDataLoader` 改修後（SC-003）では、このビューを通じて PREVS キーを UA ID へ正規化する。
- ダッシュボードやデバッグクエリ例:

```sql
SELECT *
FROM integrated_accounts_view
WHERE source = 'GLOBAL_ONLY'
ORDER BY ga_fs_type, sort_num;
```

UA が揃っていれば結果セットは空になる。

## UA 同期 CLI

```bash
npm run sync:ua -- [--dry-run] [--fs-type=PL|BS|CF|PPE] [--ga-type=super_calc|aggregate] [--ga-code=<GA_CODE>]
```

- `--dry-run`: 変更を加えずに不足 GA を表示のみ。
- `--fs-type` / `--ga-type`: 対象を絞り込むフィルタ（任意）。
- `--ga-code`: 特定の GA のみ同期したいときに指定。
- 実行後に `GLOBAL_ONLY` 行がなくなれば、UA がすべて揃っている。

## 計算 CLI の前提チェック

`npm --prefix server run calculation:dump` は実行前に `integrated_accounts_view` を確認し、GLOBAL_ONLY が残っているとエラーで停止します。
その場合は `npm run sync:ua` で UA を同期してから再実行してください。

## Super Calc 補完について

- PREVS に Super Calc が含まれていない場合でも、SC-005 以降は PARAMETER ルールから自動補完されます。
- 参照勘定が不足して補完できない場合は `calculation:dump` がエラーと共に停止します。
- 運用上は PREVS 側に Super Calc を極力含めつつ、欠落時はログを確認し `sync:ua` や PREVS 再投入で整合を取ってください。
