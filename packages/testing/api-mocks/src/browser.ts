import { setupWorker } from "msw/browser";
import {
  ApiMock,
  mockDevelopmentOrganizations,
  type ApiMockOptions,
} from "./api-mock";

export { mockAuthorize } from "./authorize";

/**
 * Starts the Mock Service Worker in the browser with the API mock's
 * handlers. Requests the mock does not handle (the app's own assets) go to
 * the network. Unless `options` says otherwise, the app is installed on
 * {@link mockDevelopmentOrganizations}.
 */
export async function startBrowserApiMock(
  options: ApiMockOptions,
): Promise<ApiMock> {
  const mock = new ApiMock({
    organizations: mockDevelopmentOrganizations,
    ...options,
  });
  await setupWorker(...mock.handlers).start({
    onUnhandledRequest: "bypass",
  });
  return mock;
}
