import { setupWorker } from "msw/browser";
import { ApiMock, type ApiMockOptions } from "./api-mock";

export { mockAuthorize } from "./authorize";

/**
 * Starts the Mock Service Worker in the browser with the API mock's
 * handlers. Requests the mock does not handle (the app's own assets) go to
 * the network.
 */
export async function startBrowserApiMock(
  options: ApiMockOptions,
): Promise<ApiMock> {
  const mock = new ApiMock(options);
  await setupWorker(...mock.handlers).start({
    onUnhandledRequest: "bypass",
  });
  return mock;
}
