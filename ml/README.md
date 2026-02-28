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
- cluster summaries + TF-IDF index + structured feature scaler

## Inference

`ml/infra_inference.py` provides:

- map GeoJSON scores
- asset detail retrieval
- report clustering + cause hypotheses
- ingestion + feedback loops

