import type { Organization } from "@yagura/github-api";
import { useCallback, useState } from "react";
import { Failure, useRequest } from "../../shared";
import { PullRequests } from "../pull-requests";
import { useSession } from "../session";
import { loadMembers } from "./load-members";

/**
 * The organization the GitHub App is installed on, its members, and their
 * recent pull requests. With several organizations, a selector switches
 * between them.
 */
export function OrganizationMembers() {
  const { controller } = useSession();
  const load = useCallback(
    () =>
      controller.withAccessToken((token) =>
        controller.githubApi.listOrganizationInstallations(token),
      ),
    [controller],
  );
  const { state, retry } = useRequest(load);

  switch (state.status) {
    case "loading":
      return <p>Loading organizations…</p>;
    case "failed":
      return (
        <Failure
          message={`Could not load your organizations: ${state.error}`}
          retry={retry}
        />
      );
    case "done": {
      const [first] = state.value;
      if (first === undefined) {
        return (
          <p>
            The yagura GitHub App is not installed on any of your organizations.
          </p>
        );
      }
      return <OrganizationView organizations={state.value} initial={first} />;
    }
  }
}

function OrganizationView(props: {
  readonly organizations: readonly Organization[];
  readonly initial: Organization;
}) {
  const { organizations } = props;
  const [selected, setSelected] = useState(props.initial.login);

  return (
    <section>
      {organizations.length > 1 && (
        <label>
          Organization{" "}
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
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
  const load = useCallback(
    async () =>
      loadMembers(controller.viewerCache(), org, controller.now(), () =>
        controller.withAccessToken((token) =>
          controller.githubApi.listOrganizationMembers(token, org),
        ),
      ),
    [controller, org],
  );
  const { state, retry } = useRequest(load);

  switch (state.status) {
    case "loading":
      return <p>Loading members…</p>;
    case "failed":
      return (
        <Failure
          message={`Could not load the members of ${org}: ${state.error}`}
          retry={retry}
        />
      );
    case "done":
      if (state.value.length === 0) {
        return <p>No members of {org} are visible to you.</p>;
      }
      return (
        <>
          <ul aria-label="Members">
            {state.value.map((member) => (
              <li key={member.login}>
                <img src={member.avatarUrl} alt="" width={24} height={24} />{" "}
                {member.login}
              </li>
            ))}
          </ul>
          <PullRequests org={org} members={state.value} />
        </>
      );
  }
}
