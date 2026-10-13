import styles from "./MemberLogin.module.css";

/**
 * A login, with the avatar beside it when `avatarUrl` is given, as it is
 * for a member of the organization; drawn the same in every table.
 */
export function MemberLogin(props: {
  readonly login: string;
  readonly avatarUrl: string | undefined;
}) {
  const { login, avatarUrl } = props;
  return (
    <span className={styles.login}>
      {avatarUrl !== undefined && (
        <img className={styles.avatar} src={avatarUrl} alt="" />
      )}
      {login}
    </span>
  );
}
