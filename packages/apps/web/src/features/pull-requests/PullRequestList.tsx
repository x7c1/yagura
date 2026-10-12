import { latestEventIn, type Period, type PullRequest } from "@yagura/activity";
import { dayFormat } from "./format";

/** The pull requests, newest first, as they are given. */
export function PullRequestList(props: {
  readonly pullRequests: readonly PullRequest[];
  readonly period: Period;
}) {
  const { pullRequests, period } = props;
  return (
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
        {pullRequests.map((pr) => (
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
            <td>{dayFormat.format(latestEventIn(pr, period))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
