/** Whether `value` is an object, to read its properties as unknowns. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
