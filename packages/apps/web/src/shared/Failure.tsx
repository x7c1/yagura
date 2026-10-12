/** A failed request's message and a button that retries it. */
export function Failure(props: {
  readonly message: string;
  readonly retry: () => void;
}) {
  return (
    <div>
      <p role="alert">{props.message}</p>
      <button type="button" onClick={props.retry}>
        Retry
      </button>
    </div>
  );
}
