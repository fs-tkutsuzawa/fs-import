# Super Calc テンプレート適用概要

## 1. 背景

- CLI `scripts/cli/inject-super-calc.ts` により Super Calc テンプレートを `calculation_rules` に注入できるよう整備した。
- テンプレートは `global_accounts.ga_code` をキーにしてターゲット/参照勘定を特定する。
- 現行の `user_accounts` に対応 GA コードが不足しており、注入時に `[SKIP]` が多発。

## 2. 現状観測

- `yarn inject-super-calc --scenario-id=1 --dry-run` を実行すると、`gross_profit` や `personnel_costs` などが見つからず 14 件の SKIP。
- シナリオ 1 の `user_accounts` には `sga`, `trade_receivables` など一部 GA コードのみが存在。
- `calculation_rules` には未だルールが登録されていない。

## 3. 課題

1. テンプレートで想定する GA コードと `user_accounts.parent_ga_id` が一致していない。
2. `user_accounts` はシナリオ共通マスタであり、シナリオ別に勘定を分ける設計ではない。
3. テンプレートを現行勘定体系に合わせるのか、マスタをテンプレートに合わせて整備するのか判断が未定。

## 4. 対応オプション

| オプション | 内容                                                      | メリット                         | 留意点                                   |
| ---------- | --------------------------------------------------------- | -------------------------------- | ---------------------------------------- |
| A          | テンプレートで利用する GA コードを `user_accounts` に追加 | テンプレートをそのまま利用できる | マスタ整備の初期コスト                   |
| B          | `master_rules.json` を現状構成向けに調整                  | 即時適用が可能                   | 汎用性が低下、シナリオごとに複製の可能性 |
| C          | GA コードのマッピングレイヤーを導入                       | 異なる勘定体系も吸収できる       | 実装・保守コストが高い                   |

## 5. 理想のゴール

- テンプレートの `targetAccountCode/refAccountCode` と `user_accounts.parent_ga_id` が完全一致し、CLI 実行時に `[SKIP]` が出ない。
- `calculation_rules` に `custom_calc` ルールが挿入/更新される。
- 将来的な API 化でも同じテンプレートを再利用できる。

## 6. 次のステップ案

1. `user_accounts` とテンプレート内の GA コードを突合し、不足リストを作成。
2. A/B/C のどの方針を採用するか意思決定。
3. 調整後に `yarn inject-super-calc --scenario-id=<id> --dry-run` で再検証。
4. 問題なければ本実行 → `yarn show:rules --scenario-id=<id>` で結果を確認。

## 7. テンプレート生成プロンプト（LLM 用）

```
You are given the current global account master as CSV:
"id","ga_name","ga_code","sort_num","indent_num","fs_type","ga_type","is_credit","parent_ga_id"
sga,販売費及び一般管理費,sga,6,0,PL,super_calc,,
operating_income,営業利益,operating_income,7,0,PL,super_calc,,
non_operating_income,営業外収益,non_operating_income,8,0,PL,super_calc,,
non_operating_expenses,営業外費用,non_operating_expenses,9,0,PL,super_calc,,
ordinary_income,経常利益,ordinary_income,10,0,PL,super_calc,,
extraordinary_income,特別利益,extraordinary_income,11,0,PL,super_calc,,
extraordinary_loss,特別損失,extraordinary_loss,12,0,PL,super_calc,,
pre_tax_income,税引前当期純利益,pre_tax_income,13,0,PL,super_calc,,
tangible_fixed_assets,有形固定資産,tangible_fixed_assets,7,1,BS,super_calc,false,
intangible_fixed_assets,無形固定資産,intangible_fixed_assets,8,1,BS,super_calc,false,
investments,投資その他の資産,investments,9,1,BS,super_calc,false,
non_current_assets,固定資産,non_current_assets,10,1,BS,super_calc,false,
assets,資産,assets,11,0,BS,super_calc,false,
non_current_liabilities,固定負債,non_current_liabilities,17,1,BS,super_calc,true,
liabilities,負債,liabilities,18,0,BS,super_calc,true,
shareholders_equity,株主資本,shareholders_equity,21,1,BS,super_calc,true,
equity,純資産,equity,22,0,BS,super_calc,true,
cfi,投資活動によるキャッシュ・フロー,cash_flow_from_investing_activities,13,0,CF,super_calc,,
cff,財務活動によるキャッシュ・フロー,cash_flow_from_financing_activities,19,0,CF,super_calc,,
cash_and_equivalents_beginning,現金及び現金同等物の期首残高,cash_and_cash_equivalents_beginning_of_period,20,0,CF,super_calc,,
cash_and_equivalents_end,現金及び現金同等物の期末残高,cash_and_cash_equivalents_end_of_period,21,0,CF,super_calc,,
cfo,営業活動によるキャッシュ・フロー,cash_flow_from_operating_activities,8,0,CF,super_calc,,
net_income,当期純利益,net_income,15,0,PL,super_calc,,

Generate `master_rules.json` for the CLI injector. For each row where ga_type == "super_calc", output an object:
{
  "targetAccountCode": "<ga_code>",
  "rule_type": "PARAMETER",
  "description": "<日本語の注釈>",
  "calculation": [
     { "refAccountCode": "<child-ga_code>", "operator": "+" | "-" | "*" | "/" },
     ...
  ]
}

Rules:
1. Use ga_code (lowercase) for targetAccountCode/refAccountCode.
2. Derive references by looking at expected child aggregates. If no children, skip or set calculation to [] (will be skipped) but flag in description.
3. Keep expressions simple (加算減算中心) and align with accounting logic.
4. Output a JSON array ready to be saved as server/src/templates/master_rules.json.
```
