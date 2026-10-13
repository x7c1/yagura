import type { ActivityCounts, ActivitySummary } from "@yagura/activity";
import type { Member } from "@yagura/github-api";
import type { CSSProperties, ReactNode } from "react";

const numeric: CSSProperties = { textAlign: "right" };

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
    <table aria-label="Members">
      <thead>
        <tr>
          <th scope="col">Member</th>
          <th scope="col" style={numeric}>
            Opened
          </th>
          <th scope="col" style={numeric}>
            Merged
          </th>
          <th scope="col" style={numeric}>
            Additions
          </th>
          <th scope="col" style={numeric}>
            Deletions
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ login, counts }) => (
          <CountsRow
            key={login}
            label={
              <>
                <img src={avatars.get(login)} alt="" width={24} height={24} />{" "}
                {login}
              </>
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
      <td style={numeric}>{counts?.opened ?? countPlaceholder}</td>
      <td style={numeric}>{counts?.merged ?? countPlaceholder}</td>
      <td style={numeric}>
        {counts === undefined ? countPlaceholder : `+${counts.additions}`}
      </td>
      <td style={numeric}>
        {counts === undefined ? countPlaceholder : `−${counts.deletions}`}
      </td>
    </tr>
  );
}
