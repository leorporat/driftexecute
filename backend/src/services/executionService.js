import { STRATEGIES } from "../config/strategies.js";
import {
  getRecentEvents,
  getUserProfile,
  saveEvent,
  updateStrategyStats,
  markEventExecuted,
} from "./memoryService.js";
import { generateExecutionPlan } from "./llmService.js";

function successRate({ success = 0, failure = 0 }) {
  const total = success + failure;
  if (!total) return 0;
  return success / total;
}

function pickBestStrategy(strategyStats = {}) {
  const ranked = STRATEGIES.map((name) => {
    const stat = strategyStats[name] || { success: 0, failure: 0 };
    return { name, rate: successRate(stat), trials: stat.success + stat.failure };
  }).sort((a, b) => b.rate - a.rate || b.trials - a.trials);

  return ranked[0]?.name || STRATEGIES[0];
}

function strategyStatsToText(strategyStats = {}) {
  return STRATEGIES.map((name) => {
    const stat = strategyStats[name] || { success: 0, failure: 0 };
    const total = stat.success + stat.failure;
    const rate = total ? ((stat.success / total) * 100).toFixed(0) : "0";
    return `${name}: ${stat.success} success, ${stat.failure} failure (${rate}% success)`;
  }).join("\n");
}

function recentEventsToText(events) {
  if (!events.length) return "No recent events.";

  return events
    .map((event) => {
      return `- [${event.timestamp}] task="${event.taskText}" strategy=${event.suggestedStrategy} executed=${event.executed}`;
    })
    .join("\n");
}

function buildPromptContext({ profile, recentEvents, taskText, taskCategory, bestStrategy }) {
  const summaryText = profile.summary || "No profile summary yet.";

  return [
    "You are generating an execution suggestion for one user.",
    "",
    `User ID: ${profile.userId}`,
    `Task category: ${taskCategory || "general"}`,
    `Current task: ${taskText}`,
    "",
    `User summary: ${summaryText}`,
    "",
    "Strategy stats:",
    strategyStatsToText(profile.strategyStats),
    "",
    `Most successful strategy so far: ${bestStrategy}`,
    "",
    "Recent interaction events:",
    recentEventsToText(recentEvents),
    "",
    "Return a practical, low-friction suggestion for this exact task.",
  ].join("\n");
}

export async function executeTask({ userId, taskText, taskCategory }) {
  if (!userId || !taskText) {
    throw new Error("userId and taskText are required");
  }

  const profile = await getUserProfile(userId);
  const recentEvents = await getRecentEvents(userId, 10);
  const bestStrategy = pickBestStrategy(profile.strategyStats);

  const promptContext = buildPromptContext({
    profile,
    recentEvents,
    taskText,
    taskCategory,
    bestStrategy,
  });

  const plan = await generateExecutionPlan(promptContext);

  const event = await saveEvent({
    userId,
    taskText,
    taskCategory,
    suggestedStrategy: plan.recommendedStrategy,
    executed: null,
    explanation: plan.explanation,
    microSteps: plan.microSteps,
    actionPayload: plan.actionPayload,
  });

  return {
    eventId: event.id,
    explanation: plan.explanation,
    microSteps: plan.microSteps,
    recommendedStrategy: plan.recommendedStrategy,
    actionPayload: plan.actionPayload,
  };
}

export async function submitFeedback({ userId, eventId, executed }) {
  if (!userId || !eventId || typeof executed !== "boolean") {
    throw new Error("userId, eventId and executed(boolean) are required");
  }

  const event = await markEventExecuted(userId, eventId, executed);
  if (!event) {
    throw new Error("Event not found");
  }

  const profile = await updateStrategyStats(
    userId,
    event.suggestedStrategy,
    executed,
  );

  return {
    eventId,
    executed,
    suggestedStrategy: event.suggestedStrategy,
    strategyStats: profile.strategyStats,
  };
}

export async function getProfileWithRecentEvents(userId) {
  const profile = await getUserProfile(userId);
  const recentEvents = await getRecentEvents(userId, 10);

  return { profile, recentEvents };
}

export const _internal = {
  buildPromptContext,
  pickBestStrategy,
  strategyStatsToText,
};
