# Super Calc 実績補完方針メモ (v1)

## 目的

- Import_df (PREVS) に Super Calc 科目が欠落していても FAM 計算を止めない仕組みを整える。
- 整合性を保ちつつ、運用側が「PREVS に明示する」ケースと「システムで算出する」ケースを両立させる。

## 基本方針

1. **原則は PREVS に Super Calc を含める。**
   - 連携ドキュメントでは、GA が定義する Super Calc 科目を PREVS に含めることをガイドする。
   - CLI (`calculation:dump`) や Loader 正規化で、欠落時には警告あるいは補完処理を発火させる。
2. **PREVS に存在しない場合は PARAMETER を用いて補完する。**
   - 補完は `calculationDataLoader` の PREVS 正規化後に実施。
   - 参照の不足で算出できない場合はエラーまたは警告を返し、`sync:ua` や PREVS 追加入力を促す。

## 補完処理のイメージ

1. PREVS を `normalizePrevsAccountIds` で UA ID に変換後、Super Calc ターゲットを走査。
2. `calculation_rules` の `rule_definition` を参照し、`type: 'custom_calc'` などの PARAMETER を適用。
3. 参照先がすべて存在する場合は値を算出して PREVS スナップショットに埋め込む。
4. 不足がある場合は `計算式に必要な勘定が不足` のメッセージを返し、CLI 側で同期や PREVS 追加を促す。

## ログ・ドキュメントでの明記

- 補完によって生成された値は CLI ログに `[COMPLETE] Filled super_calc <ga_code>` のように出力。
- ドキュメント (`運用メモ_super_calc_integrated_view.md`) では「PREVS に存在しない場合は自動計算されるが、確認のため PREVS への反映を推奨」と明記。

## 実装状況

- SC-005 で `calculationDataLoader` に補完ロジックを実装。PREVS に存在しない Super Calc でも PARAMETER から値が埋まる。
- 補完できない場合はエラーとして CLI に通知し、PREVS 追加入力または UA 同期を促す。
- 今後は `sync:ua` の拡張（ga_name/ga_code → ua_name/ua_code の自動反映）などで PREVS 表記とのズレをさらに減らす予定。

---
