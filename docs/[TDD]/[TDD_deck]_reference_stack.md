• Reference Stack

- docs/[codex]\_interface_specification_V2.md：最新 DDL 準拠の入出力スキーマ。
- docs/[codex]\_interface_alignment_analysis.md ＋ server/doc_dev_log/integration_analysis_report_20251009.md：ギャップ分析と非同期 API 方針。
- DDL 原本 docs/[最新版]\_DDL_1014.sql と既存仕様書 (docs/interface_specification_report.md など) は整合確認用。
- コアロジック把握用に server/src/fam/fam.ts, server/src/engine/ast.ts, server/src/model/\*。
- 現行 API I/O は server/api/\*.ts, server/src/index.ts。
- フロント実装とデータ消費箇所は src/pages/FinancialStatementPreview.tsx, src/hooks/_, src/components/_.
