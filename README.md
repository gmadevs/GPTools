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
F           favourite
Space       keep, go to the next photo
Z           undo
1 … 9       add to an album you chose for that key
C           compare two similar photos side by side and keep one
```

A panel in the bottom-right corner counts what you have done in this session, today and in
total.

> Unofficial. Not affiliated with or endorsed by Google.

---

## Contents

- [Installing](#installing)
- [The keys](#the-keys)
- [Deleting](#deleting)
- [Albums on the number keys](#albums-on-the-number-keys)
- [Comparing similar photos](#comparing-similar-photos)
- [The panel and the statistics](#the-panel-and-the-statistics)
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
| `F` | Add to favourites, or remove from them if the photo is already a favourite |
| `Space` | Keep the photo and go to the next one |
| `Z` or `U` | Press **Undo** on the notification at the bottom of the page |
| `1` to `9` | Add the photo to the album assigned to that key |
| `Shift`+`1` to `9` | Assign an album to that key |
| `C` | Turn the comparison mode on or off |
| `H` | Show or hide the list of keys in the panel |

The keys work in the photo viewer, with one photo open. After archiving or deleting, Google
Photos opens the next photo by itself.

The script ignores a key:

- while you type in a text field (search, description, album name);
- while a confirmation dialog is open;
- when it is pressed with `Ctrl`, `Cmd` or `Alt`;
- when it is held down (the repeats the keyboard sends are dropped, so holding `D` deletes
  one photo).

After `A`, `D` or `Space` the script waits until Google Photos has opened the next photo
before it takes another key, for up to 5 seconds, and leaves at least 300 ms between two
actions. While it waits, the panel has a yellow border. A key pressed during the wait is
dropped and the border turns red. If the next photo has not opened after 5 seconds, the
message "Google Photos is slow" appears.

The keys are set in the `KEYS` object at the top of the script.

## Deleting

`D` presses the bin button, waits up to 2.5 seconds for the confirmation dialog and presses
**Move to trash** (**Sposta nel cestino** in Italian). The photo goes to the bin, where
Google Photos keeps it for 60 days, as it does when you delete by hand.

If the dialog does not appear, or its button is not found, the script stops and a red
message asks you to check the page and press `Enter` yourself.

To keep the confirmation dialog, set `AUTO_CONFIRM_TRASH = false`.

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

The photo stays open after it is added, so you can add it to a second album, or archive it.
To go to the next photo after each album, set `ALBUM_THEN_NEXT = true`.

Albums can also be set in the `ALBUMS` object at the top of the script. An album assigned
with `Shift` and a number replaces the one set in the script for the same key.

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

`H` hides the list of keys and albums. The counts stay visible. The choice is saved.

## Settings

At the top of the script:

| Setting | Default | Effect |
|---|---|---|
| `KEYS` | see [The keys](#the-keys) | the key for each action |
| `AUTO_CONFIRM_TRASH` | `true` | confirm the delete dialog automatically |
| `DEBUG` | `false` | write what the script does to the console |
| `ALBUMS` | empty | albums for the number keys |
| `ALBUM_THEN_NEXT` | `false` | go to the next photo after adding to an album |

Tampermonkey replaces the whole file when it updates the script, so changes made in the
editor are lost on the next update. Albums assigned with `Shift` and a number are saved in
the browser and are kept.

## How it works

The script clicks the buttons of the Google Photos page. It finds them by their
`aria-label` or text, in Italian and English: **Elimina** / **Delete**, **Altre opzioni** /
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
- Written and tried in the photo viewer. In the grid, with photos selected, the buttons have
  the same names, but this has not been tried.
- **`Z` presses the Undo button that is on screen.** Google Photos shows its notifications
  one after the other, a few seconds each. If you sort quickly, the notification on screen
  can belong to an action a few photos back, and `Z` undoes that one. Press `Z` straight
  after the mistake. The counts then subtract the last action, which may not be the one
  undone.
- On the last photo of an album, `Space` waits the full 5 seconds and shows the message
  "Google Photos is slow", because there is no next photo to open.
- `F` counts a press as a favourite, also when it removes a photo from the favourites.

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
