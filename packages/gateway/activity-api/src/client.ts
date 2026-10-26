import { localTimestamp, type OrganizationActivity } from "@yagura/activity";
import { ActivityApiError } from "./error";
import {
  parseOrganizationActivity,
  parseOrganizations,
  parseSignalToken,
  type Organization,
  type SignalToken,
} from "./parse";

export interface ActivityApiClientOptions {
  /** Base URL of the Yagura API, without a trailing slash. */
  readonly baseUrl: string;
  /**
   * Defaults to the global `fetch`, looked up on every request so that a
   * request interceptor installed later (such as a mock) is honored.
   */
  readonly fetch?: typeof fetch;
}

/** The organization and the range of time to ask the activity of. */
export interface ActivityRequest {
  /** The organization's id. */
  readonly organization: string;
  readonly from: Date;
  /** Exclusive. */
  readonly to: Date;
}

/**
 * Typed client for the activity API (see docs/design/activity-api.md). Every
 * request carries the session's access token as a bearer token, and no
 * cookies: the API authenticates the token alone.
 */
export class ActivityApiClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: ActivityApiClientOptions) {
    this.#baseUrl = options.baseUrl;
    // Call the function unbound: the browser's fetch rejects any receiver
    // other than the global object.
    const fetchFn = options.fetch;
    this.#fetch = (input, init) => (fetchFn ?? fetch)(input, init);
  }

  /** `GET /activity/organizations`: the organizations the viewer can use. */
  async listOrganizations(accessToken: string): Promise<Organization[]> {
    return this.#get(
      accessToken,
      "/activity/organizations",
      parseOrganizations,
    );
  }

  /**
   * `GET /activity`: the activity of the organization's members from
   * `from` up to `to`, the bounds written with the local offset.
   */
  async getActivity(
    accessToken: string,
    request: ActivityRequest,
  ): Promise<OrganizationActivity> {
    const query = new URLSearchParams({
      organization: request.organization,
      from: localTimestamp(request.from),
      to: localTimestamp(request.to),
    });
    return this.#get(
      accessToken,
      `/activity?${query.toString()}`,
      parseOrganizationActivity,
    );
  }

  /**
   * `POST /activity/signal-token`: a token for connecting to the viewer's
   * channel of signals, and subscribing to it.
   */
  async createSignalToken(accessToken: string): Promise<SignalToken> {
    return this.#request(
      "POST",
      accessToken,
      "/activity/signal-token",
      parseSignalToken,
    );
  }

  async #get<T>(
    accessToken: string,
    path: string,
    parse: (body: unknown) => T | undefined,
  ): Promise<T> {
    return this.#request("GET", accessToken, path, parse);
  }

  async #request<T>(
    method: "GET" | "POST",
    accessToken: string,
    path: string,
    parse: (body: unknown) => T | undefined,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.#fetch(this.#baseUrl + path, {
        method,
        credentials: "omit",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (error) {
      throw new ActivityApiError(0, "network_error", undefined, {
        cause: error,
      });
    }
    const body = await readJson(response);
    if (!response.ok) {
      throw ActivityApiError.fromBody(response.status, body);
    }
    const parsed = parse(body);
    if (parsed === undefined) {
      throw new ActivityApiError(response.status, "unexpected_response");
    }
    return parsed;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
