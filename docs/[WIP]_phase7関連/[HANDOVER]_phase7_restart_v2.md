# Phase7 ハンドオーバー ver.2

## 1. 背景

- Phase7 再開に向けて UI/計算API 連携のデバッグを継続中。
- 計算ジョブ実行時に `期間情報が不足しています` エラーが発生したことを契機に、タイムライン同期・PREVS 正規化・CSV 取込の見直しを実施。
- CSV からの実績値が `import_df` に取り込まれる際に 0 へ落ちていた問題を解決し、現在は FAM 計算結果が UI へ正常表示される状態まで復旧済み。

## 2. 現状まとめ

- **タイムライン同期**: timelineExtractor/Orchestrator/Repository を実装し、`timeline:sync` CLI・管理API（GET/POST `/api/v1/admin/timelines`）で period を自動補完できる。
- **PREVS 正規化**: `calculationDataLoader` で PREVS キーを `ua_id/ua_name/ua_code` へマッピング。未登録ラベルは警告とともにスキップ。
- **CSV 取込**: `UserAccountImport.tsx` の CSV パースを修正し、引用付きカンマを正しく数値化。`POST /api/import-data` に 2,600,000 等の Actual が送られることを確認。
- **計算API**: `POST /api/v1/calculations` → `COMPLETED` が確認でき、PL グリッドに FY2020〜FY2023 Actual が正しく表示される。
- **Lint/Prettier**: timeline 関連ファイルなどでエラーが残存。Phase7 の一環として整理が必要。

## 3. 直近の課題と到達すべきゴール

- **計画期(Projection)の可視化**
  - 計算 payload における Forecast 列を確認し、UI で Actual と並べて表示できるように改修。
  - FAM が算出する Projection が期待通りか検証し、Core Logic の挙動を明確にする。
- **表示ロジックの磨き込み**
  - API モード時の列生成（年次のみ／計画期の扱い）と、ダミーデータとの共存を整理。
  - `displayRows` などの分岐が余計な比率行・チェック行を追加しないよう制御。
- **Lint/品質整備**
  - Prettier エラーの解消、および `no-non-null-assertion` などの警告を段階的に解消。
  - Grid 表示やオーケストレータのユニットテスト・E2E を拡充し、回帰検知を強化。

## 4. 推奨ワークフロー（次セッション導入手順）

1. `npm run start`（フロント）／`npm --prefix server run dev`（API）を起動。
2. `docs/[docs]_master_data/[dummy]_import_df_data.csv` を UI からアップロードし、`timelines/sync` CLI または管理APIで period を同期。
3. `POST /api/v1/calculations` を実行して payload を確認。
4. UI の PL/BS/CF 表示で Actual/Forecast の整合性をチェックし、差異があれば計算パイプラインを調査。
5. Lint/テストを通し、差分がないか確認。

## 5. 今後のフォローアップとリスク

- 未解決ラベルの扱い: 可能であれば自動仮ID発行や通知仕組みの導入を検討。
- Forecast 列の表示: グリッド生成ロジックが複雑化するため、テストと設計ドキュメントの更新を忘れずに。
- バックエンドのログや CLI の利用手順を手元の README/Runbook に追記しておくと、次回トラブル時の復旧が容易になる。
