import { pullRequestUrl, type ListedPullRequest } from "@yagura/activity";
import { tableStyles } from "../../shared";
import { dayBands } from "./day-bands";
import { eventWords, formatDateTime } from "./format";
import { MemberLogin } from "./MemberLogin";
import styles from "./PullRequestList.module.css";

/**
 * The pull requests, newest first, as they are given. The rows of each day
 * share a background, alternating from one day to the next, so that the
 * days stand apart. The table fits the width it is given: its title,
 * repository and author wrap, and on a narrow screen each pull request is
 * a block of lines rather than a row of columns. The author is shown with
 * their avatar, as in the summary table; a bot's pull request names the
 * bot alone as its author, marked as a bot.
 *
 * The table's elements name their roles, as the narrow layout displays
 * them as blocks and flex rows, which some browsers take to mean they are
 * no longer a table.
 */
export function PullRequestList(props: {
  readonly pullRequests: readonly ListedPullRequest[];
}) {
  const { pullRequests } = props;
  const bands = dayBands(pullRequests.map(({ latest }) => latest.at));
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
              Pushes
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
          {pullRequests.map((row, index) => {
            const { pullRequest: pr, author, state, latest, pushes } = row;
            return (
              <tr
                key={pr.id}
                role="row"
                data-band={bands[index]}
                className={bands[index] === 1 ? styles.tinted : undefined}
              >
                <td role="cell" className={styles.title}>
                  <a href={pullRequestUrl(pr)} target="_blank" rel="noreferrer">
                    {pr.title}
                  </a>
                </td>
                <td
                  role="cell"
                  className={`${styles.repository} ${styles.muted}`}
                >
                  {pr.repository.ownerLogin}/{pr.repository.name}
                  <span className={styles.number}>#{pr.number}</span>
                </td>
                <td role="cell" className={styles.author}>
                  {author === undefined ? (
                    <span className={styles.muted}>unknown</span>
                  ) : (
                    <MemberLogin
                      id={author.id}
                      login={author.login}
                      bot={row.byBot}
                    />
                  )}
                </td>
                <td role="cell" className={styles.state}>
                  <span className={`${styles.badge} ${styles[state]}`}>
                    {state}
                  </span>
                </td>
                <td
                  role="cell"
                  className={`${styles.pushes} ${styles.numeric}`}
                >
                  {pushes}
                  {/* Where the column headings are not drawn. */}
                  <span className={styles.unit}>
                    {pushes === 1 ? " push" : " pushes"}
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
                  {eventWords[latest.kind]}{" "}
                  <time dateTime={latest.at.toISOString()}>
                    {formatDateTime(latest.at)}
                  </time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
