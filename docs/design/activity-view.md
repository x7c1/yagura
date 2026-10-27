# Activity view

The activity view is what a signed-in user sees: how much the members of an
organization worked over the last 14 days, in the pull requests they
opened, pushed to and merged. Members use it to see that development is
moving and to notice when it stalls. Merges alone would hide days spent
iterating on a draft, so pushes count as activity too. It does not try to
show imbalance between repositories or between members; the numbers are
there to show movement, not to rank anyone.

## What is counted

### Members, not repositories

The view is organized around people. It covers pull requests that the
organization's members opened or pushed to, in any repository: the
organization's own repositories and the members' personal ones alike.
Pull requests that bots such as Dependabot opened are counted where a
merge is counted, as a merge of theirs landed a change too, but the list
hides them until the viewer asks for them (below). A bot's pushes, such
as Dependabot rebasing its own branch, are not counted anywhere, and
neither are the pushes of people outside the organization.

The view never goes beyond what the signed-in user can see on GitHub. A pull
request in a repository the user cannot see is never shown, even if a member
of the organization wrote it: the server returns to each viewer only what
that viewer can see (see the [activity API](activity-api.md#visibility)).

### The organization

The organization is one of those the viewer can use Yagura for, as
`GET /activity/organizations` lists them: those the Yagura GitHub App is
installed on, among the ones the viewer can see.

- With exactly one such organization, it is chosen without asking.
- With several, a plain selector lets the user switch between them.
- With none, the view says that the app is not installed on any of the
  user's organizations.

The members are those `GET /activity` returns with the organization's
activity: its current members, each listed even without activity in the
period, and the bots that opened one of the pull requests.

### The period

The last 14 days, including today. Days are split in the browser's time
zone, so "today" and each day in the chart are the user's local days. The
view asks for the activity from local midnight at the start of the first
day up to local midnight at the end of today.

### Measures

| Measure | Definition                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Opened  | Pull requests opened within the period, whatever their state now                                                                            |
| Merged  | Pull requests merged within the period, even if opened before it                                                                            |
| Pushed  | Pushes by members to the branch of a pull request within the period, each push once, whoever opened the pull request                        |
| Lines   | The additions and deletions GitHub reports for a pull request. Lockfiles and generated files are not excluded; the numbers are GitHub's own |

## The screen

Two pages, one per question the view answers:

- **Activity**, at `/`, answers what happened on which day, and when in the
  day. It has a **chart** of the merged counts per day, a **heatmap** of
  the hours of pushes and merges under it, and a row of **push counts**
  under that, in the same card, and below them a **list of pull
  requests**, newest first: title (with its author on a line under it,
  at the right), repository (with the pull request's number, "#123", on a
  second line under the repository's name), state, pushes, additions, deletions, a link to the pull request on
  GitHub, and a **Date** column. The state is a badge coloured as GitHub
  draws it: open green, draft grey, merged purple, closed red. It is the
  page that opens first, after sign-in too.
- **Members**, at `/members`, answers who has been quiet. It has a
  **summary table** with a row per member: opened, merged, pushed,
  additions, deletions.

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
what the app keeps and shows: the server stores the pull request activity
of the organizations that use it, and shows each visitor only what they
can already see on GitHub. A
failure shows in the panel above the button, marked as a failure in words
as well as colour: a title that says which action failed ("Could not sign
you in.", "Sign-in cancelled.", "You were signed out.", "Your sign-out may
not be complete."), then a sentence or two on what happened to the viewer
and what they can do with what the screen offers, signing in again or
reloading. A sign-in fails when the viewer cancelled on GitHub, when the
callback is stale, already used or another tab's, when the browser blocks
its storage, when the network is down, or when GitHub or the session API
fails; a restored or refreshed session is lost for the last two. A
sign-out that could not reach the server to end the session says that the
next visit may sign the viewer in again, and that reloading and signing
out again retries. The screen names no endpoint, status code or error
code; the failure itself goes to the browser's console. Every address,
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
signing out keeps it, and a choice made in another tab applies in this one
too, as soon as the browser reports the change. A small script in `index.html` applies the stored
choice before the first paint, so that a page set to Dark on a light
system does not flash light while the app loads.

Both pages are drawn from one answer of the activity API, so that
switching between them asks for nothing again and shows the same data at
once. The bar, circle or hour chosen in the chart (below) is not kept when
leaving Activity.

The chart's bars count merged pull requests, a bot's included: they show
how often changes landed, and a merge is that. Opened pull requests are not
drawn in it, though the list below still shows every pull request opened
in the period, and the members page still counts them. The chart has a bar
for every day of the period, a day with nothing included, so that a quiet
day shows as a gap rather than going missing. A pull request counts on the
local day it was merged.

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

Under the heatmap, one row, labelled "Pushes" at its left where the axis's
labels are, holds each day's number of pushes by members, right under that
day's bar and column of cells, written in the bars' blue as their counts
are; a day without pushes leaves its place empty. Each count is a button, a
circle without paint around it that shows its outline only when the count
is chosen or focused. The circles are all one size, wide enough for the
largest count, so that clicking a count is as easy whatever its digits.
Where the days are rows, each day's count sits next to its date, between
the date and the bar, and the "Pushes" label heads the counts above the
first row. Pushes and merges are drawn differently on purpose: they are
counted on different scales, and bars side by side or stacked would invite
comparing heights that mean nothing. A count's accessible name carries its
count ("Oct 13, 5 pushes"), and the counts as a whole are named "Pushes per
day".

Under the bars, in the same card, the heatmap shows when in the day the
work happened: whether it went on from morning to evening, or bunched into
a few hours. It counts the members' pushes and the merges together, each
in the local hour of the same time that places it on its day, so that a
day's hours add up to that day's merges plus its pushes. Where the days are columns, each day has a
column of 24 cells under its bar and as wide as it, one per hour from 0 at
the top to 23; the hours 0, 6, 12 and 18 are labelled at the left, where
the bars' axis is. The dates under the columns head both the bars above
and the heatmap below, so they sit midway between the two: 7px from the
bars' axis down to the dates' capitals and figures, and 7px from them down
to the heatmap's first row. Where the days are rows, the heatmap turns too: a thin
row per day, labelled with its date, and 24 hour columns across, labelled
0, 6, 12 and 18 above. Where the days are columns, each labelled hour is ruled behind the cells
with a line in the style of the bars' grid lines, through the middle of its
cells and across the bars' plot, so that the bars and the heatmap read as one
ruled figure. Where the days are rows, the hours are not ruled: the cells sit
1px apart, and the narrow grid reads well without lines. The lines are decoration only, hidden
from assistive technology, and a click passes through them. The bars' plot
is 120px tall, short enough to leave the heatmap room on a laptop's screen.

An empty hour is drawn plainly, in the subtle border colour, apart from the
card's background but quiet. An hour with something takes the chart's blue
in four strengths, scaled to the busiest hour of the period, which takes
the strongest: each step covers a quarter of the busiest count, so that up
to a quarter of it takes the weakest step and over three quarters the
strongest. The weakest step has 3:1 contrast against the card in both
themes, as the chart's other marks do, and the light theme strengthens
toward dark, the dark theme toward light. The chart draws no key: the
cells' shades show which hours were busier, and a key would list every
step, even those no cell takes. The figure's caption, read out but not drawn,
describes the strengths ("Hours shaded in 4 steps, from 1 up to the
busiest hour's 4"). No legend names what is counted, as the card's heading
says it; the accessible names of the bars and the heatmap spell it out.

The heatmap is one tab stop, a grid that the arrow keys move through as it
is drawn (Home and End to the ends of a line), with Enter or Space choosing
the cell with focus; focus enters on the cell last moved to, else the chosen
one, else the first hour with something. Each cell is named with its day,
hour and the breakdown of its count ("Oct 13, 14:00 to 15:00: 5 pushes, 1
merged"), and the heatmap as a whole "Pushes and merged pull requests per
hour of each day".

Choosing a day's bar narrows the list to the pull requests merged on that
day; a day with none cannot be chosen. A click on a bar's count chooses the
bar too, since a bar for a small count can be too short to hit. Choosing a
push count narrows the list to the pull requests a member pushed to on
that day. Choosing a cell of the heatmap narrows the list to the pull
requests merged or pushed to by a member on that day within that hour, and
an empty cell cannot be chosen. Choosing a bar, a circle or a cell
replaces any earlier choice, and the chosen one is outlined in the text
colour, not marked by colour alone. The narrowing applies to the list
only: the summary table on Members keeps covering the whole period. Above
the narrowed list, the view says what it is narrowed to ("Merged on Oct
3", "Pushed on Oct 3", or "Merged or pushed on Oct 13, 14:00–15:00" for an
hour) with a way to show all again; choosing the same bar, circle or cell
again clears it too.

The list holds one row per pull request: those opened or merged in the
period, and those a member pushed to in it. A pull request opened by a bot
is hidden by default, as it is not the members' work, though its merge
counts in the chart. A button above the list, at its right, says how many
it hides and shows them ("Show 12 bot pull requests"); once they are
shown, the same button hides them again ("Hide 12 bot pull requests").
The choice is the browser's, kept in `localStorage` under
`yagura.show-bot-pull-requests`, so that it holds on the next visit and
for any viewer of the browser, and is kept on sign-out. When the chart
narrows the list, the button counts the bots' pull requests of the
narrowed list, so that the narrowed view says how many it hides too; when
a narrowing holds only bots' pull requests, the list says so ("Only bots'
pull requests here.") above the button. There is no button when there is
nothing to hide.

The author is shown with their avatar, found by their account's id (see
the [activity API](activity-api.md#get-activity)), under the title at its
right rather than in a column of their own: a column would widen and
narrow with the longest login shown, and the table would jump when the
bots' pull requests are shown or hidden. A bot's pull request
names only the bot as its author, marked "bot": in the list, where the
author is set at the right of its line, the mark comes before the login
and the avatar after it, so that the avatars line up at the line's end. A draft that is still open shows a "draft" badge in GitHub's
grey instead of "open". The Pushes column gives the number of members'
pushes to the pull request in the period, or, while the chart narrows the
list, in the chosen day or hour; on a narrow screen, where the column
headings are not drawn, the number is followed by "push" or "pushes".

The list's Date is when the row's latest event in the period happened,
with its kind in words: its merge ("Merged 2026-10-13 14:05"), a member's
push ("Pushed 2026-10-13 14:05") or its opening ("Opened 2026-10-13
14:05"), whichever came last. While the chart narrows the list, the Date
is instead the latest event the narrowing chose the row for, within the
chosen day or hour: the merge for a bar, the day's last push by a member
for a push count, and the hour's last merge or push for a cell; the list
is ordered by these dates. The time is in the viewer's time zone and
24-hour form, on one line, every part padded so that the column lines
up. The rows of each day share
a background, alternating from one day to the next, the newest day's on
the page background, so that where one day ends and the next begins shows
without comparing dates. The days are counted in the viewer's time zone,
as in the chart. The bands follow the dates shown, in a list narrowed by
the chart too.

Neither the list nor the summary table scrolls sideways, and the page
never does: each fits its card's width. In the list, the title and the
repository wrap; the state, the pushes, the lines and the
date keep to one line. In the summary table, a login wraps, after a hyphen where it
has one, and the numbers keep to one line. Narrower than 50rem, where the
list's columns would leave the title a few words a line, each pull request
is a block instead of a row: its title with its author under it at the
right, then its repository, then its state, pushes, lines and date, the date at the right end, with the day's
band behind it; the column headings are then read out but not drawn.

The activity page fits the window when the window is tall and wide
enough: the header, the chart's card with the heatmap, the list's card and
the footer are
always in view, and only the list scrolls, inside its card. The page takes
exactly the window's height (`100dvh`, after a `100vh` fallback, so that a
mobile browser's bars do not cut the footer off). The chart's card keeps
its natural height and the list's card takes the rest, with the
narrowing's "Show all" line and the bots' button, when there are any, at
its top. The
list's column headings stay at the top of its scrolling area, on the
card's background, while the rows scroll under them. Where the platform
draws classic scroll bars, the area's bar is thin and shows only while the
pointer is over the list or focus is inside it, in room kept for it at
rest so that nothing moves. A new narrowing, or clearing it, shows the list from its top. While the list loads, fails
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

The summary table and the list cover the same period. A row counts the
pull requests its member opened: how many were opened and how many merged
in the period, and their lines, summed once per pull request of the list
however many measures it counts toward. Merging someone else's pull
request, or a bot's, does not count toward the merger's Merged. The Pushed
column counts the member's pushes in the period, to any pull request.
Each row shows the member's avatar beside the login, as the list does.
Members with no activity in the period are listed with zeros: a member
with nothing in two weeks is what the view is there to show. Rows are in
login order, not ranked by any measure.

After the members comes one row per bot that opened a pull request of the
list, marked "bot" after its login, in login order. Its
Opened, Merged, Additions and Deletions are counted as a member's are;
its Pushed shows "—", since a bot's pushes are not counted. A totals row
closes the table and includes the bots' rows, so that its Merged equals
the number of merges the chart's bars count.

Review counts and review latency are not shown.

## Loading

Everything the view shows comes from the [activity API](activity-api.md),
served from the same host as the session API: the organizations from
`GET /activity/organizations`, and the selected organization's members,
pull requests and activity over the period from one `GET /activity`.
Apart from the connection that keeps it [live](#live-updates), the page
calls no other API, and it never calls the GitHub API: the server
collects the activity from GitHub and returns to each viewer only what
that viewer can see there. Every request carries the session's access
token; an expired one is refreshed and the request sent again (see the
activity API's [errors](activity-api.md#errors)).

## The browser cache

The browser keeps the last answer of each request in IndexedDB, so that a
reload draws at once instead of waiting for the API:

| Data                                      | Kept as                                                    |
| ----------------------------------------- | ---------------------------------------------------------- |
| The viewer's organizations                | The last answer, with when it was stored                   |
| The activity of each organization         | The last answer, per organization, with when it was stored |
| The organization the viewer last selected | Its id                                                     |

An answer is drawn only for 7 days after it was stored. Without an
expiry, a pull request in a private repository the user can no longer see
would stay on screen when the page has not been opened for a while; the
next answer replaces it anyway. A stored answer of the activity is drawn
for the period ending now, so that what fell out of the period is not
shown.

The cache is kept per signed-in login, so that two users of the same browser
never see each other's answers, and the viewer's entries are deleted on
sign-out. A sign-out in any tab of the browser also stops every tab from
storing anything more for the viewer, so that a load still in flight in
another tab cannot write the entries again once they are deleted. The
organization the viewer last selected is selected again on the next load
while the organizations (stored or fetched) still list it; otherwise the
first one is.

The cache only saves waiting. When IndexedDB is unavailable or fails
(private browsing, blocked storage, a full quota), the view asks the API as
if nothing were stored, and the failure is not shown.

### Drawing from the cache first

The view draws what the cache holds at once and brings it up to date behind
it, so that a reload waits on none of the view's requests before showing the
members' activity.

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

- The stored organizations are drawn at once; they are then asked for
  again, and drawn again if the answer differs. Without stored ones, the
  view says it is loading until the answer arrives.
- The stored activity of the selected organization is drawn at once: the
  chart, the list and the summary table. The API is then asked again, and
  its answer replaces what was drawn and is stored in place of the last
  one. While the request runs, an "Updating…" note sits in the first
  card's top row, in room kept for it so that its coming and going moves
  nothing. The request is made on every load: the activity of the day
  keeps growing, and the server holds the up-to-date answer.
- When nothing is stored for the organization, the activity page's cards
  say they are loading, and so does the members page, until the API
  answers.

When a request fails behind what is drawn, what is drawn stays, and the
failure with a way to retry shows above the cards. Retrying asks again
without clearing the screen. When nothing is drawn yet, the failure shows
in place of what is loading. The failure says what could not be loaded or
updated ("the activity of my-org's members"), and, for an update, that
what is shown may be out of date; why, in the viewer's terms (they appear
to be offline, GitHub no longer lets them see it, or GitHub or Yagura is
not working); and what to do: retry or reload. Like the sign-in screen, it
names no endpoint, status or error code.

What is shown once the API has answered is the same as without the cache;
the cache changes when things are drawn, not what is drawn.

## Live updates

An open page brings the activity up to date by itself within seconds of
the server recording new activity, such as a pull request opened, pushed
to or merged, without a reload. The server sends a signal to each viewer
who can see the repository (see the activity API's
[signals](activity-api.md#signals)), and the page fetches again when one
arrives.

- **Connecting.** Once the page has a signed-in viewer, it asks for a
  signal token (`POST /activity/signal-token`), connects to the realtime
  endpoint with it, and subscribes to the channel the token came with.
  A tab holds one connection, whichever page it shows and whichever
  organization is selected.
- **On a signal.** The page fetches the selected organization's activity
  over the period ending now again, the same way as on a load: what is
  drawn stays, with the "Updating…" note, and the answer replaces it in
  place and is stored in the browser cache. Signals that arrive within two
  seconds of the first are gathered into one fetch, since a push often
  sends several. Two fetches of the same view never run at once: a signal
  that arrives while one runs makes one more fetch follow it. New rows are
  not highlighted; the list keeps where it was scrolled to, and the
  chart keeps what is chosen in it.
- **Losing the connection.** When the connection drops (the network, the
  24-hour limit on a connection, the service closing it), the page asks for
  a new token and connects again, after a wait that starts at about a
  second and doubles with each failure, up to about a minute, spread at
  random so that tabs do not come back together. Once subscribed again, it
  fetches once, for the signals it missed meanwhile.
- **Being shown again.** When the tab becomes visible after it was hidden,
  the page fetches once, since a browser may have let its connection lapse
  or held back its timers, and connects again at once if the connection is
  gone.
- **Ending.** Signing out, the session ending, or anything else that shows
  a view without a viewer closes the connection, and nothing connects
  until a viewer is signed in again.
- **Failures.** A failed token request or connection is tried again with
  the same growing wait, and only warned about in the console. The page
  never shows whether it is connected: without the connection it works as
  a page that is not live, which a reload brings up to date. A failed
  fetch after a signal shows as any failed update does (see
  [Drawing from the cache first](#drawing-from-the-cache-first)).

A build without the signal hosts (see
[Deployment](../guides/deployment.md#build-configuration)), and the
development mode with the API mock, do not connect, and the page is not
live.

The whole period is fetched again each time, not what changed since the
last answer.
