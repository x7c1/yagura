import { latestEventIn, periodDays, type Period } from "@yagura/activity";
import type { Member } from "@yagura/github-api";
import { useCallback } from "react";
import { Failure, useRequest } from "../../shared";
import { useSession } from "../session";
import { fetchMembersPullRequests } from "./fetch-pull-requests";

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/** The pull requests the organization's members opened or merged lately. */
export function PullRequests(props: {
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

  return (
    <section>
      <h3>Pull requests</h3>
      {state.status === "loading" ? (
        <p>Loading pull requests…</p>
      ) : state.status === "failed" ? (
        <Failure
          message={`Could not load the pull requests of ${org}'s members: ${state.error}`}
          retry={retry}
        />
      ) : (
        <>
          <p>{formatPeriod(state.value.period)}</p>
          {state.value.pullRequests.length === 0 ? (
            <p>{`No pull requests by ${org}'s members in the last ${periodDays} days.`}</p>
          ) : (
            <table aria-label="Pull requests">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Repository</th>
                  <th scope="col">Author</th>
                  <th scope="col">State</th>
                  <th scope="col">Lines</th>
                  <th scope="col">Opened or merged</th>
                </tr>
              </thead>
              <tbody>
                {state.value.pullRequests.map((pr) => (
                  <tr key={pr.id}>
                    <td>
                      <a href={pr.url} target="_blank" rel="noreferrer">
                        {pr.title}
                      </a>
                    </td>
                    <td>{pr.repository}</td>
                    <td>{pr.author}</td>
                    <td>{pr.state}</td>
                    <td>
                      +{pr.additions} −{pr.deletions}
                    </td>
                    <td>
                      {dayFormat.format(latestEventIn(pr, state.value.period))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

/** The period as its first and last days, for example "Sep 29 – Oct 12". */
function formatPeriod(period: Period): string {
  return `${dayFormat.format(period.start)} – ${dayFormat.format(period.end)}`;
}
