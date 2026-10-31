import "server-only";

import { completeText } from "@/lib/meta/client";

import type { Factor } from "./types";

function isMock(text: string): boolean {
  return text.startsWith("MOCK ");
}

export function localBrief(factors: Factor[]): string {
  const parts = factors.map((factor) =>
    factor.status === "not_covered" || factor.score == null
      ? `${factor.id} not covered`
      : `${factor.id} ${factor.score}`,
  );
  return `Scores: ${parts.join(", ")}.`;
}

function numbersIn(text: string): number[] {
  const normalized = text.replace(/(\d),(?=\d)/g, "$1");
  const found: number[] = [];
  for (const match of normalized.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const value = Number(match[0]);
    if (Number.isFinite(value)) found.push(value);
  }
  return found;
}

function allowedNumbers(factors: Factor[]): number[] {
  const allowed: number[] = [];
  for (const factor of factors) {
    if (factor.score != null) allowed.push(factor.score);
    if (factor.year != null) allowed.push(factor.year);
    allowed.push(...numbersIn(`${factor.detail} ${factor.label} ${factor.source}`));
  }
  return allowed;
}

function numberIsAllowed(value: number, allowed: number[]): boolean {
  return allowed.some((candidate) => Math.abs(candidate - value) < 0.05);
}

export function acceptBrief(text: string, factors: Factor[]): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned || isMock(cleaned) || cleaned.length > 500) return localBrief(factors);
  if (/\b(un)?safe\b/i.test(cleaned)) return localBrief(factors);
  const allowed = allowedNumbers(factors);
  const invented = numbersIn(cleaned).some((value) => !numberIsAllowed(value, allowed));
  if (invented) return localBrief(factors);
  return cleaned;
}

export async function briefFor(factors: Factor[]): Promise<string> {
  const lines = factors.map((factor) => {
    const band =
      factor.status === "not_covered" || factor.score == null
        ? "not_covered"
        : factor.score >= 70
          ? "high"
          : factor.score >= 40
            ? "mid"
            : "low";
    return `${factor.id} ${band} ${factor.status}`;
  });
  const prompt = [
    "Write two short sentences about this place score.",
    "Cite factor ids from the list. Do not include any digits.",
    "Do not say safe or unsafe.",
    "Factors:",
    ...lines,
  ].join("\n");
  try {
    const text = await completeText(prompt);
    return acceptBrief(text, factors);
  } catch {
    return localBrief(factors);
  }
}
