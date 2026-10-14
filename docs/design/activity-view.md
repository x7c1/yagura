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

The organization is one that the Yagura GitHub App is installed on, among
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

- **Activity**, at `/`, answers what happened on which day, and when in
  the day. It has a **chart** of the merged counts per day, a **heatmap**
  of their hours under it in the same card, and below them a
  **list of pull requests**, newest first: title (after the pull request's number,
  "#123", read from its address), repository, author, state,
  additions, deletions, a link to the pull request on GitHub, and a
  **Date** column. The state is a badge coloured as GitHub draws it: open
  green, merged purple, closed red. It is the page that opens first, after
  sign-in too.
- **Members**, at `/members`, answers who has been quiet. It has a
  **summary table** with a row per member: opened, merged, additions,
  deletions.

The activity page's first card, the chart's, is headed "Merged PRs", which
says what the chart counts; the list's card below it has no heading, as it
is the detail of the period the chart covers. The members page's card has
no heading either: its tab names the page, and the table is all it holds.

The activity page names no period: the chart's axis shows the days. The
members page names it ("Last 14 days · Oct 1 – Oct 14"), muted, at the
left of its card's top row, as nothing else there tells what the table
covers. The "Updating…" note sits at the right of the first card's top
row: beside the "Merged PRs" heading, or across from the period. An
update's failure shows above the cards (below).

