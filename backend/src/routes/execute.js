import express from "express";
import { executeTask } from "../services/executionService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { userId, taskText, taskCategory } = req.body;
    const result = await executeTask({ userId, taskText, taskCategory });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
