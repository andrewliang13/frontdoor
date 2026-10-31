import "server-only";

/** Contributor Spark. Override with MODEL_TEXT_MODEL. */
export function sparkModel(): string {
  const chosen = process.env.MODEL_TEXT_MODEL?.trim();
  return chosen || "muse-spark-1.3-contributor";
}
