# InfraPulse ML Layer

This module powers infrastructure risk + activity intelligence.

## Datasets

Synthetic (auto-generated if missing):

- `ml/datasets/bridges.csv` (>=300)
- `ml/datasets/roads.csv` (>=800)
- `ml/datasets/reports.csv` (>=3000)

## Training Artifacts

`python ml/training/train_infra_index.py`

Outputs:

- `ml/artifacts/infra_index.joblib`

## Inference Runtime

`ml/infra_inference.py` provides:

- risk scoring (hybrid explainable)
- safety band + urgency mapping
- map GeoJSON and asset detail retrieval
- report clustering + cause hypotheses
- single and batch ingestion with synchronous recalculation
- feedback-aware action ranking

Runtime persistence is SQLite-backed at `ml/feedback/infra_runtime.db` with tables:
- `reports_events`
- `feedback_events`
- `action_weights`
- `assets_snapshot`
- `model_metadata`
