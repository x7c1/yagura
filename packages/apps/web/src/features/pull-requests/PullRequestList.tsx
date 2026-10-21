import { latestEventIn, type Period, type PullRequest } from "@yagura/activity";
import type { Member } from "@yagura/github-api";
import { tableStyles } from "../../shared";
import { dayBands } from "./day-bands";
import { formatDateTime, pullRequestNumber } from "./format";
import { MemberLogin } from "./MemberLogin";
import styles from "./PullRequestList.module.css";

/**
 * The pull requests, newest first, as they are given. The rows of each day
 * share a background, alternating from one day to the next, so that the
 * days stand apart. The table fits the width it is given: its title,
 * repository and author wrap, and on a narrow screen each pull request is
 * a block of lines rather than a row of columns. An author among `members`
 * is shown with their avatar, as in the summary table; any other author by
 * the login alone.
 *
 * The table's elements name their roles, as the narrow layout displays
 * them as blocks and flex rows, which some browsers take to mean they are
 * no longer a table.
 */
export function PullRequestList(props: {
  readonly pullRequests: readonly PullRequest[];
  readonly period: Period;
  readonly members: readonly Member[];
}) {
  const { pullRequests, period, members } = props;
  const avatars = new Map(
    members.map(({ login, avatarUrl }) => [login, avatarUrl]),
  );
  const rows = pullRequests.map((pr) => ({
    pr,
    time: latestEventIn(pr, period),
  }));
  const bands = dayBands(rows.map((row) => row.time));
  return (
    <div className={styles.scroll}>
      <table
        role="table"
        aria-label="Pull requests"
        className={`${tableStyles.table} ${styles.table}`}
      >
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">
              Title
            </th>
            <th scope="col" role="columnheader">
              Repository
            </th>
            <th scope="col" role="columnheader">
              Author
            </th>
            <th scope="col" role="columnheader">
              State
            </th>
            <th scope="col" role="columnheader">
              Lines
            </th>
            <th scope="col" role="columnheader">
              Date
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map(({ pr, time }, index) => (
            <tr
              key={pr.id}
              role="row"
              data-band={bands[index]}
              className={bands[index] === 1 ? styles.tinted : undefined}
            >
              <td role="cell" className={styles.title}>
                <a href={pr.url} target="_blank" rel="noreferrer">
                  {pr.title}
                </a>
              </td>
              <td
                role="cell"
                className={`${styles.repository} ${styles.muted}`}
              >
                {pr.repository}
                <PullRequestNumber url={pr.url} />
              </td>
              <td role="cell" className={styles.author}>
                <MemberLogin
                  login={pr.author}
                  avatarUrl={avatars.get(pr.author)}
                />
              </td>
              <td role="cell" className={styles.state}>
                <span className={`${styles.badge} ${styles[pr.state]}`}>
                  {pr.state}
                </span>
              </td>
              <td role="cell" className={`${styles.lines} ${styles.numeric}`}>
                <span className={tableStyles.additions}>+{pr.additions}</span>{" "}
                <span className={tableStyles.deletions}>−{pr.deletions}</span>
              </td>
              <td
                role="cell"
                className={`${styles.date} ${styles.numeric} ${styles.muted}`}
              >
                <time dateTime={time.toISOString()}>
                  {formatDateTime(time)}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The pull request's number, as GitHub writes it ("#123"), on a line of its
 * own under the repository's name, so that the two read as the pull
 * request's address.
 */
function PullRequestNumber(props: { readonly url: string }) {
  const number = pullRequestNumber(props.url);
  return number === null ? null : (
    <span className={styles.number}>{number}</span>
  );
}
