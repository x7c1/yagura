/**
 * Runs a task once fewer than the limit's number of tasks are running, and
 * resolves or rejects as the task does. Waiting tasks start in the order
 * they were given, except that one given `ahead` starts before every task
 * still waiting.
 */
export type ConcurrencyLimit = <T>(
  task: () => Promise<T>,
  options?: { readonly ahead?: boolean },
) => Promise<T>;

/** A limit of `limit` tasks running at a time. */
export function concurrencyLimit(limit: number): ConcurrencyLimit {
  let running = 0;
  const waiting: (() => void)[] = [];
  const startNext = () => {
    if (running < limit) {
      const start = waiting.shift();
      if (start !== undefined) {
        running++;
        start();
      }
    }
  };
  return (task, options) =>
    new Promise((resolve, reject) => {
      const start = () => {
        void (async () => {
          try {
            resolve(await task());
          } catch (error) {
            reject(error);
          } finally {
            running--;
            startNext();
          }
        })();
      };
      if (options?.ahead) {
        waiting.unshift(start);
      } else {
        waiting.push(start);
      }
      startNext();
    });
}
