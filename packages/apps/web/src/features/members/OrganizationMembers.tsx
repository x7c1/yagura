import type { Organization } from "@yagura/github-api";
import { useMemo, useState } from "react";
import {
  Failure,
  useStoredThenFetched,
  type StoredThenFetchedSource,
} from "../../shared";
import { MembersActivity } from "../pull-requests";
import { useSession, type SessionController } from "../session";
import {
  installationsList,
  loadList,
  membersList,
  readStoredList,
  type ShortLivedList,
} from "./short-lived-list";

/**
 * The organization the GitHub App is installed on, and its members' recent
 * pull requests, summarized per member and listed. With several
 * organizations, a selector switches between them.
 */
export function OrganizationMembers() {
  const { controller } = useSession();
  const source = useMemo(
    () =>
      shortLivedSource(controller, installationsList, (token) =>
        controller.githubApi.listOrganizationInstallations(token),
      ),
    [controller],
  );
  const { value, error, retry } = useStoredThenFetched(source);

  if (value === undefined) {
    return error === undefined ? (
      <p>Loading organizations…</p>
    ) : (
      <Failure
        message={`Could not load your organizations: ${error}`}
        retry={retry}
      />
    );
  }
  const failure = error !== undefined && (
    <Failure
      message={`Could not update your organizations: ${error}`}
      retry={retry}
    />
  );
  const [first] = value;
  if (first === undefined) {
    return (
      <>
        {failure}
        <p>
          The yagura GitHub App is not installed on any of your organizations.
        </p>
      </>
    );
  }
  return (
    <>
      {failure}
      <OrganizationView organizations={value} initial={first} />
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

function OrganizationView(props: {
  readonly organizations: readonly Organization[];
  readonly initial: Organization;
}) {
  const { organizations } = props;
  const [chosen, setChosen] = useState<string>();
  // Until the user chooses, and when the chosen organization is no longer
  // listed (the list fetched behind the stored one differs), the first one
  // is shown, as when the list is loaded without the cache.
  const selected =
    organizations.find(({ login }) => login === chosen)?.login ??
    props.initial.login;

  return (
    <section>
      {organizations.length > 1 && (
        <label>
          Organization{" "}
          <select
            value={selected}
            onChange={(event) => setChosen(event.target.value)}
          >
            {organizations.map(({ login }) => (
              <option key={login} value={login}>
                {login}
              </option>
            ))}
          </select>
        </label>
      )}
      <h2>{selected}</h2>
      <Members key={selected} org={selected} />
    </section>
  );
}

function Members(props: { readonly org: string }) {
  const { controller } = useSession();
  const { org } = props;
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
      <p>Loading members…</p>
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
        <Failure
          message={`Could not update the members of ${org}: ${error}`}
          retry={retry}
        />
      )}
      {value.length === 0 ? (
        <p>No members of {org} are visible to you.</p>
      ) : (
        <MembersActivity org={org} members={value} />
      )}
    </>
  );
}
