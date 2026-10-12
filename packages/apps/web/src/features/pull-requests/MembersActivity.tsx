import { summarizeByMember } from "@yagura/activity";
import type { Member } from "@yagura/github-api";
import { useCallback } from "react";
import { Failure, useRequest } from "../../shared";
import { useSession } from "../session";
import { DailyActivity } from "./DailyActivity";
import { fetchMembersPullRequests } from "./fetch-pull-requests";
import { formatPeriod } from "./format";
import { MemberSummaryTable } from "./MemberSummaryTable";

/**
 * What the organization's members opened or merged lately: the period, a
 * summary table with a row per member, a chart per day, and the list of
 * pull requests, all from one fetch.
 */
export function MembersActivity(props: {
  readonly org: string;
  readonly members: readonly Member[];
}) {
  const { controller } = useSession();
  const { org, members } = props;
  const load = useCallback(
    async () =>
      fetchMembersPullRequests(
        {
          search: (query) =>
            controller.withAccessToken((token) =>
              controller.githubApi.searchPullRequests(token, query),
            ),
          getPullRequests: (ids) =>
            controller.withAccessToken((token) =>
              controller.githubApi.getPullRequests(token, ids),
            ),
        },
        controller.viewerCache(),
        members.map(({ login }) => login),
        controller.now(),
      ),
    [controller, members],
  );
  const { state, retry } = useRequest(load);

  switch (state.status) {
    case "loading":
      return <p>Loading pull requests…</p>;
    case "failed":
      return (
        <Failure
          message={`Could not load the pull requests of ${org}'s members: ${state.error}`}
          retry={retry}
        />
      );
    case "done": {
      const { period, pullRequests } = state.value;
      return (
        <>
          <p>{formatPeriod(period)}</p>
          <MemberSummaryTable
            members={members}
            summary={summarizeByMember(
              members.map(({ login }) => login),
              pullRequests,
              period,
            )}
          />
          <DailyActivity
            org={org}
            pullRequests={pullRequests}
            period={period}
          />
        </>
      );
    }
  }
}
