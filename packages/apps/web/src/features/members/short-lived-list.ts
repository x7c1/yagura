import { isWithinShortLife } from "@yagura/activity";
import type { JsonValue } from "@yagura/browser";
import type { Member, Organization } from "@yagura/github-api";
import { isRecord, type Stored, type ViewerCache } from "../../shared";

/**
 * A list kept in the browser cache as a short-lived entry: stored with the
 * time it was stored, and used without a request for the short life after.
 */
export interface ShortLivedList<T> {
  /** The cache key, under the viewer's prefix. */
  readonly key: string;
  readonly encode: (item: T) => JsonValue;
  /** The stored item, or `undefined` when it is not readable as one. */
  readonly decode: (value: unknown) => T | undefined;
}

/** The installations' organizations the GitHub App is on. */
export const installationsList: ShortLivedList<Organization> = {
  key: "installations",
  encode: ({ login }) => ({ login }),
  decode: (value) =>
    isRecord(value) && typeof value.login === "string"
      ? { login: value.login }
      : undefined,
};

/** An organization's member list. */
export function membersList(org: string): ShortLivedList<Member> {
  return {
    key: `members/${org}`,
    encode: ({ login, avatarUrl }) => ({ login, avatarUrl }),
    decode: (value) =>
      isRecord(value) &&
      typeof value.login === "string" &&
      typeof value.avatarUrl === "string"
        ? { login: value.login, avatarUrl: value.avatarUrl }
        : undefined,
  };
}

/**
 * The stored list, whatever its age, and whether it is within its short
 * life at `now`; `undefined` when none is stored or it is unreadable.
 */
export async function readStoredList<T>(
  cache: ViewerCache,
  list: ShortLivedList<T>,
  now: Date,
): Promise<Stored<T[]> | undefined> {
  const value = await cache.get(list.key);
  if (
    !isRecord(value) ||
    typeof value.storedAt !== "number" ||
    !Array.isArray(value.items)
  ) {
    return undefined;
  }
  const items: T[] = [];
  for (const stored of value.items) {
    const item = list.decode(stored);
    if (item === undefined) {
      return undefined;
    }
    items.push(item);
  }
  return {
    value: items,
    fresh: isWithinShortLife(new Date(value.storedAt), now),
  };
}

/**
 * The list: from the browser cache while the stored one is within its
 * short life at `now`, else from `fetchList`, storing the result.
 */
export async function loadList<T>(
  cache: ViewerCache,
  list: ShortLivedList<T>,
  now: Date,
  fetchList: () => Promise<T[]>,
): Promise<T[]> {
  const stored = await readStoredList(cache, list, now);
  if (stored?.fresh === true) {
    return stored.value;
  }
  const items = await fetchList();
  await cache.set(list.key, {
    storedAt: now.getTime(),
    items: items.map(list.encode),
  });
  return items;
}
