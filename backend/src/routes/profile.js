import express from "express";
import { getProfileWithRecentEvents } from "../services/executionService.js";

const router = express.Router();

router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await getProfileWithRecentEvents(userId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
