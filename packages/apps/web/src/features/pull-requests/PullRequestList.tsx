import { latestEventIn, type Period, type PullRequest } from "@yagura/activity";
import { tableStyles } from "../../shared";
import { dayFormat } from "./format";
import styles from "./PullRequestList.module.css";

/** The pull requests, newest first, as they are given. */
export function PullRequestList(props: {
  readonly pullRequests: readonly PullRequest[];
  readonly period: Period;
}) {
  const { pullRequests, period } = props;
  return (
    <div className={styles.scroll}>
      <table aria-label="Pull requests" className={styles.table}>
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
              <td className={styles.title}>
                <a href={pr.url} target="_blank" rel="noreferrer">
                  {pr.title}
                </a>
              </td>
              <td className={styles.muted}>{pr.repository}</td>
              <td>{pr.author}</td>
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
                {dayFormat.format(latestEventIn(pr, period))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