While signed in, the header shows a tab per page on the left, the current
one marked, and on the right the organization's avatar and name, the
login after a slash ("my-org / octocat"), and a quiet "more" button (a
vertical ellipsis, named "Menu") at the right end. With several
organizations, the organization's name is its selector. The
organization's name and the login link to their pages on GitHub, in the
text's colour, underlined only when pointed at or focused, and open in a
new tab so that the activity stays where it was. While the
organizations load, or when the app is installed on none, the login
stands alone. On a narrow screen the session takes a row of its own above
the tabs, the names at the left and the button at the right, and a name
too long for the room is cut short with an ellipsis; the tabs and the
session on one row would leave the names only a few characters. The
footer shows only "Powered by Yagura", the app's name out of the way:
"Yagura" links to the project, in a new tab, in the footer's muted colour without an
underline, and takes the link colour and an underline when pointed at, or
the underline and the focus ring with keyboard focus. The document title
names the page ("Members · Yagura"), so that the browser's tabs and
history tell the pages apart. The tabs are links to the pages'
addresses, so that a page can be opened in a new tab, copied or
bookmarked; a plain click switches the page without loading it, adding a
history entry, and the browser's back and forward buttons switch between
the pages too. Any other address (but the sign-in callback's) shows
Activity, and the address is replaced with `/` without adding a history
entry.

The button opens a menu under it, aligned to its right edge, that holds
what is not used on every visit: the theme choice (below), then, after a
separator, "Sign out". It follows the WAI-ARIA menu button pattern: Enter,
Space or a click opens it and moves focus to its first item, the arrow
keys move between the items, Escape closes it and returns focus to the
button, and Tab or a click outside closes it. Choosing a theme applies it
and keeps the menu open, so that the viewer sees the result; choosing
"Sign out" closes it and signs out. The sign-in screen replaces the page at
once, in this tab and, within a moment, in every other tab of the browser,
without waiting for the server to end the session; sessions on other
devices are left as they are (see the session API's design).

Signed out, there is no page frame: no header, tabs or footer. The screen
is for signing in alone, one panel in the middle of the viewport with the
app's name as the page's heading, the README's first line saying what the
app is, the "Sign in with GitHub" button, and under it a short note on
what signing in gives the app (it only reads what the visitor can already
see on GitHub, in their browser, and the server stores nothing). A failed
sign-in's message, or a note that signing out could not reach the server
to end the session (so the next visit may sign the viewer in again, and
reloading and signing out again retries), shows in the panel above the
button, marked as a failure in words as well as colour. Every address,
`/members` too, shows this same screen. While the session is being
restored without a remembered last viewer, and while the sign-in callback
completes, the same panel shows "Loading…" or "Signing in…" in the
button's place, above the same note, so that the screen does not jump
between these states and the button never flashes before a restored
session replaces it.

The page follows the operating system's light or dark colour scheme
unless the viewer chooses otherwise. The choice is made in the header's
menu, under a small "Theme" label: System, Light and Dark, the current one
marked with a check. The sign-in screen offers no choice, as a visitor has
no reason to make one before signing in, but a stored choice applies
there too. System is the default. Light or Dark is set on the root
element as `data-theme`, which the style sheet's colours and
`color-scheme` follow, so that native controls and scrollbars match, and
is kept in `localStorage` under its own key, `yagura.theme`; choosing
System removes both. It is the browser's preference, not the viewer's, so
signing out keeps it. A small script in `index.html` applies the stored
choice before the first paint, so that a page set to Dark on a light
system does not flash light while the app loads.

Both pages are drawn from one load of the members' pull requests, so that
switching between them fetches nothing again and shows the same data at
once. The bar or hour chosen in the chart (below) is not kept when leaving
Activity.

The chart counts merged pull requests only: what the view shows is how
often changes landed, and a merge is that. Opened pull requests are not
drawn in it, though the list below still shows every pull request opened
or merged in the period, and the members page still counts both. The chart
has a bar for every day of the period, a day with nothing included, so
that a quiet day shows as a gap rather than going missing. A pull request
counts on the local day it was merged.

Each bar is solid, in a blue of the chart's own, apart from the colours of
the list's state badges, and has its count written past its end, so that a
count is read rather than estimated from the axis. A zero is not written, its
empty bar shows it. A bar's accessible name carries its count too, a zero
included ("Oct 13, merged: 7", "Oct 12, merged: 0"), and the bars as a
whole are named "Merged pull requests per day".

The chart fills the width of the page and is drawn at that width, its text
at the small type size whatever the width, never scaled down. Where each day
has room for its bar with its count above, a digit's width of space from the
next day so that their counts do not run together, and room for a date
under at least every other day, the days are columns, oldest left, with the
counts on a vertical axis and the dates below, every other date when they do
not all fit. Narrower than that, which depends on the largest count's
digits, not on the device (about 22rem for counts of one digit, 31rem for
two), the days are rows, oldest at the top, with the date left of the bar,
growing right on an axis below. Either way, all the bars share one axis
that starts at zero, so that their lengths compare across days.

Under the bars, in the same card, the heatmap shows when in the day the
merges happened: whether the work went on from morning to evening, or
bunched into a few hours. It counts the pull requests already loaded, each
in the local hour of the same time that places it on its day, so that a
day's hours add up to its bar. Where the days are columns, each day has a
column of 24 cells under its bar and as wide as it, one per hour from 0 at
the top to 23; the hours 0, 6, 12 and 18 are labelled at the left, where
the bars' axis is. The dates under the columns head both the bars above
and the heatmap below, so they sit midway between the two: 7px from the
bars' axis down to the dates' capitals and figures, and 7px from them down
to the heatmap's first row. Where the days are rows, the heatmap turns too: a thin
row per day, labelled with its date, and 24 hour columns across, labelled
0, 6, 12 and 18 above. The bars' plot is 120px tall, short enough to leave
the heatmap room on a laptop's screen.

An empty hour is drawn plainly, in the subtle border colour, apart from the
card's background but quiet. An hour with something takes the chart's blue
in four strengths, scaled to the busiest hour of the period, which takes
the strongest: each step covers a quarter of the busiest count, so that up
to a quarter of it takes the weakest step and over three quarters the
strongest. The weakest step has 3:1 contrast against the card in both
themes, as the chart's other marks do, and the light theme strengthens
toward dark, the dark theme toward light. Under both the bars and the
heatmap, a small key gives the strengths ("Per hour: 1", the steps, and the
busiest count). No legend names what is counted, as the card's heading says
it; the accessible names of the bars and the heatmap spell it out.

The heatmap is one tab stop, a grid that the arrow keys move through as it
is drawn (Home and End to the ends of a line), with Enter or Space choosing
the cell with focus; focus enters on the cell last moved to, else the chosen
one, else the first hour with something. Each cell is named with its day,
hour and count ("Oct 13, 14:00 to 15:00: 2 merged"), and the heatmap as a
whole "Merged pull requests per hour of each day".

Choosing a day's bar narrows the list to the pull requests merged on that
day; a day with none cannot be chosen. A click on a bar's count chooses the
bar too, since a bar for a small count can be too short to hit. Choosing a
cell of the heatmap narrows the list the same way, to the pull requests
merged on that day within that hour, and an empty cell cannot be chosen
either. Choosing a bar or a cell replaces any earlier choice, and the
chosen one is outlined in the text colour, not marked by colour alone. The
narrowing applies to the list only: the summary table on Members keeps
covering the whole period. Above the narrowed list, the view says what it
is narrowed to ("Merged on Oct 3", or "Merged on Oct 13, 14:00–15:00" for
an hour) with a way to show all again; choosing the same bar or cell again
clears it too.

The list's Date is when the pull request's latest event in the period
happened: when it was merged if it was merged in the period, otherwise
when it was opened. It is shown with its time, in the viewer's time zone
and 24-hour form ("2026-10-13 14:05"), on one line, every part padded so
that the column lines up. The rows of each day share
a background, alternating from one day to the next, the newest day's on
the page background, so that where one day ends and the next begins shows
without comparing dates. The days are counted in the viewer's time zone,
as in the chart. The bands follow the dates shown, in a list narrowed by
the chart too.

The activity page fits the window when the window is tall and wide
enough: the header, the chart's card with the heatmap, the list's card and
the footer are
always in view, and only the list scrolls, inside its card. The page takes
exactly the window's height (`100dvh`, after a `100vh` fallback, so that a
mobile browser's bars do not cut the footer off). The chart's card keeps
its natural height and the list's card takes the rest, with the
narrowing's "Show all" line, when the list is narrowed, at its top. The
list's column headings stay at the top of its scrolling area, on the
card's background, while the rows scroll under them; the same area
scrolls sideways when the table is wider than the card. Where the
platform draws classic scroll bars, the area's bars are thin and show only
while the pointer is over the list or focus is inside it, in room kept
for them at rest so that nothing moves. A new narrowing,
or clearing it, shows the list from its top. While the list loads, fails
or has nothing, its card holds only a note and keeps its natural height.

The fitting applies from 51rem (816px) of height and 50rem (800px) of
width, with a CSS media query. At the widths where the chart's days are
columns, everything but the list's rows takes about 40rem, the bars and the
heatmap together making the chart's card about 25rem tall. Measured on the
page, 51rem leaves the list room for its column headings and five whole
one-line rows, where 50rem would leave only four. Narrower
than the chart's columns need (about 31rem with counts of two digits), the
chart's days are rows, and the chart alone takes most of a window's height;
50rem keeps the fitting to widths where the days are columns with room to
spare. In a shorter or narrower
window, a phone's included, the page scrolls as a whole, as it does on
Members, which never fits the window.

The summary table and the list cover the same period, and the table adds
up to the list when it is not narrowed. A pull request opened and merged
in the period counts toward both the member's opened and merged, but its
lines are summed once. Members with no pull requests in the period are
listed with zeros: a member with nothing in two weeks is what the view is
there to show. Rows are in login order, not ranked by any measure, and a
totals row closes the table.

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
never see each other's results, and the viewer's entries are deleted on
sign-out. A sign-out in any tab of the browser also stops every tab from
storing anything more for the viewer, so that a load still in flight in
another tab cannot write the entries again once they are deleted. The
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
  "Updating…" note sits in the first card's top row, in room kept for it
  so that its coming and going moves nothing. When the cache answers
  everything, nothing is fetched and no note shows.
- When nothing is stored for the members, the summary table lists them at
  once with placeholders for the numbers, and the chart and the list say
  they are loading.

When a fetch fails behind what is drawn, what is drawn stays, and the
failure with a way to retry shows above the cards, as it does for the
installations and the members. Retrying fetches again without clearing the
screen. When nothing is drawn yet, the failure shows in place of the list,
or, for the pull requests, below the table's placeholders.

What is shown once the fetches have answered is the same as without the
cache; the cache changes when things are drawn, not what is drawn.
