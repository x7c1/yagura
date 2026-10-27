import type { ActivityCounts, ActivitySummary } from "@yagura/activity";
import type { ReactNode } from "react";
import { tableStyles } from "../../shared";
import { MemberLogin } from "./MemberLogin";
import styles from "./MemberSummaryTable.module.css";

/**
 * The summary table: a row per member in the order of `summary`, with the
 * member's avatar, then a row per bot, marked as one, whose pushes are not counted and show as a
 * dash, and a totals row closing it.
 */
export function MemberSummaryTable(props: {
  readonly summary: ActivitySummary;
}) {
  const { summary } = props;
  return (
    <table
      aria-label="Members"
      className={`${tableStyles.table} ${styles.table}`}
    >
      <thead>
        <tr>
          <th scope="col">Member</th>
          <th scope="col" className={styles.numeric}>
            Opened
          </th>
          <th scope="col" className={styles.numeric}>
            Merged
          </th>
          <th scope="col" className={styles.numeric}>
            Pushed
          </th>
          <th scope="col" className={styles.numeric}>
            Additions
          </th>
          <th scope="col" className={styles.numeric}>
            Deletions
          </th>
        </tr>
      </thead>
      <tbody>
        {summary.members.map(({ member, ...counts }) => (
          <CountsRow
            key={member.id}
            label={
              <MemberLogin
                id={member.id}
                login={member.login}
                bot={member.type === "Bot"}
              />
            }
            counts={counts}
          />
        ))}
      </tbody>
      <tfoot>
        <CountsRow label="Total" counts={summary.total} />
      </tfoot>
    </table>
  );
}

/** What the Pushed cell of a bot's row shows: its pushes are not counted. */
const notCounted = "—";

/** A row of counts. */
function CountsRow(props: {
  readonly label: ReactNode;
  readonly counts: ActivityCounts;
}) {
  const { label, counts } = props;
  return (
    <tr>
      <th scope="row">{label}</th>
      <NumberCell value={counts.opened} />
      <NumberCell value={counts.merged} />
      <NumberCell
        value={counts.pushed ?? notCounted}
        tone={counts.pushed === null ? styles.notCounted : undefined}
      />
      <NumberCell value={`+${counts.additions}`} tone={tableStyles.additions} />
      <NumberCell value={`−${counts.deletions}`} tone={tableStyles.deletions} />
    </tr>
  );
}

/** A number in tabular figures, coloured by `tone` if given. */
function NumberCell(props: {
  readonly value: ReactNode;
  readonly tone?: string;
}) {
  const { value, tone } = props;
  const classes = [styles.numeric, tone].filter(Boolean);
  return <td className={classes.join(" ")}>{value}</td>;
}
