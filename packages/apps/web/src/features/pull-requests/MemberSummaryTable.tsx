import type { ActivityCounts, ActivitySummary } from "@yagura/activity";
import type { Member } from "@yagura/github-api";
import type { ReactNode } from "react";
import { tableStyles } from "../../shared";
import styles from "./MemberSummaryTable.module.css";

/**
 * The summary table: a row per member in the order of `summary`, with the
 * member's avatar from `members`, and a totals row closing it. Without a
 * `summary` (the pull requests are still loading), a row per member in the
 * order of `members`, with placeholders for the numbers.
 */
export function MemberSummaryTable(props: {
  readonly members: readonly Member[];
  readonly summary?: ActivitySummary;
}) {
  const { members, summary } = props;
  const avatars = new Map(
    members.map(({ login, avatarUrl }) => [login, avatarUrl]),
  );
  const rows: readonly { login: string; counts?: ActivityCounts }[] =
    summary === undefined
      ? members.map(({ login }) => ({ login }))
      : summary.members.map((row) => ({ login: row.login, counts: row }));
  return (
    <table aria-label="Members" className={styles.table}>
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
            Additions
          </th>
          <th scope="col" className={styles.numeric}>
            Deletions
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ login, counts }) => (
          <CountsRow
            key={login}
            label={
              <span className={styles.member}>
                <img
                  className={styles.avatar}
                  src={avatars.get(login)}
                  alt=""
                  width={24}
                  height={24}
                />{" "}
                {login}
              </span>
            }
            counts={counts}
          />
        ))}
      </tbody>
      <tfoot>
        <CountsRow label="Total" counts={summary?.total} />
      </tfoot>
    </table>
  );
}

/** What a number cell shows while the pull requests load. */
const countPlaceholder = "…";

/** A row of counts, or of placeholders when `counts` is not known yet. */
function CountsRow(props: {
  readonly label: ReactNode;
  readonly counts: ActivityCounts | undefined;
}) {
  const { label, counts } = props;
  return (
    <tr>
      <th scope="row">{label}</th>
      <NumberCell value={counts?.opened} />
      <NumberCell value={counts?.merged} />
      <NumberCell
        value={counts && `+${counts.additions}`}
        tone={tableStyles.additions}
      />
      <NumberCell
        value={counts && `−${counts.deletions}`}
        tone={tableStyles.deletions}
      />
    </tr>
  );
}

/**
 * A number in tabular figures, coloured by `tone` if given, or the
 * placeholder when `value` is not known yet.
 */
function NumberCell(props: {
  readonly value: ReactNode | undefined;
  readonly tone?: string;
}) {
  const { value, tone } = props;
  const classes = [
    styles.numeric,
    value === undefined ? styles.placeholder : tone,
  ].filter(Boolean);
  return <td className={classes.join(" ")}>{value ?? countPlaceholder}</td>;
}
