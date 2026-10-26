import { parseOrganizations, type Organization } from "@yagura/activity-api";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Failure,
  sectionStyles,
  storedThenFetched,
  useStoredThenFetched,
  type ResponseCodec,
  type StoredThenFetchedSource,
} from "../../shared";
import type { Page } from "../pages";
import { MembersActivity } from "../pull-requests";
import { useSession } from "../session";
import styles from "./OrganizationMembers.module.css";

/**
 * The cache key of the organization the viewer last selected, kept apart
 * from the organizations so that fetching them again keeps it.
 */
const selectedOrganizationKey = "selected-organization";

/** The cache key of the last list of the viewer's organizations. */
const organizationsKey = "organizations";

/** The viewer's organizations, and the one the viewer last selected. */
interface Organizations {
  readonly organizations: readonly Organization[];
  /** The id of the organization last selected, if one is stored. */
  readonly selected: string | undefined;
}

/** Stored as the API answers, so that it reads back as an answer does. */
const organizationsCodec: ResponseCodec<readonly Organization[]> = {
  encode: (organizations) => ({
    organizations: organizations.map(({ id, login, avatarUrl }) => ({
      id,
      login,
      avatarUrl,
    })),
  }),
  decode: parseOrganizations,
};

/**
 * The organization the viewer uses Yagura for, drawn into
 * `organizationSlot` in the header, and its members' recent activity on
 * `page`: charted per day and listed, or summarized per member. With
 * several organizations, a selector switches between them, and the one
 * selected is selected again on the next load while it is still listed.
 * What is loaded stays when `page` changes.
 */
export function OrganizationMembers(props: {
  readonly page: Page;
  readonly organizationSlot: HTMLElement | null;
}) {
  const { controller } = useSession();
  const source = useMemo((): StoredThenFetchedSource<Organizations> => {
    const list = storedThenFetched({
      cache: () => controller.viewerCache(),
      key: organizationsKey,
      codec: organizationsCodec,
      now: () => controller.now(),
      fetch: () =>
        controller.withAccessToken((token) =>
          controller.activityApi.listOrganizations(token),
        ),
    });
    const selected = async () => {
      const stored = await controller
        .viewerCache()
        .get(selectedOrganizationKey);
      return typeof stored === "string" ? stored : undefined;
    };
    return {
      stored: async () => {
        const organizations = await list.stored();
        return organizations && { organizations, selected: await selected() };
      },
      fetch: async () => ({
        organizations: await list.fetch(),
        selected: await selected(),
      }),
    };
  }, [controller]);
  const { value, error, retry } = useStoredThenFetched(source);

  if (value === undefined) {
    return (
      <div className={sectionStyles.section}>
        {error === undefined ? (
          <p className={sectionStyles.note}>Loading organizations…</p>
        ) : (
          <Failure
            subject="your organizations"
            failure={error}
            stale={false}
            retry={retry}
          />
        )}
      </div>
    );
  }
  const failure = error !== undefined && (
    <Failure subject="your organizations" failure={error} stale retry={retry} />
  );
  const { organizations, selected } = value;
  const first = organizations[0];
  if (first === undefined) {
    return (
      <>
        {failure}
        <div className={sectionStyles.section}>
          <p className={sectionStyles.note}>
            The Yagura GitHub App is not installed on any of your organizations.
          </p>
        </div>
      </>
    );
  }
  return (
    <>
      {failure}
      <OrganizationView
        organizations={organizations}
        initial={organizations.find(({ id }) => id === selected) ?? first}
        page={props.page}
        organizationSlot={props.organizationSlot}
      />
    </>
  );
}

/**
 * The selected organization, drawn into `organizationSlot` in the header,
 * and its members below. `initial` is selected until the user chooses
 * another; the choice is stored in the viewer's cache.
 */
function OrganizationView(props: {
  readonly organizations: readonly Organization[];
  readonly initial: Organization;
  readonly page: Page;
  readonly organizationSlot: HTMLElement | null;
}) {
  const { controller } = useSession();
  const { organizations, page, organizationSlot } = props;
  const [chosen, setChosen] = useState<string>();
  // Until the user chooses, and when the chosen organization is no longer
  // listed (the list fetched behind the stored one differs), the initial
  // one is shown: the one selected on an earlier load while it is listed,
  // else the first, as when the list is loaded without the cache.
  const organization =
    organizations.find(({ id }) => id === chosen) ?? props.initial;
  const { id: selected, login } = organization;

  // Drawn in the header, apart from the members, so that it stays put while
  // they load and change, and the selector keeps its focus when another
  // organization is chosen. The slash parts it from the login after it.
  const identity = (
    <span className={styles.identity}>
      <img className={styles.avatar} src={organization.avatarUrl} alt="" />
      {organizations.length > 1 ? (
        <select
          aria-label="Organization"
          className={styles.selector}
          value={selected}
          onChange={(event) => {
            const id = event.target.value;
            setChosen(id);
            void controller.viewerCache().set(selectedOrganizationKey, id);
          }}
        >
          {organizations.map(({ id, login }) => (
            <option key={id} value={id}>
              {login}
            </option>
          ))}
        </select>
      ) : (
        <a
          href={`https://github.com/${login}`}
          target="_blank"
          rel="noreferrer"
          className={styles.name}
        >
          {login}
        </a>
      )}
      <span className={styles.separator}>/</span>
    </span>
  );

  return (
    <>
      {organizationSlot && createPortal(identity, organizationSlot)}
      <MembersActivity key={selected} organization={organization} page={page} />
    </>
  );
}
