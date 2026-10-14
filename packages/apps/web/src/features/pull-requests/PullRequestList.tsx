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
 * days stand apart. An author among `members` is shown with their avatar,
 * as in the summary table; any other author by the login alone.
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
        aria-label="Pull requests"
        className={`${tableStyles.table} ${styles.table}`}
      >
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Repository</th>
            <th scope="col">Author</th>
            <th scope="col">State</th>
            <th scope="col">Lines</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ pr, time }, index) => (
            <tr
              key={pr.id}
              data-band={bands[index]}
              className={bands[index] === 1 ? styles.tinted : undefined}
            >
              <td className={styles.title}>
                <PullRequestNumber url={pr.url} />
                <a href={pr.url} target="_blank" rel="noreferrer">
                  {pr.title}
                </a>
              </td>
              <td className={styles.muted}>{pr.repository}</td>
              <td>
                <MemberLogin
                  login={pr.author}
                  avatarUrl={avatars.get(pr.author)}
                />
              </td>
              <td>
                <span className={`${styles.badge} ${styles[pr.state]}`}>
                  {pr.state}
                </span>
              </td>
              <td className={styles.numeric}>
                <span className={tableStyles.additions}>+{pr.additions}</span>{" "}
                <span className={tableStyles.deletions}>−{pr.deletions}</span>
              </td>
              <td className={`${styles.numeric} ${styles.muted}`}>
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
 * The pull request's number before its title, quietly, as GitHub writes it
 * ("#123"). It stays outside the title's link, so that the link names the
 * pull request by its title alone.
 */
function PullRequestNumber(props: { readonly url: string }) {
  const number = pullRequestNumber(props.url);
  return number === null ? null : (
    <>
      <span className={styles.number}>{number}</span>{" "}
    </>
  );
}
