import type { ActivityCounts, ActivitySummary } from "@yagura/activity";
import type { Member } from "@yagura/github-api";
import type { CSSProperties, ReactNode } from "react";

const numeric: CSSProperties = { textAlign: "right" };

/**
 * The summary table: a row per member in the order of `summary`, with the
 * member's avatar from `members`, and a totals row closing it.
 */
export function MemberSummaryTable(props: {
  readonly members: readonly Member[];
  readonly summary: ActivitySummary;
}) {
  const { members, summary } = props;
  const avatars = new Map(
    members.map(({ login, avatarUrl }) => [login, avatarUrl]),
  );
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
        {summary.members.map((row) => (
          <CountsRow
            key={row.login}
            label={
              <>
                <img
                  src={avatars.get(row.login)}
                  alt=""
                  width={24}
                  height={24}
                />{" "}
                {row.login}
              </>
            }
            counts={row}
          />
        ))}
      </tbody>
      <tfoot>
        <CountsRow label="Total" counts={summary.total} />
      </tfoot>
    </table>
  );
}

function CountsRow(props: {
  readonly label: ReactNode;
  readonly counts: ActivityCounts;
}) {
  const { label, counts } = props;
  return (
    <tr>
      <th scope="row">{label}</th>
      <td style={numeric}>{counts.opened}</td>
      <td style={numeric}>{counts.merged}</td>
      <td style={numeric}>+{counts.additions}</td>
      <td style={numeric}>−{counts.deletions}</td>
    </tr>
  );
}
