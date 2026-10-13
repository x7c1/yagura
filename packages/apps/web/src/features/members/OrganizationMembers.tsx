import type { Organization } from "@yagura/github-api";
import { useMemo, useState } from "react";
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
 * The organization the GitHub App is installed on, and its members' recent
 * pull requests on `page`: charted per day and listed, or summarized per
 * member. With several organizations, a selector switches between them, and
 * the one selected is selected again on the next load while it is still
 * listed. What is loaded stays when `page` changes.
 */
export function OrganizationMembers(props: { readonly page: Page }) {
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
    return error === undefined ? (
      <p className={sectionStyles.note}>Loading organizations…</p>
    ) : (
      <Failure
        message={`Could not load your organizations: ${error}`}
        retry={retry}
      />
    );
  }
  const failure = error !== undefined && (
    <div className={styles.failure}>
      <Failure
        message={`Could not update your organizations: ${error}`}
        retry={retry}
      />
    </div>
  );
  const { organizations, selected } = value;
  const first = organizations[0];
  if (first === undefined) {
    return (
      <>
        {failure}
        <p className={sectionStyles.note}>
          The yagura GitHub App is not installed on any of your organizations.
        </p>
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
 * The selected organization and its members. `initial` is selected until
 * the user chooses another; the choice is stored in the viewer's cache.
 */
function OrganizationView(props: {
  readonly organizations: readonly Organization[];
  readonly initial: Organization;
  readonly page: Page;
}) {
  const { controller } = useSession();
  const { organizations, page } = props;
  const [chosen, setChosen] = useState<string>();
  // Until the user chooses, and when the chosen organization is no longer
  // listed (the list fetched behind the stored one differs), the initial
  // one is shown: the one selected on an earlier load while it is listed,
  // else the first, as when the list is loaded without the cache.
  const selected =
    organizations.find(({ login }) => login === chosen)?.login ??
    props.initial.login;

  return (
    <section>
      <div className={styles.heading}>
        {organizations.length > 1 && (
          <label className={styles.selector}>
            Organization{" "}
            <select
              value={selected}
              onChange={(event) => {
                const login = event.target.value;
                setChosen(login);
                void controller
                  .viewerCache()
                  .set(selectedOrganizationKey, login);
              }}
            >
              {organizations.map(({ login }) => (
                <option key={login} value={login}>
                  {login}
                </option>
              ))}
            </select>
          </label>
        )}
        <h2 className={styles.name}>{selected}</h2>
      </div>
      <Members key={selected} org={selected} page={page} />
    </section>
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
    return error === undefined ? (
      <p className={sectionStyles.note}>Loading members…</p>
    ) : (
      <Failure
        message={`Could not load the members of ${org}: ${error}`}
        retry={retry}
      />
    );
  }
  return (
    <>
      {error !== undefined && (
        <div className={styles.failure}>
          <Failure
            message={`Could not update the members of ${org}: ${error}`}
            retry={retry}
          />
        </div>
      )}
      {value.length === 0 ? (
        <p className={sectionStyles.note}>
          No members of {org} are visible to you.
        </p>
      ) : (
        <MembersActivity org={org} members={value} page={page} />
      )}
    </>
  );
}
