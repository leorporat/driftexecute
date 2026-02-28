import express from "express";
import { submitFeedback } from "../services/executionService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { userId, eventId, executed, suggestedStrategy } = req.body;
    const result = await submitFeedback({
      userId,
      eventId,
      executed,
      suggestedStrategy,
    });
    res.json(result);
  } catch (error) {
    const status = error.message === "Event not found" ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

export default router;
