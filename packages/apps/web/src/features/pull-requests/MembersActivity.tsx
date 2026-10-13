import {
  periodEndingAt,
  summarizeByMember,
  type Period,
} from "@yagura/activity";
import type { Member } from "@yagura/github-api";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Failure, useStoredThenFetched } from "../../shared";
import { useSession } from "../session";
import { DailyActivity } from "./DailyActivity";
import {
  fetchMembersPullRequests,
  storedMembersPullRequests,
} from "./fetch-pull-requests";
import { formatPeriod } from "./format";
import { MemberSummaryTable } from "./MemberSummaryTable";

/** The period line, with the update's note or failure beside it. */
const periodLine: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  columnGap: "1em",
};

/**
 * Room for the "Updating…" note, kept while it is absent, so that its
 * coming and going does not move anything.
 */
const updatingNote: CSSProperties = {
  display: "inline-block",
  minWidth: "7em",
};

/**
 * What the organization's members opened or merged lately: the period, a
 * summary table with a row per member, a chart per day, and the list of
 * pull requests, all from one fetch.
 *
 * What the browser cache holds is drawn at once, and the fetch brings it up
 * to date behind it, with a note beside the period while it runs. When the
 * cache holds nothing, the table lists the members with placeholders until
 * the fetch answers.
 */
export function MembersActivity(props: {
  readonly org: string;
  readonly members: readonly Member[];
}) {
  const { controller } = useSession();
  const { org, members } = props;
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
    return (
      <>
        <PeriodLine period={loadingPeriod} updating={false} />
        <MemberSummaryTable members={members} />
        {failure || (
          <>
            <section>
              <h3>Per day</h3>
              <p>Loading…</p>
            </section>
            <section>
              <h3>Pull requests</h3>
              <p>Loading pull requests…</p>
            </section>
          </>
        )}
      </>
    );
  }

  const { period, pullRequests } = value;
  return (
    <>
      <PeriodLine period={period} updating={updating} failure={failure} />
      <MemberSummaryTable
        members={members}
        summary={summarizeByMember(
          members.map(({ login }) => login),
          pullRequests,
          period,
        )}
      />
      <DailyActivity org={org} pullRequests={pullRequests} period={period} />
    </>
  );
}

/**
 * The period, and beside it the note that an update is running or, in its
 * place, the update's failure.
 */
function PeriodLine(props: {
  readonly period: Period;
  readonly updating: boolean;
  readonly failure?: ReactNode;
}) {
  const { period, updating, failure } = props;
  return (
    <div style={periodLine}>
      <p>{formatPeriod(period)}</p>
      {failure || (
        <span role="status" style={updatingNote}>
          {updating && "Updating…"}
        </span>
      )}
    </div>
  );
}
