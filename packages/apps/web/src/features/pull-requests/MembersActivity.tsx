import {
  periodEndingAt,
  summarizeByMember,
  type ActivitySummary,
  type Period,
} from "@yagura/activity";
import type { Member } from "@yagura/github-api";
import { useMemo, useState } from "react";
import { Failure, sectionStyles, useStoredThenFetched } from "../../shared";
import type { Page } from "../pages";
import { useSession } from "../session";
import { DailyActivity } from "./DailyActivity";
import {
  fetchMembersPullRequests,
  storedMembersPullRequests,
} from "./fetch-pull-requests";
import { formatPeriod } from "./format";
import styles from "./MembersActivity.module.css";
import { MemberSummaryTable } from "./MemberSummaryTable";
import { SectionHeading, UpdatingNote } from "./SectionHeading";

/**
 * What the organization's members opened or merged lately, on `page`: a
 * chart per day and the list of pull requests (the activity), or a summary
 * table with a row per member under the period it covers (the members).
 * Both pages are drawn from one fetch, made here above them, so that
 * switching between them fetches nothing again.
 *
 * What the browser cache holds is drawn at once, and the fetch brings it up
 * to date behind it, with a note at the top of the first card while it
 * runs, and its failure above the cards. When the cache holds nothing, the
 * table lists the members with placeholders, and the chart and the list say
 * they are loading, until the fetch answers.
 */
export function MembersActivity(props: {
  readonly org: string;
  readonly members: readonly Member[];
  readonly page: Page;
}) {
  const { controller } = useSession();
  const { org, members, page } = props;
  // A new member list with the same logins fetches nothing again.
  const loginsKey = members.map(({ login }) => login).join("\n");
  const source = useMemo(() => {
    const logins = loginsKey.split("\n");
    return {
      stored: () =>
        storedMembersPullRequests(
          controller.viewerCache(),
          logins,
          controller.now(),
        ),
      fetch: () =>
        fetchMembersPullRequests(
          {
            search: (query) =>
              controller.withAccessToken((token) =>
                controller.githubApi.searchPullRequestIds(token, query),
              ),
            getPullRequests: (ids) =>
              controller.withAccessToken((token) =>
                controller.githubApi.getPullRequests(token, ids),
              ),
          },
          controller.viewerCache(),
          logins,
          controller.now(),
        ),
    };
  }, [controller, loginsKey]);
  const { value, updating, error, retry } = useStoredThenFetched(source);
  // The period shown until a value with its own period is drawn.
  const [loadingPeriod] = useState(() => periodEndingAt(controller.now()));

  // Behind drawn pull requests the fetch was an update, as the organizations
  // and the members word it.
  const failure = error !== undefined && (
    <Failure
      message={`Could not ${value === undefined ? "load" : "update"} the pull requests of ${org}'s members: ${error}`}
      retry={retry}
    />
  );

  if (value === undefined) {
    // Nothing is drawn yet: the failure takes the place of what is loading.
    return (
      <>
        {page === "members" && (
          <PerMember
            members={members}
            period={loadingPeriod}
            updating={false}
          />
        )}
        {failure ? (
          <div className={sectionStyles.section}>{failure}</div>
        ) : (
          page === "activity" && (
            <>
              <section className={sectionStyles.section}>
                <SectionHeading aside={<UpdatingNote updating={false} />}>
                  Merged PRs
                </SectionHeading>
                <p className={sectionStyles.note}>Loading…</p>
              </section>
              <section className={sectionStyles.section}>
                <p className={sectionStyles.note}>Loading pull requests…</p>
              </section>
            </>
          )
        )}
      </>
    );
  }

  const { period, pullRequests } = value;
  return (
    <>
      {failure}
      {page === "members" ? (
        <PerMember
          members={members}
          period={period}
          updating={updating}
          summary={summarizeByMember(
            members.map(({ login }) => login),
            pullRequests,
            period,
          )}
        />
      ) : (
        <DailyActivity
          org={org}
          members={members}
          pullRequests={pullRequests}
          period={period}
          updating={updating}
        />
      )}
    </>
  );
}

/**
 * The members page's body: the summary table in a card of its own, without
 * a heading, as the page's tab already names it and the table is all the
 * page holds. The card's top row holds the period the table covers at the
 * left, and at the right the room for the note that an update is running.
 */
function PerMember(props: {
  readonly members: readonly Member[];
  readonly period: Period;
  readonly updating: boolean;
  readonly summary?: ActivitySummary;
}) {
  return (
    <section className={sectionStyles.section}>
      <div className={styles.topRow}>
        <p className={styles.period}>{formatPeriod(props.period)}</p>
        <UpdatingNote updating={props.updating} />
      </div>
      <MemberSummaryTable members={props.members} summary={props.summary} />
    </section>
  );
}
