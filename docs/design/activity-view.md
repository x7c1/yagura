# Activity view

The activity view is what a signed-in user sees: the pull requests
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

Two pages, one per question the view answers:

- **Activity**, at `/`, answers what happened on which day. It has a
  **chart** of the opened and merged counts per day, and below it a **list
  of pull requests**, newest first: title, repository, author, state,
  additions, deletions, a link to the pull request on GitHub, and a
  **Date** column. It is the page that opens first, after sign-in too.
- **Members**, at `/members`, answers who has been quiet. It has a
  **summary table**, under the heading "Per member", with a row per member:
  opened, merged, additions, deletions.

Both pages show the organization (with its selector when there are
several), the period, and the "Updating…" note or an update's failure
(below).

While signed in, the header shows a tab per page beside the name, the
current one marked, and the document title names the page ("Members ·
yagura"), so that the browser's tabs and history tell the pages apart. The
tabs are links to the pages' addresses, so that a page can be opened in a
new tab, copied or bookmarked; a plain click switches the page without
loading it, adding a history entry, and the browser's back and forward
buttons switch between the pages too. Any other address (but the sign-in
callback's) shows Activity, and the address is replaced with `/` without
adding a history entry. While signed out, no tabs are shown, and `/members`
shows the same signed-out page as `/`.

Both pages are drawn from one load of the members' pull requests, so that
switching between them fetches nothing again and shows the same data at
once. The bar chosen in the chart (below) is not kept when leaving
Activity.

The chart has a group for every day of the period, a day with nothing
included, so that a quiet day shows as a gap rather than going missing. A
pull request counts on the day it was opened for "opened" and on the day it
was merged for "merged", which may be two different days.

Each day has an opened bar (solid) and a merged bar (hatched), and each bar
has its count written past its end, so that a count is read rather than
estimated from the axis. A zero is not written, its empty bar shows it. A
bar's accessible name carries its count too, a zero included ("Oct 13,
opened: 7", "Oct 12, merged: 0").

The chart fills the width of the page and is drawn at that width, its text
at the small type size whatever the width, never scaled down. Where each day
has room for its two bars side by side with their counts above, and a
digit's width of space from the next day so that their counts do not run
together, the days are columns, oldest left, with the counts on a vertical
axis and the dates below, every other date when they do not all fit.
Narrower than that, which depends on the largest count's digits, not on the
device, the days are rows, oldest at the top, with the date left of the two
bars, opened above merged, growing right on an axis below. Either way, all
the bars share one axis that starts at zero, so that their lengths compare
across days.

Choosing a day's "opened" or "merged" in the chart narrows the list to that
day's pull requests of that kind; a day and kind with none cannot be chosen.
A click on a bar's count chooses the bar too, since a bar for a small count
can be too short to hit.
The narrowing applies to the list only: the summary table on Members keeps
covering the whole period. Above the narrowed list, the view says what it is
narrowed to ("Merged on Oct 3") with a way to show all again; choosing the
same bar again clears it too.

The list's Date is when the pull request's latest event in the period
happened: when it was merged if it was merged in the period, otherwise
when it was opened. It is shown with its time, in the viewer's time zone
and 24-hour form ("Oct 13 14:05"), on one line. The rows of each day share
a background, alternating from one day to the next, the newest day's on
the page background, so that where one day ends and the next begins shows
without comparing dates. The days are counted in the viewer's time zone,
as in the chart. The bands follow the dates shown, in a list narrowed by
the chart too: narrowed to the pull requests opened on a day, one merged
on a later day shows that later date, on that day's band.

The summary table and the list cover the same period, shown above each,
and the table adds up to the list when it is not narrowed. A pull
request opened and merged in the period counts toward both the member's
opened and merged, but its lines are summed once. Members with no pull
requests in the period are listed with zeros: a member with nothing in two
weeks is what the view is there to show. Rows are in login order, not ranked
by any measure, and a totals row closes the table.

Review counts and review latency are not shown.

## Fetching

Pull requests are found with GitHub's GraphQL `search`, one search per
member and measure, with `author:<login>` and a date range (`created:` for
opened, `merged:` for merged). A search can page through at most 1,000
results; one member's 14 days stays well within that. A search asks only
for what places a pull request on a day: its node id, state, creation and
merge times. GitHub computes `additions` and `deletions` per pull request,
so a search asking for them takes seconds, also for pull requests the cache
already holds.

The range is written with the local offset, so that days start at local
midnight. It starts at the earliest day the browser cache (below) cannot
answer, the period's first day when nothing is stored. When today needs
searching as well, which is the usual case, the range runs on to now
(`created:>=<start>`), so that one search covers the past days and today;
when today is still fresh in the cache, it ends at the last second before
today (`created:<start>..<end>`). Either way there are at most two
searches per member, and none for a member the cache answers entirely.

The rest of a pull request (title, repository, author, lines) is fetched by
node id, with GraphQL `nodes(ids: [...])` lookups of up to 100 ids each. As
soon as a search answers, one lookup fetches the pull requests it found that
the cache lacks: those not stored, and those stored but not merged, unless
they were stored within the last 10 minutes and the search reports the same
state. A stored merged pull request is final and is not fetched again.

The pull requests the cache holds that are not merged, once their 10
minutes have passed, are fetched again by node id rather than searched.
Which they are is known from the cache alone, so their lookup is sent
together with the searches, without waiting for them.

Within one load, each id is looked up at most once: one that a search finds
while the refresh above already covers it is not looked up again, and where
the search and the lookup disagree on its state or merge, the lookup's
answer is taken. An id that comes back `null` (the pull request was
deleted, or the user can no longer see it) is dropped. At most four
requests, searches and lookups together, run at once, lookups first.

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

Looking up a couple of hundred pull requests by id takes a few seconds,
because `additions` and `deletions` are computed per pull request; the
browser cache is what keeps later visits fast.

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
| The installations (the user's organizations)  | Changes                                   | Short-lived                                              |

Short-lived entries are used for 10 minutes after they were stored, so a
reload within 10 minutes requests neither the installations, nor the member
list, nor any pull requests. Lasting entries expire 7 days after they were
stored. Without an expiry, a pull request in a private repository the user
can no longer see would stay on screen; checking its visibility on every
display would defeat the purpose of the cache, so the expiry bounds how long
that can last instead.

A past day counts as fetched only when its results were fetched after the
day had ended: the results of a day fetched while it was still today are
searched again once it is over. A day with no pull requests is stored too,
so that it counts as fetched. An unmerged pull request found to be merged
becomes lasting.

When one request fails, no further request is sent, and what the others
fetched before it is stored all the same, so that retrying after the
failure searches only what is still missing. A day is stored only together
with the pull requests it lists: when a search succeeds but the lookup of
what it found fails, its days are not stored and are searched again.

Entries that fall out of the 14-day period are removed without waiting for
their expiry, when the view loads.

The cache is kept per signed-in login, so that two users of the same browser
never see each other's results, and it is cleared on sign-out. The
organization the viewer last selected is kept in the cache too, under its own
key, and is selected again on the next load while the installations (stored
or fetched) still list it; otherwise the first one is.

The cache only saves requests. When IndexedDB is unavailable or fails
(private browsing, blocked storage, a full quota), the view fetches
everything as if nothing were stored, and the failure is not shown.

### Drawing from the cache first

The view draws what the cache holds at once and brings it up to date behind
it, so that a reload waits on none of the view's requests before showing the
members' pull requests.

It does not wait for the session either. The browser remembers the login of
the last viewer who signed in (outside the cache, and forgotten on sign-out
or when the session has ended). On a page load, that viewer's cache is drawn
while the session is restored behind it (see the session API's design). Until
the session is confirmed as that login, nothing is written to the cache and
the view's requests wait for the access token. When it is confirmed as
another login, the view is drawn again from that login's cache; nothing is
drawn from the cache of a viewer who is not the last one until the session
is confirmed as theirs. Without a remembered viewer, nothing is drawn until
the session is restored.

What is drawn, and when:

- A stored installation or member list is drawn at once, also past its
  short life; it is then fetched again, and drawn again if the fetched list
  differs. Without a stored list, the view says it is loading until the
  list arrives.
- The members' stored pull requests in the period are drawn at once, as
  they are: the summary table, the chart and the list, even when some days
  are not fetched yet. The fetch described in "Fetching" then runs as
  usual, and its result replaces what was drawn. While it runs, an
  "Updating…" note sits beside the period, in room kept for it so that its
  coming and going moves nothing. When the cache answers everything, nothing
  is fetched and no note shows.
- When nothing is stored for the members, the summary table lists them at
  once with placeholders for the numbers, and the chart and the list say
  they are loading.

When a fetch fails behind what is drawn, what is drawn stays, and the
failure with a way to retry takes the place of the "Updating…" note (or, for
the installations and the members, shows above them). Retrying fetches
again without clearing the screen. When nothing is drawn yet, the failure
shows in place of the list, or, for the pull requests, below the table's
placeholders.

What is shown once the fetches have answered is the same as without the
cache; the cache changes when things are drawn, not what is drawn.
