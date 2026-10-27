import { setupWorker } from "msw/browser";
import {
  ApiMock,
  mockDevelopmentOrganizations,
  mockImportingOrganization,
  type ApiMockOptions,
} from "./api-mock";

export { mockAuthorize } from "./authorize";

/**
 * Starts the Mock Service Worker in the browser with the API mock's
 * handlers. Requests the mock does not handle (the app's own assets) go to
 * the network. Unless `options` says otherwise, the app is installed on
 * {@link mockDevelopmentOrganizations}, and the server is still importing
 * {@link mockImportingOrganization}.
 */
export async function startBrowserApiMock(
  options: ApiMockOptions,
): Promise<ApiMock> {
  const mock = new ApiMock({
    organizations: mockDevelopmentOrganizations,
    importing: [mockImportingOrganization],
    ...options,
  });
  await setupWorker(...mock.handlers).start({
    onUnhandledRequest: "bypass",
  });
  return mock;
}
