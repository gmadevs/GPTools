<div align="center">

<img src="docs/logo.svg" alt="" width="128">

# Google Photos QuickKeys

Single-key shortcuts for sorting photos on photos.google.com.

[![Install](https://img.shields.io/badge/Install-userscript-2ea44f?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/gmadevs/GPTools/main/google-photos-quickkeys.user.js)

[![Version](https://img.shields.io/github/v/release/gmadevs/GPTools?color=blue)](https://github.com/gmadevs/GPTools/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)
[![Userscript](https://img.shields.io/badge/userscript-Tampermonkey-00485B?logo=tampermonkey&logoColor=white)](https://www.tampermonkey.net/)
[![No build step](https://img.shields.io/badge/dependencies-none-lightgrey)](google-photos-quickkeys.user.js)
[![One file](https://img.shields.io/github/size/gmadevs/GPTools/google-photos-quickkeys.user.js?label=one%20file&color=lightgrey)](google-photos-quickkeys.user.js)
[![Last commit](https://img.shields.io/github/last-commit/gmadevs/GPTools?color=blue)](https://github.com/gmadevs/GPTools/commits/main)

</div>

Google Photos has keyboard shortcuts for archiving (`Shift`+`A`) and deleting (`#`), but
deleting also asks for confirmation, so each photo takes three or four keys. This
userscript puts the common actions on single keys that sit under the left hand:

```
A           archive
D           delete, confirmed automatically
F           favourite, then archive
Space       keep, go to the next photo
Z           undo
1 … 9       add to an album you chose for that key
S           select the open photo, during a selection
C           compare two similar photos side by side and keep one
T           set how many photos are left to sort
Alt+K       turn all the keys on or off (Option+K on a Mac)
```

A panel in the bottom-right corner counts what you have done in this session, today and in
total, and how many photos are left.

> Unofficial. Not affiliated with or endorsed by Google.

---

## Contents

- [Installing](#installing)
- [The keys](#the-keys)
- [Deleting](#deleting)
- [Favourites](#favourites)
- [Albums on the number keys](#albums-on-the-number-keys)
  - [Albums in the grid](#albums-in-the-grid)
- [Selecting photos in the viewer](#selecting-photos-in-the-viewer)
- [Selecting the same photos again](#selecting-the-same-photos-again)
  - [Shift+click and the box of a day](#shiftclick-and-the-box-of-a-day)
- [Comparing similar photos](#comparing-similar-photos)
- [The panel and the statistics](#the-panel-and-the-statistics)
- [Photos left to sort](#photos-left-to-sort)
- [Settings](#settings)
- [How it works](#how-it-works)
- [When a key does nothing](#when-a-key-does-nothing)
- [Limitations](#limitations)
- [Releasing](#releasing)
- [License](#license)

---

## Installing

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/) in your browser.
2. Open the [script file](https://raw.githubusercontent.com/gmadevs/GPTools/main/google-photos-quickkeys.user.js).
   The extension shows its install page. Press **Install**.
3. Reload photos.google.com. The counter panel appears in the bottom-right corner.

In Chrome 138 and later, Tampermonkey runs scripts only when user scripts are allowed. Open
`chrome://extensions`, then Tampermonkey's **Details**, and turn on **Allow User Scripts**.
In earlier versions of Chrome the switch is **Developer mode**, at the top right of the
extensions page. If the panel does not appear, check this first.

Tampermonkey checks the `@updateURL` in the script header and installs new versions from
this repository.

## The keys

| Key | Action |
|---|---|
| `A` | Archive the photo |
| `D` or `X` | Move the photo to the bin and confirm the dialog |
| `F` | Add to favourites and archive the photo. On a favourite, remove it from the favourites. |
| `Space` | Keep the photo and go to the next one |
| `Z` or `U` | Press **Undo** on the notification at the bottom of the page |
| `1` to `9` | Add the photo, or the selected photos in the grid, to the album assigned to that key and archive them |
| `Shift`+`1` to `9` | Assign an album to that key |
| `R` | In the grid: select the photos that were selected last |
| `S` | In the viewer, during a selection: tick or untick the open photo |
| `C` | Turn the comparison mode on or off |
| `T` | Set the number of photos left to sort |
| `H` | Change the panel: counts and keys, counts only, hidden |
| `Alt`+`K` | Turn all the keys on or off (`Option`+`K` on a Mac) |

The keys work in the photo viewer, with one photo open. After archiving or deleting, Google
Photos opens the next photo by itself. In the grid, `1` to `9`, `R` and `A` work on a
selection: see [Albums in the grid](#albums-in-the-grid) and
[Selecting the same photos again](#selecting-the-same-photos-again).

The script ignores a key:

- while the keys are turned off with `Alt`+`K`;
- while you type in a text field (search, description, album name), also one inside a
  shadow root;
- while a confirmation dialog is open;
- when it is pressed with `Ctrl`, `Cmd` or `Alt` (except `Alt`+`K`);
- when it is held down (the repeats the keyboard sends are dropped, so holding `D` deletes
  one photo).

After `A`, `D`, `F` or `Space` the script waits until Google Photos has opened the next photo
before it takes another key, for up to 5 seconds, and leaves at least 300 ms between two
actions. While it waits, the panel has a yellow border. A key pressed during the wait is
dropped and the border turns red. If the next photo has not opened after 5 seconds, the
message "Google Photos is slow" appears.

The keys are set in the `KEYS` object at the top of the script.

### Turning the keys off

`Alt`+`K` (`Option`+`K` on a Mac) turns all the keys off, for example before you type in a
field the script does not recognise as one. The panel then shows only "QuickKeys off" and
the shortcut. Press `Alt`+`K` again to turn the keys on. The ⏻ button at the top right of
the panel does the same with a click. The state is saved in the browser, so the keys stay
off after a reload until you turn them on.

The shortcut is set in `TOGGLE_KEY` at the top of the script. It is read from the physical
key, so it is the same on any keyboard layout.

## Deleting

`D` presses the bin button, waits up to 2.5 seconds for the confirmation dialog and presses
**Move to bin** (**Move to trash** in American English, **Sposta nel cestino** in Italian).
The photo goes to the bin, where
Google Photos keeps it for 60 days, as it does when you delete by hand.

If the dialog does not appear, or its button is not found, the script stops and a red
message asks you to check the page and press `Enter` yourself.

To keep the confirmation dialog, set `AUTO_CONFIRM_TRASH = false`.

## Favourites

`F` presses the favourite button, waits 300 ms and archives the photo, which opens the next
one. The photo is in the favourites and out of the main photo view.

If the photo is already a favourite, `F` removes it from the favourites and does nothing
else. The script tells a favourite from the button: its label contains "remove",
"unfavorite", "rimuovi" or "togli", or the button is in the pressed state.

If the photo is already archived, for example in an album of photos you sorted before, the
menu has **Unarchive** (**Annulla archiviazione** in Italian) in place of **Archive**. `F`
then closes the menu, shows "Already archived" and opens the next photo. The photo stays
archived. The same happens after a number key, and `A` on an archived photo only shows the
message.

`FAVORITE_THEN` at the top of the script sets what happens after a favourite is added:

| Value | After the favourite |
|---|---|
| `'archive'` | archive the photo (the default) |
| `'next'` | go to the next photo, without archiving |
| `'stay'` | stay on the photo |

## Albums on the number keys

1. Open a photo and press `Shift`+`1`.
2. Type the name of the album as Google Photos shows it, and press **OK**.
3. From then on, `1` adds the open photo to that album.

The same works for keys 2 to 9. The assignments are saved in the browser and listed in the
panel. To clear a key, press `Shift` and the number and leave the field empty.

The number keys on the numeric keypad work too.

When you press a number, the script opens **More options**, chooses **Add to album** and
looks for the album in the list. The name has to match. Case and repeated spaces are
ignored; accents and emoji are compared as they are. If the album is not in the part of the
list on screen, the script scrolls the list until it finds it or reaches the end.

After the photo is added, the script waits 300 ms and archives it, which opens the next
photo. `ALBUM_THEN` at the top of the script sets what happens instead:

| Value | After the album |
|---|---|
| `'archive'` | archive the photo (the default) |
| `'next'` | go to the next photo, without archiving |
| `'stay'` | stay on the photo, for example to add it to a second album |

Albums can also be set in the `ALBUMS` object at the top of the script. An album assigned
with `Shift` and a number replaces the one set in the script for the same key.

### Albums in the grid

1. In the grid, select the photos. You can scroll while you select, and use `Shift`+click.
2. Press the number of the album.

First the script compares the photos it knows with the number in "12 selected" at the top.
If it knows fewer, for example after a `Shift`+click over photos it never saw, it scrolls
through the part of the grid with the selected photos, from 1 screen above the first to 1
screen below the last, and notes every ticked box. If photos are still missing, it goes on
up to 10 screens below and 10 above. Then it scrolls back.

Then it presses **Create or add to album**, chooses **Album** and picks the album in the
same list as in the viewer. Google Photos adds all the selected photos and clears the
selection. With `ALBUM_THEN = 'archive'`, the script waits up to 3 seconds for the
selection to clear, ticks the same photos again as `R` does, and archives them. It archives
nothing, and a red message gives the numbers, in two cases:

- it knows fewer photos than Google Photos counted;
- after ticking, Google Photos counts fewer photos than before.

With no photos selected, a number key in the grid only shows a red message.

## Selecting photos in the viewer

1. In the grid, tick one photo.
2. Open a photo with the magnifier at its bottom right. The viewer shows "1 selected" at
   the top left and a **Select** box at the top right.
3. Move between the photos with the arrow keys and press `S` on each photo you want.

`S` presses the **Select** box. On a photo that is already selected it unticks it. A
message shows "Selected" or "Unselected" and the number of selected photos that Google
Photos shows at the top. When you go back to the grid, the photos stay selected, and `A`
or a number key works on all of them.

Without a selection, the viewer has no **Select** box, and `S` shows a red message.

## Selecting the same photos again

`R` ticks again the photos that were selected last, for example after you added them to an
album with **Create or add to album**. Then `A` archives them.

The script checks the boxes in the grid every 400 ms. It keeps the ID of each selected photo,
and, for each photo on screen, selected or not, how far down the grid it is and the date and
time in its label. It keeps them until you select other photos, and it forgets them when
the page is reloaded. A photo you untick stays in the list for 1.5 seconds, since Google
Photos unticks the boxes on screen a moment before it clears a selection.

### Shift+click and the box of a day

`Shift`+click ticks every photo between the last photo you clicked and this one, also the
ones far from the screen. Google Photos ticks those without drawing them, so the script
does not see their boxes ticked. The grid is in date order, newest first. 500 ms after a
`Shift`+click, the script takes every photo it has seen with a date and time between the
two clicked photos, and adds it to the selection, or removes it if the click unticked.
The box next to a date does the same for the photos of that day.

This works for the photos that passed on screen while photos were selected. A photo you
scrolled past too fast, or that was never on screen, is not known. The script reads the
date in British and American English and in Italian.

Google Photos keeps only the photos near the screen in the page. For the photos that are
not there, `R` scrolls the grid to where each one was seen, ticks it, and then scrolls back.

The grid can change height above a photo after you scroll past it, so a photo is not always
where it was seen. When `R` arrives and the photo is not there, it compares where the photos
on screen are now with where they were seen, and moves by the difference, up to 5 times.
Then it looks up to 4 screens above and below. It waits up to 3 seconds for the grid to
draw the photos at each place. If Google Photos puts the grid back where it was, `R` scrolls
again, up to 3 times.

At the end, `R` waits up to 3 seconds for the number at the top to catch up, and compares
it with the number Google Photos showed before. If it is lower, a red message gives both
numbers. Either some photos were not found (scroll to them and press `R` again), or they
were selected while off screen and the script never saw them (select them by hand).

`R` does not work while Google Photos shows "12 selected" at the top, or in the photo
viewer: it only shows a red message, with the number of photos selected. Clear the
selection with `Esc` first. The exception is a selection left by an `R` that found only
some of the photos.

The script counts a selection from the ticked boxes of photos in the grid and from the
**Clear selection** button. Other checkboxes on the page do not count. After a selection is
cleared, Google Photos leaves the button in the page with opacity 0, and then it does not
count either. While a dialog is open, such as the list of albums, the check every 400 ms
waits.

`A` on a selection counts every selected photo in the panel, using the number in
"12 selected" at the top of the page.

## Comparing similar photos

For a burst of photos of the same subject.

1. Open the first photo of the series and press `C`.
2. The screen splits in two. On the left is the photo you started from (A), on the right
   the next one (B). Under each photo is the description Google Photos gives it, which
   usually includes the date and time.
3. Choose with the arrow keys:

| Key | Action |
|---|---|
| `←` | Keep A and delete B. A stays on the left and is compared with the next photo. |
| `→` | Keep B and delete A. B moves to the left and is compared with the next photo. |
| `↓` or `Space` | Keep both. B moves to the left. |
| `Esc` or `C` | Leave the comparison |

With five shots of the same scene, keep pressing the arrow that points at the better one
until one is left, then press `↓` to move on.

To delete A, the script goes back one photo and checks that the address of the page is the
address of A. If it is not, nothing is deleted and a red message appears. If anything else
does not go as expected (the confirmation dialog, the next photo not opening, the end of the
album), the comparison closes so that you can see the page.

The other keys (`A`, `F`, `Z`, the numbers) keep working during the comparison.

## The panel and the statistics

The panel in the bottom-right corner has a table with five columns: archived (📦), deleted
(🗑), kept (✓), favourites (★) and added to an album (🗂). It has three rows:

- **Session**: since the page was loaded;
- **Today**: since midnight;
- **Total**: since the script was installed.

The daily and total counts are saved in the browser's local storage, so they survive a
reload and a restart. They are per browser: another computer or another browser starts from
zero. With two Google Photos tabs open, both write to the same counts and both panels
update.

`Z` subtracts the last action of the session from the counts.

Two commands in the browser console (`Cmd`+`Option`+`J` in Chrome on macOS):

- `gpqkStats()` prints the total and the counts for each day;
- `gpqkResetStats()` deletes all the counts.

`H` changes the panel in turn:

1. counts, photos left, keys and albums (the default);
2. counts and photos left only;
3. hidden. The messages at the top of the page still appear.

A message names the mode each time, and the mode is saved in the browser.

## Photos left to sort

The script cannot read how many photos a library has, so it asks for the number.

1. Press `T`.
2. Type how many photos are left to sort, and press **OK**. On an album page, the field
   starts with the number of items the album header shows.

The panel then shows a line such as:

```
Left: 12,345 (3% done) · about 6 h 40 min at this pace
```

Each archive, delete or keep (`A`, `D`, `F` with archive, `Space`, and the arrows in the
comparison) takes one photo off. Adding to an album and adding a favourite without archiving
do not, because the photo stays where it is. `Z` puts one photo back.

The percentage is counted from the number you typed. The time appears after 10 photos in
the session, and is the number left divided by the pace of this session.

The number is saved in the browser with the other counts. Press `T` again to correct it, or
leave the field empty to remove the line. `gpqkResetStats()` keeps the number of photos left.

## Settings

At the top of the script:

| Setting | Default | Effect |
|---|---|---|
| `KEYS` | see [The keys](#the-keys) | the key for each action |
| `AUTO_CONFIRM_TRASH` | `true` | confirm the delete dialog automatically |
| `DEBUG` | `false` | write what the script does to the console |
| `ALBUMS` | empty | albums for the number keys |
| `ALBUM_THEN` | `'archive'` | what a number key does after adding to an album: `'archive'`, `'next'` or `'stay'` |
| `FAVORITE_THEN` | `'archive'` | what `F` does after adding a favourite: `'archive'`, `'next'` or `'stay'` |
| `TOGGLE_KEY` | `Alt`+`K` | the key that turns all the keys on or off |

Tampermonkey replaces the whole file when it updates the script, so changes made in the
editor are lost on the next update. Albums assigned with `Shift` and a number, and the
number of photos left, are saved in the browser and are kept.

## How it works

The script starts at `document-start` and adds its key listener then. The extension usually
runs it before the Google Photos code, so a key that both use reaches the script first. The
rest of the script waits until the page has loaded.

The script clicks the buttons of the Google Photos page. It finds them by their
`aria-label` or text, in Italian and English: **Elimina** / **Delete** / **Move to bin**, **Altre opzioni** /
**More options**, **Archivia** / **Archive**, **Aggiungi all'album** / **Add to album**. If a
button is not found, it sends the Google Photos shortcut instead (`Shift`+`A` for archive,
`#` for delete), which may not work, because Google Photos does not always accept key
presses sent by a script.

To know whether an action is finished, it watches the address of the page: each photo in
the viewer has its own address, and the address changes when the next photo opens.

In the comparison mode, the photo shown on screen is the largest visible image on the page,
leaving out images that are transparent. The script copies its address into the left or
right half.

Google Photos enforces Trusted Types, which blocks `innerHTML`. The panel and the
comparison screen are built with `createElement` and `textContent`.

The script makes no network requests of its own and has no `@grant` permissions. The
counts and the album assignments are stored in the local storage of photos.google.com.

## When a key does nothing

1. Check that the panel is in the bottom-right corner. If it is not, the script is not
   running: see [Installing](#installing).
2. Set `DEBUG = true` in the script and reload the page.
3. Open the console and press the key. Lines that start with `[GPQK]` show what the script
   looked for and what it clicked.
4. `gpqkDump()` in the console prints a table of the buttons on screen with their labels.

When Google changes the labels of its buttons, the patterns in the `RX` object at the top of
the script need the new text. Open an issue with the `gpqkDump()` output.

## Limitations

- The buttons are recognised in Italian and English Google Photos only. With Google
  Photos in another language, the keys find no buttons.
- Written and tried in the photo viewer. In the grid, `R` has been tried with 5 photos
  spread over about 80,000 pixels (120 screens), and with the saved places moved by 3,000
  pixels. A number key has been tried as far as the album list. Adding a selection to an
  album and archiving it have not been tried on real photos.
- `R` finds a photo by where it was in the grid. If you scroll past a part of the grid too
  fast for the check every 400 ms to see it, there are fewer photos there to compare, and a
  photo that has moved far may not be found.
- A `Shift`+click range is worked out from dates and times, assuming it starts at the photo
  clicked last. This could not be tried here: `Shift`+click from a script does not select a
  range in Google Photos. If the range Google Photos ticks is different, the numbers at
  the end of `R` show it. With the number keys, the search before the album finds the
  missing photos.
- **`Z` presses the Undo button that is on screen.** Google Photos shows its notifications
  one after the other, a few seconds each. If you sort quickly, the notification on screen
  can belong to an action a few photos back, and `Z` undoes that one. Press `Z` straight
  after the mistake. The counts then subtract the last action, which may not be the one
  undone.
- On the last photo of an album, `Space` waits the full 5 seconds and shows the message
  "Google Photos is slow", because there is no next photo to open.
- If Google Photos labels the favourite button of a favourite in a way the script does not
  recognise, `F` on a favourite removes it and archives the photo. Check this on one photo
  before you rely on it.

## Releasing

Bump `@version` in the script, commit, and run:

```bash
./release.sh
```

It checks the syntax with `node --check`, tags the commit with the version, pushes, and
creates a GitHub release with the script attached. It stops if the working tree has
uncommitted changes or the tag exists.

## License

[MIT](LICENSE). Copyright (c) 2026 Giorgio Maria Agazzi.
