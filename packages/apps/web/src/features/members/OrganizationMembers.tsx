import type { Organization } from "@yagura/github-api";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Failure,
  sectionStyles,
  useStoredThenFetched,
  type StoredThenFetchedSource,
} from "../../shared";
import type { Page } from "../pages";
import { MembersActivity } from "../pull-requests";
import { useSession, type SessionController } from "../session";
import {
  installationsList,
  loadList,
  membersList,
  readStoredList,
  type ShortLivedList,
} from "./short-lived-list";
import styles from "./OrganizationMembers.module.css";

/**
 * The cache key of the organization the viewer last selected, kept apart
 * from the installations list so that fetching the list again keeps it.
 */
const selectedOrganizationKey = "selected-organization";

/** The installations' organizations, and the one the viewer last selected. */
interface Installations {
  readonly organizations: readonly Organization[];
  /** The login of the organization last selected, if one is stored. */
  readonly selected: string | undefined;
}

/**
 * The organization the GitHub App is installed on, drawn into
 * `organizationSlot` in the header, and its members' recent pull requests
 * on `page`: charted per day and listed, or summarized per member. With
 * several organizations, a selector switches between them, and the one
 * selected is selected again on the next load while it is still listed.
 * What is loaded stays when `page` changes.
 */
export function OrganizationMembers(props: {
  readonly page: Page;
  readonly organizationSlot: HTMLElement | null;
}) {
  const { controller } = useSession();
  const source = useMemo((): StoredThenFetchedSource<Installations> => {
    const list = shortLivedSource(controller, installationsList, (token) =>
      controller.githubApi.listOrganizationInstallations(token),
    );
    const selected = async () => {
      const stored = await controller
        .viewerCache()
        .get(selectedOrganizationKey);
      return typeof stored === "string" ? stored : undefined;
    };
    return {
      stored: async () => {
        const stored = await list.stored();
        return (
          stored && {
            value: { organizations: stored.value, selected: await selected() },
            fresh: stored.fresh,
          }
        );
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
            message={`Could not load your organizations: ${error}`}
            retry={retry}
          />
        )}
      </div>
    );
  }
  const failure = error !== undefined && (
    <Failure
      message={`Could not update your organizations: ${error}`}
      retry={retry}
    />
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
        initial={organizations.find(({ login }) => login === selected) ?? first}
        page={props.page}
        organizationSlot={props.organizationSlot}
      />
    </>
  );
}

/**
 * Where a short-lived list (see `short-lived-list.ts`) comes from: drawn
 * from the browser cache at once when it is stored, and fetched with
 * `request` behind it once its short life has passed.
 */
function shortLivedSource<T>(
  controller: SessionController,
  list: ShortLivedList<T>,
  request: (token: string) => Promise<T[]>,
): StoredThenFetchedSource<T[]> {
  return {
    stored: () =>
      readStoredList(controller.viewerCache(), list, controller.now()),
    fetch: () =>
      loadList(controller.viewerCache(), list, controller.now(), () =>
        controller.withAccessToken(request),
      ),
  };
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
    organizations.find(({ login }) => login === chosen) ?? props.initial;
  const selected = organization.login;

  // Drawn in the header, apart from the members, so that it stays put while
  // they load and change, and the selector keeps its focus when another
  // organization is chosen. The slash parts it from the login after it.
  const identity = (
    <span className={styles.identity}>
      <OrganizationAvatar organization={organization} />
      {organizations.length > 1 ? (
        <select
          aria-label="Organization"
          className={styles.selector}
          value={selected}
          onChange={(event) => {
            const login = event.target.value;
            setChosen(login);
            void controller.viewerCache().set(selectedOrganizationKey, login);
          }}
        >
          {organizations.map(({ login }) => (
            <option key={login} value={login}>
              {login}
            </option>
          ))}
        </select>
      ) : (
        <a
          href={`https://github.com/${selected}`}
          target="_blank"
          rel="noreferrer"
          className={styles.name}
        >
          {selected}
        </a>
      )}
      <span className={styles.separator}>/</span>
    </span>
  );

  return (
    <>
      {organizationSlot && createPortal(identity, organizationSlot)}
      <Members key={selected} org={selected} page={page} />
    </>
  );
}

/**
 * The organization's avatar, or, when it is not known (a list stored before
 * avatars were kept), the first letter of its login in the avatar's place.
 */
function OrganizationAvatar(props: { readonly organization: Organization }) {
  const { login, avatarUrl } = props.organization;
  return avatarUrl === undefined ? (
    <span className={styles.avatar} aria-hidden="true">
      {[...login][0]?.toUpperCase()}
    </span>
  ) : (
    <img className={styles.avatar} src={avatarUrl} alt="" />
  );
}

function Members(props: { readonly org: string; readonly page: Page }) {
  const { controller } = useSession();
  const { org, page } = props;
  const source = useMemo(
    () =>
      shortLivedSource(controller, membersList(org), (token) =>
        controller.githubApi.listOrganizationMembers(token, org),
      ),
    [controller, org],
  );
  const { value, error, retry } = useStoredThenFetched(source);

  if (value === undefined) {
    return (
      <div className={sectionStyles.section}>
        {error === undefined ? (
          <p className={sectionStyles.note}>Loading members…</p>
        ) : (
          <Failure
            message={`Could not load the members of ${org}: ${error}`}
            retry={retry}
          />
        )}
      </div>
    );
  }
  return (
    <>
      {error !== undefined && (
        <Failure
          message={`Could not update the members of ${org}: ${error}`}
          retry={retry}
        />
      )}
      {value.length === 0 ? (
        <div className={sectionStyles.section}>
          <p className={sectionStyles.note}>
            No members of {org} are visible to you.
          </p>
        </div>
      ) : (
        <MembersActivity org={org} members={value} page={page} />
      )}
    </>
  );
}
