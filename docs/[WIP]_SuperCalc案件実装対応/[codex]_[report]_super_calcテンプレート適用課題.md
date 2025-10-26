# Super Calc テンプレート適用課題レポート（暫定）

## 1. 背景

- CLI `scripts/cli/inject-super-calc.ts` でテンプレート (`server/src/templates/master_rules.json`) を `calculation_rules` に投入する仕組みを構築。
- テンプレートは `targetAccountCode` / `refAccountCode` を `global_accounts.ga_code` で指定し、対応する `user_accounts` を解決できる前提。
- シナリオID 1 でドライラン実行したところ、対象・参照勘定が見つからず全件 `SKIP` となり、ルールが登録されない。

## 2. 観測事象

```
=== Processing scenario 1 ===
[SKIP] Scenario 1: target account not found for ga_code="gross_profit"
[SKIP] Scenario 1: reference account not found for ga_code="personnel_costs" (target=sga)
...（以下類似）...
Scenario 1: inserted=0, updated=0, skipped=14
```

`user_accounts` を確認すると、存在する `ga_code` は以下に限られる（抜粋）:

| id  | ua_name            | ga_code           |
| --- | ------------------ | ----------------- |
| 1   | テスト売上高       | sga               |
| 2   | テスト売上原価     | sga               |
| 3   | テスト販管費       | sga               |
| 4   | テスト営業外収益   | sga               |
| 5   | テスト営業外費用   | sga               |
| 10  | テスト材料費       | sga               |
| 11  | テスト労務費       | sga               |
| 12  | テスト経費         | sga               |
| 20  | テスト現金及び預金 | trade_receivables |
| 21  | テスト売掛金       | trade_receivables |
| 22  | テスト棚卸資産     | trade_receivables |

テンプレートが要求する `ga_code`（例: `gross_profit`, `operating_income`, `personnel_costs`, `advertising_expenses`, `current_assets` 等）が1件も揃っていない。

## 3. 根本原因

- テンプレートは `global_accounts_202510141854.csv` に含まれる多くの Super Calc GA を前提にしている。
- シナリオ 1 の `user_accounts` は、`sga` や `trade_receivables` など限られた GA のみ登録されており、テンプレート参照先と一致しない。
- そのため CLI が対象・参照勘定を解決できず、全ルールがスキップされる。

## 4. 論点（対応方針の選択肢）

1. **ユーザー勘定の整備**
   - テンプレートに合わせて `user_accounts` を追加。
   - 例: `ga_code='gross_profit'` を持つユーザー勘定、`operating_income`, `personnel_costs`, `advertising_expenses`, `current_assets` …などを作成。
   - 既存シナリオに共通テンプレートを適用したい場合は必須作業。
2. **テンプレートの簡略化**
   - 現状存在する `ga_code`（例: `sga`, `trade_receivables` 等）に合わせて `master_rules.json` を編集。
   - 既存の勘定構造に特化したテンプレートを作り直すアプローチ。
   - 将来の汎用性が落ちる点に留意。
3. **勘定マッピングレイヤーの導入**
   - `global_accounts.ga_code` と `user_accounts` の対応表を別管理し、テンプレート投入時に「代替 ga_code」を指定できるようにする。
   - 参照先が複数あるケース（例: `sga` に子勘定多数）にも対応可能。

## 5. 推奨ステップ

1. 現行 `user_accounts` を棚卸しし、テンプレートで使用している `ga_code` が揃っているかチェックする SQL/スクリプトを用意する。
   ```sql
   SELECT DISTINCT ga.ga_code
     FROM user_accounts ua
     JOIN global_accounts ga ON ua.parent_ga_id = ga.id
   ORDER BY ga.ga_code;
   ```
2. テンプレート側の `targetAccountCode` / `refAccountCode` と突合し、足りない GA をリスト化する。
3. 上記リストをもとに、
   - (A) 必要な `user_accounts` を追加するか、
   - (B) テンプレートを現行勘定に合わせて編集するか、
   - (C) マッピング機構を追加するか、を決定する。
4. 決定後に再度 `yarn inject:super-calc --scenario-id=<id> --dry-run` で検証し、本番投入する。

## 6. 備考

- `sga` に紐づく子勘定（材料費・労務費など）は存在するものの、テンプレートが参照する `personnel_costs`, `advertising_expenses` とは `ga_code` が一致しない。テンプレートをこの構造に合わせるなら `refAccountCode` を `sga` 系に置き換える必要あり。
- 将来的にテンプレートを汎用化する場合は、`user_accounts.ua_code` を活用した明示的なマッピングテーブルを検討すると、既存勘定との橋渡しがしやすい。

以上。現状はテンプレートと `user_accounts` の不一致が唯一の阻害要因であるため、どちらを合わせにいくか（勘定の追加 vs テンプレート修正）を主論点として進める。

## 7. 理想のゴール・目指すべき状態

理想的な「解決済み」の状態は、テンプレート（master_rules.json）とシナリオ内の user_accounts が 1 対 1 で噛み合っていて、CLI を実行すると Super Calc ルールが迷わず calculation_rules に登録される状況です。もう少し分解すると次の整合が取れていれば OK です。

1. テンプレート側
   - targetAccountCode / refAccountCode に記載した ga_code が明確に定義されている（global_accounts に存在する）。
   - ルールのターゲット、参照、演算子などがテンプレートとして表現できる。
2. ユーザー勘定 (user_accounts)
   - 各シナリオに、テンプレートで登場するすべての ga_code が最低 1 件ずつ存在する。
     - 例えばテンプレートが gross_profit を対象にしているなら、parent_ga_id が gross_profit を指すユーザー勘定がそのシナリオに存在する。
   - 参照先となる勘定（personnel_costs, advertising_expenses, …）も同様に揃っている。
3. CLI 実行結果
   - npm run inject-super-calc（--dry-run 含む）を回した際に [SKIP] が出ない（もしくは意図したスキップのみ）。
   - 挿入／更新件数が期待通り増え、calculation_rules にルールが生成される。

つまり「テンプレートが想定している GA コードの集合」と「シナリオに存在する user_accounts の GA コードの集合」が一致していれば、片側の不足でスキップさ
れることはなくなり、CLI を実行した時点でテンプレート通りの Super Calc が注入されます。
