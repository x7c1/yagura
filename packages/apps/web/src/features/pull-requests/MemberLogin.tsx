import styles from "./MemberLogin.module.css";

/**
 * Where GitHub serves the avatar of the account whose numeric id is `id`,
 * or `undefined` when `id` is not such a number, as the activity API's
 * account ids are (docs/design/activity-api.md).
 */
export function avatarUrl(id: string): string | undefined {
  return /^\d+$/.test(id)
    ? `https://avatars.githubusercontent.com/u/${id}?v=4`
    : undefined;
}

/**
 * A login with the account's avatar beside it, drawn the same in every
 * table, marked "bot" after it when it is a bot's, so that a bot is not
 * taken for a member.
 */
export function MemberLogin(props: {
  /** The account's id, which its avatar is found by. */
  readonly id: string;
  readonly login: string;
  readonly bot?: boolean;
}) {
  const { id, login, bot = false } = props;
  const avatar = avatarUrl(id);
  return (
    <span className={styles.login}>
      {avatar !== undefined && (
        <img className={styles.avatar} src={avatar} alt="" />
      )}
      <span className={styles.name}>{login}</span>
      {bot && <span className={styles.bot}>bot</span>}
    </span>
  );
}
