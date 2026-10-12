import { useCallback, useEffect, useState } from "react";

export type RequestState<T> =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly error: string }
  | { readonly status: "done"; readonly value: T };

/**
 * Runs `load` on mount and whenever it changes (memoize it), and again on
 * `retry`. A result that arrives after `load` changed or the component
 * unmounted is dropped.
 */
export function useRequest<T>(load: () => Promise<T>): {
  readonly state: RequestState<T>;
  readonly retry: () => void;
} {
  const [state, setState] = useState<RequestState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    load().then(
      (value) => {
        if (current) {
          setState({ status: "done", value });
        }
      },
      (error: unknown) => {
        if (current) {
          setState({
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [load, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
