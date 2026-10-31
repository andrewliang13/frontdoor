/**
 * Meta Model API client.
 * Base URL: https://api.meta.ai/v1
 * Auth: Authorization: Bearer <MODEL_API_KEY>
 * The key is read from the environment inside request helpers and is never logged.
 */

import "server-only";

import { sparkModel } from "./models";

const CHAT_COMPLETIONS_URL = "https://api.meta.ai/v1/chat/completions";

function readApiKey(): string | null {
  const value = process.env.MODEL_API_KEY;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function completionText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return "";
  }
  const content = (choices[0] as { message?: { content?: unknown } }).message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("");
}

/** Chat completion. A missing key returns a MOCK string and does not throw. */
export async function completeText(prompt: string, model = sparkModel()): Promise<string> {
  const key = readApiKey();
  if (!key) {
    return "MOCK completeText: MODEL_API_KEY is unset.";
  }

  const response = await fetch(CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      reasoning_effort: "low",
    }),
  });

  if (!response.ok) {
    throw new Error(`Meta text request failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  return completionText(payload);
}
