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
 * table, marked "bot" beside it when it is a bot's, so that a bot is not
 * taken for a member. The avatar comes first and the mark after the login,
 * or, where the login is set at the right of its line (`avatar: "after"`),
 * the mark first and the avatar last, so that the avatars line up at the
 * line's end.
 */
export function MemberLogin(props: {
  /** The account's id, which its avatar is found by. */
  readonly id: string;
  readonly login: string;
  readonly bot?: boolean;
  /** Where the avatar goes: before the login (the default) or after it. */
  readonly avatar?: "before" | "after";
}) {
  const { id, login, bot = false, avatar: place = "before" } = props;
  const avatar = avatarUrl(id);
  const image = avatar !== undefined && (
    <img className={styles.avatar} src={avatar} alt="" />
  );
  const mark = bot && <span className={styles.bot}>bot</span>;
  return (
    <span className={styles.login}>
      {place === "before" && image}
      {place === "after" && mark}
      <span className={styles.name}>{login}</span>
      {place === "before" && mark}
      {place === "after" && image}
    </span>
  );
}
