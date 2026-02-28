"use client";

import { useState } from "react";
import {
  executeTask,
  getExecutionProfile,
  submitFeedback,
} from "@/lib/api/client";
import type {
  ExecutionProfileResponse,
  ExecuteTaskResponse,
  SubmitFeedbackResponse,
} from "@/lib/types";

export default function ExecutionTestPage() {
  const [userId, setUserId] = useState("user-123");
  const [taskText, setTaskText] = useState("I need to email my manager but I keep rewriting it");
  const [taskCategory, setTaskCategory] = useState("communication");

  const [plan, setPlan] = useState<ExecuteTaskResponse | null>(null);
  const [feedbackResult, setFeedbackResult] = useState<SubmitFeedbackResponse | null>(null);
  const [profileResult, setProfileResult] = useState<ExecutionProfileResponse | null>(null);

  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGeneratePlan() {
    setError(null);
    setLoadingPlan(true);
    try {
      const result = await executeTask({
        userId: userId.trim(),
        taskText: taskText.trim(),
        taskCategory: taskCategory.trim() || undefined,
      });
      setPlan(result);
      setFeedbackResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plan");
    } finally {
      setLoadingPlan(false);
    }
  }

  async function handleSubmitFeedback(executed: boolean) {
    if (!plan) return;
    setError(null);
    setLoadingFeedback(true);
    try {
      const result = await submitFeedback({
        userId: userId.trim(),
        eventId: plan.eventId,
        executed,
        suggestedStrategy: plan.recommendedStrategy,
      });
      setFeedbackResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setLoadingFeedback(false);
    }
  }

  async function handleLoadProfile() {
    setError(null);
    setLoadingProfile(true);
    try {
      const result = await getExecutionProfile(userId.trim());
      setProfileResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoadingProfile(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Execution Backend Test</h1>
        <p className="mt-2 text-sm text-slate-600">
          Direct test UI for /execute, /feedback, and /profile endpoints.
        </p>
      </header>

      <div className="space-y-4 rounded border border-slate-300 bg-white p-4">
        <label className="block text-sm font-semibold text-slate-700" htmlFor="userId">
          User ID
        </label>
        <input
          className="w-full border border-slate-300 px-3 py-2 text-sm"
          id="userId"
          onChange={(e) => setUserId(e.target.value)}
          value={userId}
        />

        <label className="block text-sm font-semibold text-slate-700" htmlFor="taskText">
          Task Text
        </label>
        <textarea
          className="min-h-28 w-full border border-slate-300 px-3 py-2 text-sm"
          id="taskText"
          onChange={(e) => setTaskText(e.target.value)}
          value={taskText}
        />

        <label className="block text-sm font-semibold text-slate-700" htmlFor="taskCategory">
          Task Category (optional)
        </label>
        <input
          className="w-full border border-slate-300 px-3 py-2 text-sm"
          id="taskCategory"
          onChange={(e) => setTaskCategory(e.target.value)}
          value={taskCategory}
        />

        <div className="flex flex-wrap gap-2">
          <button
            className="border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={loadingPlan}
            onClick={handleGeneratePlan}
            type="button"
          >
            {loadingPlan ? "Generating..." : "Generate Plan"}
          </button>

          <button
            className="border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
            disabled={loadingProfile}
            onClick={handleLoadProfile}
            type="button"
          >
            {loadingProfile ? "Loading..." : "Load Profile"}
          </button>
        </div>

        {error ? <p className="text-sm font-semibold text-red-700">Error: {error}</p> : null}
      </div>

      {plan ? (
        <div className="space-y-3 rounded border border-sky-300 bg-sky-50 p-4">
          <h2 className="text-lg font-bold text-slate-900">Generated Plan</h2>
          <p className="text-sm text-slate-700">Event ID: {plan.eventId}</p>
          <p className="text-sm text-slate-700">Strategy: {plan.recommendedStrategy}</p>
          <p className="text-sm text-slate-800">{plan.explanation}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-800">
            {plan.microSteps.map((step, index) => (
              <li key={`${index}-${step}`}>{step}</li>
            ))}
          </ol>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Action payload
            </summary>
            <pre className="mt-2 overflow-x-auto bg-white p-2 text-xs">
              {JSON.stringify(plan.actionPayload, null, 2)}
            </pre>
          </details>

          <div className="flex gap-2 pt-2">
            <button
              className="border border-green-700 bg-green-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={loadingFeedback}
              onClick={() => handleSubmitFeedback(true)}
              type="button"
            >
              I did it
            </button>
            <button
              className="border border-red-700 bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={loadingFeedback}
              onClick={() => handleSubmitFeedback(false)}
              type="button"
            >
              I didn't do it
            </button>
          </div>
        </div>
      ) : null}

      {feedbackResult ? (
        <div className="space-y-2 rounded border border-emerald-300 bg-emerald-50 p-4">
          <h2 className="text-lg font-bold text-slate-900">Feedback Response</h2>
          <p className="text-sm text-slate-700">
            Event {feedbackResult.eventId} saved with executed={String(feedbackResult.executed)}.
          </p>
          <p className="text-sm text-slate-700">Strategy: {feedbackResult.suggestedStrategy}</p>
          <pre className="overflow-x-auto bg-white p-2 text-xs">
            {JSON.stringify(feedbackResult.strategyStats, null, 2)}
          </pre>
        </div>
      ) : null}

      {profileResult ? (
        <div className="space-y-3 rounded border border-slate-300 bg-slate-50 p-4">
          <h2 className="text-lg font-bold text-slate-900">Profile + Recent Events</h2>
          <p className="text-sm text-slate-700">User: {profileResult.profile.userId}</p>
          <pre className="overflow-x-auto bg-white p-2 text-xs">
            {JSON.stringify(profileResult.profile.strategyStats, null, 2)}
          </pre>

          <div>
            <h3 className="text-sm font-semibold text-slate-800">Recent Events</h3>
            <ul className="mt-2 space-y-2">
              {profileResult.recentEvents.map((event) => (
                <li className="border border-slate-300 bg-white p-2 text-xs" key={event.id}>
                  <p>
                    <strong>{event.timestamp}</strong>
                  </p>
                  <p>Task: {event.taskText}</p>
                  <p>Strategy: {event.suggestedStrategy}</p>
                  <p>Executed: {String(event.executed)}</p>
                </li>
              ))}
              {profileResult.recentEvents.length === 0 ? (
                <li className="text-xs text-slate-600">No events yet.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
