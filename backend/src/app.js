import cors from "cors";
import express from "express";
import executeRoute from "./routes/execute.js";
import feedbackRoute from "./routes/feedback.js";
import profileRoute from "./routes/profile.js";

const app = express();
const ML_API_BASE_URL = process.env.ML_API_BASE_URL || "http://127.0.0.1:8001";

app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

async function proxyMl(path, init = {}) {
  const response = await fetch(`${ML_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = { error: "Invalid response from ML API" };
  }

  if (!response.ok) {
    const message = payload?.detail || payload?.error || "ML API request failed";
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

app.get("/api/map/assets", async (req, res) => {
  try {
    const type = req.query.type || "all";
    const payload = await proxyMl(`/map/assets?type=${encodeURIComponent(type)}`);
    res.json(payload);
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message, detail: error.payload || null });
  }
});

app.get("/api/asset/:id", async (req, res) => {
  try {
    const payload = await proxyMl(`/asset/${encodeURIComponent(req.params.id)}`);
    res.json(payload);
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message, detail: error.payload || null });
  }
});

app.post("/api/recommend", async (req, res) => {
  try {
    const payload = await proxyMl("/recommend", {
      method: "POST",
      body: JSON.stringify(req.body || {}),
    });
    res.json(payload);
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message, detail: error.payload || null });
  }
});

app.post("/api/reports/ingest", async (req, res) => {
  try {
    const payload = await proxyMl("/reports/ingest", {
      method: "POST",
      body: JSON.stringify(req.body || {}),
    });
    res.json(payload);
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message, detail: error.payload || null });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    const payload = await proxyMl("/feedback", {
      method: "POST",
      body: JSON.stringify(req.body || {}),
    });
    res.json(payload);
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message, detail: error.payload || null });
  }
});

app.get("/api/examples", async (_req, res) => {
  try {
    const map = await proxyMl("/map/assets?type=all");
    const features = Array.isArray(map?.features) ? map.features : [];
    const top = [...features]
      .sort(
        (a, b) =>
          (b?.properties?.risk_score || 0) - (a?.properties?.risk_score || 0),
      )
      .slice(0, 5)
      .map((item) => item?.properties?.asset_id)
      .filter(Boolean);

    res.json({
      asset_ids: top,
      voice_notes: [
        "Observed recurring pothole rebound after previous patch on northbound lane shoulder.",
        "Bridge deck shows corrosion staining and fresh spalling near expansion joint.",
        "Drainage inlet blocked and edge washout worsening after rainfall.",
      ],
    });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message, detail: error.payload || null });
  }
});

app.use("/execute", executeRoute);
app.use("/feedback", feedbackRoute);
app.use("/profile", profileRoute);

export default app;
