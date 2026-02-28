import express from "express";
import executeRoute from "./routes/execute.js";
import feedbackRoute from "./routes/feedback.js";
import profileRoute from "./routes/profile.js";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/execute", executeRoute);
app.use("/feedback", feedbackRoute);
app.use("/profile", profileRoute);

export default app;
