# Offline Trip Recommender

This folder contains an offline-trained, similarity-based travel recommender.

## Layout

- `ml/data/travel_details_dataset.csv`: training data (Kaggle CSV)
- `ml/training/train_recommender.py`: offline training script
- `ml/models/trip_recommender.joblib`: saved artifact
- `ml/inference.py`: runtime inference module

## Train

From repo root:

```bash
python ml/training/train_recommender.py
```

Artifact saved to:

```text
ml/models/trip_recommender.joblib
```

## Start API Server

Create and activate a virtualenv (recommended), then install deps:

```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

pip install -r backend/python_api/requirements.txt
```

Run FastAPI server:

```bash
uvicorn backend.python_api.main:app --reload --port 8001
```

## Example curl

```bash
curl -X POST "http://127.0.0.1:8001/recommend" \
  -H "Content-Type: application/json" \
  -d '{
    "Duration (days)": 7,
    "Traveler age": 26,
    "Traveler gender": "Female",
    "Traveler nationality": "American",
    "Accommodation type": "Hotel",
    "Accommodation cost": 1200,
    "Transportation type": "Flight",
    "Transportation cost": 600,
    "start_month": 7
  }'
```
