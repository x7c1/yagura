# Activity view

The activity view is the page a signed-in user lands on: the pull requests
that the members of an organization opened and merged over the last 14
days. Members use it to see that development is moving and to notice when it
stalls. It does not try to show imbalance between repositories or between
members; the numbers are there to show movement, not to rank anyone.

## What is counted

### Members, not repositories

The view is organized around people. It covers pull requests whose author is
a member of the organization, in any repository: the organization's own
repositories and the members' personal ones alike. Pull requests by people
outside the organization, and by bots, are not shown.

The view never goes beyond what the signed-in user can see on GitHub. A pull
request in a repository the user cannot see is never shown, even if a member
of the organization wrote it.

### The organization

The organization is one that the yagura GitHub App is installed on, among
those the signed-in user can access: the installations returned by
`GET /user/installations` whose account type is `Organization`.

- With exactly one such organization, it is chosen without asking.
- With several, a plain selector lets the user switch between them.
- With none, the view says that the app is not installed on any of the
  user's organizations.

The members are those returned by `GET /orgs/{org}/members`. The GitHub App
needs the organization permission "Members" (read) for this: without it, the
user token is answered as an anonymous request would be, with the public
members only, and members who keep their membership private go missing
without an error.

### The period

The last 14 days, including today. Days are split in the browser's time
zone, so "today" and each day in the chart are the user's local days.

### Measures

| Measure | Definition                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Opened  | Pull requests created within the period, whatever their state now                                                                           |
| Merged  | Pull requests merged within the period, even if created before it                                                                           |
| Lines   | The additions and deletions GitHub reports for a pull request. Lockfiles and generated files are not excluded; the numbers are GitHub's own |

## The screen

One page, with:

- a **summary table** with a row per member: opened, merged, additions,
  deletions;
- a **chart** of the opened and merged counts per day;
- a **list of pull requests**: title, repository, author, state, additions,
  deletions, and a link to the pull request on GitHub.

Choosing a day's "opened" or "merged" in the chart narrows the list to that
day's pull requests of that kind.

The summary table and the list cover the same period, shown once above
them, and the table adds up to the list. A pull request opened and merged in
the period counts toward both the member's opened and merged, but its lines
are summed once. Members with no pull requests in the period are listed with
zeros: a member with nothing in two weeks is what the view is there to show.
Rows are in login order, not ranked by any measure, and a totals row closes
the table.

Review counts and review latency are not shown.

## Fetching

Pull requests are found with GitHub's GraphQL `search`, one search per
member and measure, with `author:<login>` and a date range (`created:` for
opened, `merged:` for merged). A search can page through at most 1,000
results; one member's 14 days stays well within that.

The range is written with the local offset, so that days start at local
midnight. It starts at the earliest day the browser cache (below) cannot
answer, the period's first day when nothing is stored. When today needs
searching as well, which is the usual case, the range runs on to now
(`created:>=<start>`), so that one search covers the past days and today;
when today is still fresh in the cache, it ends at the last second before
today (`created:<start>..<end>`). Either way there are at most two
searches per member, and none for a member the cache answers entirely.

Pull requests the cache holds that are not merged are fetched again by
node id rather than searched, with GraphQL `nodes(ids: [...])` lookups of
up to 100 ids each. An id that comes back `null` (the pull request was deleted,
or the user can no longer see it) is dropped.

Every request runs in the browser with the signed-in user's token and counts
against that user's rate limit. The browser cache (below) keeps the number of
requests low.

The token is a GitHub App user token. Such a token reaches only what both the
user can see and the app is installed on. Checked against a search with a
regular user token for the same member and period, the app's searches
returned exactly the same pull requests, both in the member's personal public
repositories and in private repositories of the organization, with the app
installed on the member's personal account and on the organization. Pull
requests in repositories of accounts the app is not installed on were not
covered by that check.

One member with a couple of hundred pull requests in the period takes a few
seconds per search page, because `additions` and `deletions` are computed per
pull request; the browser cache is what keeps later visits fast.

## The browser cache

Results are kept in the browser's IndexedDB so that a reload does not fetch
everything again. What cannot change is kept longer than what can:

| Data                                          | Changes?                                  | Kept as                                                  |
| --------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| A merged pull request                         | Not in practice (title edits are ignored) | Lasting, with expiry                                     |
| The set of pull requests merged on a past day | No                                        | Lasting, with expiry; a fetched day is not fetched again |
| The set of pull requests opened on a past day | No                                        | Lasting, with expiry                                     |
| An unmerged pull request                      | State and lines change                    | Short-lived; fetched again by node id                    |
| Today's pull requests                         | Grow                                      | Short-lived                                              |
| The organization's member list                | Changes                                   | Short-lived                                              |

Short-lived entries are used for 10 minutes after they were stored, so a
reload within 10 minutes requests neither the member list nor any pull
requests; the installations are not cached, being one cheap call. Lasting
entries expire 7 days after they were stored. Without an expiry, a pull
request in a private repository the user can no longer see would stay
on screen; checking its visibility on every display would defeat the purpose
of the cache, so the expiry bounds how long that can last instead.

A past day counts as fetched only when its results were fetched after the
day had ended: the results of a day fetched while it was still today are
searched again once it is over. A day with no pull requests is stored too,
so that it counts as fetched. An unmerged pull request found to be merged
becomes lasting.

When one request fails, what the others fetched before it is stored all the
same, so that retrying after the failure searches only what is still missing.

Entries that fall out of the 14-day period are removed without waiting for
their expiry, when the view loads.

The cache is kept per signed-in login, so that two users of the same browser
never see each other's results, and it is cleared on sign-out.

The cache only saves requests. When IndexedDB is unavailable or fails
(private browsing, blocked storage, a full quota), the view fetches
everything as if nothing were stored, and the failure is not shown.
