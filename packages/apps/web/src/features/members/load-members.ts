import { isWithinShortLife } from "@yagura/activity";
import type { Member } from "@yagura/github-api";
import { isRecord, type ViewerCache } from "../../shared";

/** The cache key of an organization's member list. */
export function membersCacheKey(org: string): string {
  return `members/${org}`;
}

/**
 * The organization's members: from the browser cache while the stored list
 * is within its short life at `now`, else from `fetchMembers`, storing the
 * result.
 */
export async function loadMembers(
  cache: ViewerCache,
  org: string,
  now: Date,
  fetchMembers: () => Promise<Member[]>,
): Promise<Member[]> {
  const key = membersCacheKey(org);
  const stored = decodeStoredMembers(await cache.get(key));
  if (stored !== undefined && isWithinShortLife(stored.storedAt, now)) {
    return stored.members;
  }
  const members = await fetchMembers();
  await cache.set(key, {
    storedAt: now.getTime(),
    members: members.map(({ login, avatarUrl }) => ({ login, avatarUrl })),
  });
  return members;
}

function decodeStoredMembers(
  value: unknown,
): { storedAt: Date; members: Member[] } | undefined {
  if (
    !isRecord(value) ||
    typeof value.storedAt !== "number" ||
    !Array.isArray(value.members)
  ) {
    return undefined;
  }
  const members: Member[] = [];
  for (const member of value.members) {
    if (
      !isRecord(member) ||
      typeof member.login !== "string" ||
      typeof member.avatarUrl !== "string"
    ) {
      return undefined;
    }
    members.push({ login: member.login, avatarUrl: member.avatarUrl });
  }
  return { storedAt: new Date(value.storedAt), members };
}
