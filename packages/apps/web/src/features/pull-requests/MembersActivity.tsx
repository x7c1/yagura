import {
  countedEvents,
  isPerson,
  listPullRequests,
  periodEndingAt,
  requestRange,
  summarizeByMember,
  type OrganizationActivity,
  type Period,
} from "@yagura/activity";
import {
  encodeOrganizationActivity,
  parseOrganizationActivity,
  type Organization,
} from "@yagura/activity-api";
import { useMemo } from "react";
import {
  Failure,
  sectionStyles,
  storedThenFetched,
  useStoredThenFetched,
  type StoredThenFetchedSource,
} from "../../shared";
import { useLiveUpdates } from "../live-updates";
import type { Page } from "../pages";
import { useSession, type SessionController } from "../session";
import { DailyActivity } from "./DailyActivity";
import { formatPeriod } from "./format";
import styles from "./MembersActivity.module.css";
import { MemberSummaryTable } from "./MemberSummaryTable";
import { SectionHeading, UpdatingNote } from "./SectionHeading";

/** The organization's activity, and the period it is drawn for. */
interface PeriodActivity {
  readonly period: Period;
  readonly activity: OrganizationActivity;
}

/**
 * Where the organization's activity comes from: the last response stored
 * for it in the browser cache, drawn for the period ending now, then the
 * activity API, asked for the period ending now.
 */
function activitySource(
  controller: SessionController,
  organization: string,
): StoredThenFetchedSource<PeriodActivity> {
  const response = (period: Period) =>
    storedThenFetched({
      cache: () => controller.viewerCache(),
      key: `organization-activity/${organization}`,
      codec: {
        encode: encodeOrganizationActivity,
        decode: parseOrganizationActivity,
      },
      now: () => controller.now(),
      fetch: () =>
        controller.withAccessToken((token) =>
          controller.activityApi.getActivity(token, {
            organization,
            ...requestRange(period),
          }),
        ),
    });
  return {
    stored: async () => {
      const period = periodEndingAt(controller.now());
      const activity = await response(period).stored();
      return activity && { period, activity };
    },
    fetch: async () => {
      const period = periodEndingAt(controller.now());
      return { period, activity: await response(period).fetch() };
    },
  };
}

/**
 * What the organization's members did lately, on `page`: a chart per day
 * and the list of pull requests (the activity), or a summary table with a
 * row per member under the period it covers (the members). Both pages are
 * drawn from one response, asked for here above them, so that switching
 * between them asks for nothing again.
 *
 * The last response stored in the browser cache is drawn at once, and the
 * API's answer replaces it behind it, with a note at the top of the first
 * card while it runs, and its failure above the cards. When nothing is
 * stored, each page says it is loading until the API answers. When the
 * server signals new activity, the API is asked again the same way.
 */
export function MembersActivity(props: {
  readonly organization: Organization;
  readonly page: Page;
}) {
  const { controller } = useSession();
  const { organization, page } = props;
  const { id, login } = organization;
  const source = useMemo(
    () => activitySource(controller, id),
    [controller, id],
  );
  const { value, updating, error, retry, refresh } =
    useStoredThenFetched(source);
  // New activity is fetched in place, as an update of what is drawn.
  useLiveUpdates(refresh);
  const derived = useMemo(() => {
    if (value === undefined) {
      return undefined;
    }
    const events = countedEvents(value.activity, value.period);
    return { events, listed: listPullRequests(value.activity, events) };
  }, [value]);

  // Behind drawn activity the fetch was an update, as the organizations
  // word it.
  const failure = error !== undefined && (
    <Failure
      subject={`the activity of ${login}'s members`}
      failure={error}
      stale={value !== undefined}
      retry={retry}
    />
  );

  if (value === undefined || derived === undefined) {
    // Nothing is drawn yet: the failure takes the place of what is loading.
    if (failure) {
      return <div className={sectionStyles.section}>{failure}</div>;
    }
    return page === "members" ? (
      <section className={sectionStyles.section}>
        <p className={sectionStyles.note}>Loading members…</p>
      </section>
    ) : (
      <>
        <section className={sectionStyles.section}>
          <SectionHeading aside={<UpdatingNote updating={false} />}>
            Merged PRs
          </SectionHeading>
          <p className={sectionStyles.note}>Loading…</p>
        </section>
        <section className={sectionStyles.section}>
          <p className={sectionStyles.note}>Loading pull requests…</p>
        </section>
      </>
    );
  }

  const { period, activity } = value;
  const { events, listed } = derived;
  return (
    <>
      {failure}
      {!activity.members.some(isPerson) ? (
        <div className={sectionStyles.section}>
          <p className={sectionStyles.note}>
            No members of {login} are visible to you.
          </p>
        </div>
      ) : page === "members" ? (
        <section className={sectionStyles.section}>
          <div className={styles.topRow}>
            <p className={styles.period}>{formatPeriod(period)}</p>
            <UpdatingNote updating={updating} />
          </div>
          <MemberSummaryTable
            summary={summarizeByMember(activity, listed, events)}
          />
        </section>
      ) : (
        <DailyActivity
          org={login}
          events={events}
          listed={listed}
          period={period}
          updating={updating}
        />
      )}
    </>
  );
}
