/**
 * The pages of the signed-in view: the activity per day with the pull
 * request list, and the summary per member.
 */
export type Page = "activity" | "members";

/** The path of each page. */
export const pagePaths: Readonly<Record<Page, string>> = {
  activity: "/",
  members: "/members",
};

/** The name of each page, on its tab and in the document title. */
export const pageLabels: Readonly<Record<Page, string>> = {
  activity: "Activity",
  members: "Members",
};

/** The page whose path is `pathname`, or `undefined` for any other path. */
export function pageAt(pathname: string): Page | undefined {
  for (const [page, path] of Object.entries(pagePaths) as [Page, string][]) {
    if (path === pathname) {
      return page;
    }
  }
  return undefined;
}
