# Phase6 開発ログ（UI統合）

## 実装した要素

- `useCalculationJob` フックを追加し、UI から計算ジョブの起動・ポーリング・結果取得を可能にした。対応テストも追加。
- API から返る `financialData` をグリッド表示向けに変換するユーティリティ `buildGridFromFinancialData` を新設。
- `GridPage.tsx` に計算実行フォーム（modelId / scenarioId / projectionYears）とステータス表示、結果反映処理を実装。API結果表示中はセル編集をロックし、ダミーデータはフォールバックとして維持。
- サーバ側ユーティリティ／テストのフォーマット整備と Lint エラーの解消。

## 懸念・補足

- 既存コードには `no-non-null-assertion` などの warning が多数残っており、Phase6では未対応のまま。
- API 結果の列レイアウトは V2 payload に忠実なシンプル構成のため、PL 比率行など旧ロジックとの整合は今後の課題。

## 次のステップ例

1. API結果と既存ダミーデータ構造の差異を洗い出し、比率行や月次展開の再適合を検討。
2. `FinancialStatementPreview` や他画面とのロジック共通化が可能なら抽出。
3. Lint warning（非 null アサーション削減、未使用変数整理など）を段階的に解消してCIノイズを減らす。
