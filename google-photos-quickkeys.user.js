// ==UserScript==
// @name         Google Photos QuickKeys
// @namespace    https://github.com/gmadevs/GPTools
// @homepageURL  https://github.com/gmadevs/GPTools
// @supportURL   https://github.com/gmadevs/GPTools/issues
// @downloadURL  https://raw.githubusercontent.com/gmadevs/GPTools/main/google-photos-quickkeys.user.js
// @updateURL    https://raw.githubusercontent.com/gmadevs/GPTools/main/google-photos-quickkeys.user.js
// @license      MIT
// @version      0.15.0
// @description  Single keys for sorting photos on Google Photos: archive, delete with the dialog confirmed, favourite and archive, albums on keys 1-9, side-by-side comparison of similar photos, saved counts and photos left.
// @match        https://photos.google.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

/*

MIT License

Copyright (c) 2026 Giorgio Maria Agazzi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

// Google Photos enforces Trusted Types, so no innerHTML: the DOM is built with
// createElement and textContent only.

(function () {
  'use strict';

  // The listener is added at document-start, before Google Photos adds its own,
  // so the keys of this script reach it first. It calls onKey once the page is
  // loaded and main() has run.
  let onKey = null;
  window.addEventListener('keydown', (e) => { if (onKey) onKey(e); }, true);

  // ---------------------------------------------------------------------------
  // Settings: the keys for each action (event.key, lower case).
  // ---------------------------------------------------------------------------
  const KEYS = {
    archive: ['a'],
    trash: ['d', 'x'],
    favorite: ['f'],
    undo: ['z', 'u'],
    next: [' '],          // keep the photo and go to the next one
    toggleHud: ['h'],
    dupMode: ['c'],       // comparison mode for similar photos
    setLeft: ['t'],       // set how many photos are left to sort
    reselect: ['r'],      // in the grid: select the last selected photos again
    select: ['s'],        // in the viewer, during a selection: tick or untick the open photo
  };
  // Turns all the keys on and off. Read from event.code, so it works with any
  // layout; on a Mac, Alt is the Option key.
  const TOGGLE_KEY = { code: 'KeyK', alt: true, shift: false };
  // In comparison mode: ← keep A, → keep B, ↓/Space keep both, Esc leave.
  const AUTO_CONFIRM_TRASH = true;   // press "Move to trash" in the dialog
  // After F adds a favourite: 'archive' (archive it, which opens the next photo),
  // 'next' (go to the next photo) or 'stay'. Removing a favourite always stays.
  const FAVORITE_THEN = 'archive';
  const DEBUG = false;               // true = log to the console (Cmd+Opt+J)

  // Albums on the number keys: key 1–9 → exact album name. They can also be
  // assigned on the page with Shift+number; those are saved in the browser and
  // replace the ones set here.
  const ALBUMS = {
    // '1': 'Holidays',
    // '2': 'Family',
  };
  // After a number key adds the open photo to an album: 'archive' (archive it,
  // which opens the next photo), 'next' (go to the next photo) or 'stay'.
  const ALBUM_THEN = 'archive';

  // Button labels in Italian and English Google Photos. British English says
  // "bin" where American English says "trash".
  const RX = {
    trashBtn: /^(elimina|delete|sposta nel cestino|move to (trash|bin)|cestino|trash|bin)$/i,
    moreBtn: /^(altre opzioni|more options|altro|more)$/i,
    // No \b: the item text runs into the shortcut shown beside it ("ArchiveShift+A").
    archiveItem: /^\s*(archivia|archive)(?!zion|d)/i,
    // The same menu on a photo that is already archived.
    unarchiveItem: /(unarchive|annulla archiviazione|(rimuovi|togli) dall['’]?\s*archivio)/i,
    confirmTrash: /(sposta nel cestino|nel cestino|move to (trash|bin)|^elimina|^delete|rimuovi|remove)/i,
    cancel: /^(annulla|cancel)$/i,
    undo: /^(annulla|undo)$/i,
    favorite: /(preferit|favou?rite)/i,
    unfavorite: /(rimuovi|togli|remove|unfavou?rite)/i,
    albumCount: /^(\d[\d.,\s]*)\s+(elementi|elemento|items?|foto|photos?)\b/i,
    nextBtn: /(foto successiva|next photo|successiv|^next$|^avanti$)/i,
    prevBtn: /(foto precedente|previous photo|precedent|^previous$|^indietro$)/i,
    addToAlbumItem: /^\s*(aggiungi (all|a un|ad un)['’]?\s*album|add to( an)? album)/i,
    anyAlbumItem: /album/i,
    newAlbum: /(nuovo album|new album)/i,
    closeDialog: /^(annulla|cancel|chiudi|close)$/i,
    clearSelection: /^(clear selection|deseleziona|annulla selezione|cancella selezione)/i,
    selectedCount: /^(\d[\d.,]*)\s+(selected|selezionat[aeio])$/i,
    // The + at the top of the grid with photos selected, and the item of its menu.
    albumBtn: /^(create or add to album|crea o aggiungi.*album|aggiungi.*album)$/i,
    albumMenuItem: /^\s*album\s*$/i,
    // The box at the top right of the viewer while photos are selected.
    selectBox: /^(select|seleziona)/i,
  };

  const log = (...a) => DEBUG && console.log('%c[GPQK]', 'color:#1a73e8;font-weight:bold', ...a);

  // Everything below needs the page: it runs once the DOM is there.
  function main() {
    // ---------------------------------------------------------------------------
    // Utility
    // ---------------------------------------------------------------------------
    const isVisible = (el) => {
      if (!el || !el.isConnected) return false;
      if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
      // No opacity check: in the viewer the top bar fades out when the mouse is
      // still, and its buttons can still be clicked.
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none';
    };

    const ariaOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || '').trim();
    const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();

    // A text field, also one inside a shadow root (the search bar can be one):
    // there, key presses are text and not commands.
    const isTyping = (el) => {
      if (!el || el.nodeType !== 1) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (tag === 'INPUT') return !/^(button|checkbox|radio|range|submit|reset|file|image|color)$/i.test(el.type);
      return /^(textbox|searchbox|combobox)$/.test(el.getAttribute('role') || '');
    };

    function deepActiveElement() {
      let a = document.activeElement;
      while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
      return a;
    }

    const typingIn = (e) =>
      isTyping((e.composedPath && e.composedPath()[0]) || e.target) || isTyping(e.target) || isTyping(deepActiveElement());

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    async function waitFor(fn, timeout = 2500, step = 50) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const v = fn();
        if (v) return v;
        await sleep(step);
      }
      return null;
    }

    const CLICKABLE = 'button, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [jsaction*="click"]';

    // Finds a visible clickable element whose aria-label (or text) matches.
    // Searches from the end: the viewer comes after the grid in the DOM, so the
    // last match is the one in front.
    function find(rx, { root = document, by = 'aria', exclude } = {}) {
      const els = [...root.querySelectorAll(CLICKABLE)].filter(isVisible).reverse();
      for (const el of els) {
        const l = by === 'aria' ? ariaOf(el) : by === 'text' ? textOf(el) : ariaOf(el) || textOf(el);
        if (l && rx.test(l) && !(exclude && exclude(el, l))) return el;
      }
      return null;
    }

    // A full click: some Google components react to pointer and mouse down/up.
    function realClick(el) {
      const r = el.getBoundingClientRect();
      const opts = {
        bubbles: true, cancelable: true, composed: true, view: window,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0,
      };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.click();
      log('clicked', ariaOf(el) || textOf(el), el);
    }

    // Last resort: send the Google Photos shortcut.
    function sendKey({ key, code, keyCode, shiftKey = false }) {
      const target = document.activeElement || document.body;
      for (const type of ['keydown', 'keyup']) {
        const ev = new KeyboardEvent(type, { key, code, shiftKey, bubbles: true, cancelable: true, composed: true });
        Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
        Object.defineProperty(ev, 'which', { get: () => keyCode });
        target.dispatchEvent(ev);
      }
      log('sent key', key);
    }

    function visibleDialogs() {
      return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(isVisible);
    }

    // Confirmation dialogs only (the ones with a Cancel button), not the photo
    // viewer, which can also have role="dialog".
    function confirmDialogs() {
      return visibleDialogs().filter((d) => find(RX.cancel, { root: d, by: 'any' }));
    }

    function visibleMenus() {
      return [...document.querySelectorAll('[role="menu"]')].filter(isVisible);
    }

    // Lists the visible buttons and their labels, for when a key stops working.
    function dump() {
      const rows = [...document.querySelectorAll(CLICKABLE)].filter(isVisible).map((el) => ({
        aria: ariaOf(el), text: textOf(el).slice(0, 60), role: el.getAttribute('role') || el.tagName.toLowerCase(),
      })).filter((r) => r.aria || r.text);
      console.table(rows);
      return rows;
    }
    window.gpqkDump = dump;

    // ---------------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------------
    // --- Counts: the session in memory, days and total in local storage ---------
    const STATS_KEY = 'gpqk-stats';
    const FIELDS = ['archived', 'trashed', 'kept', 'favorited', 'albums'];
    const emptyStats = () => Object.fromEntries(FIELDS.map((f) => [f, 0]));
    const stats = emptyStats();        // this session
    const history = [];                // actions of this session, for Undo

    const today = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    function loadStats() {
      let s;
      try { s = JSON.parse(localStorage.getItem(STATS_KEY) || 'null'); } catch (_) {}
      if (!s || typeof s !== 'object') s = {};
      s.total = { ...emptyStats(), ...s.total };
      s.days = s.days || {};
      return s;
    }

    // Read and write each time, so that two open tabs do not overwrite each other.
    function bump(field, delta) {
      stats[field] = Math.max(0, stats[field] + delta);
      const s = loadStats();
      const day = (s.days[today()] = { ...emptyStats(), ...s.days[today()] });
      day[field] = Math.max(0, day[field] + delta);
      s.total[field] = Math.max(0, s.total[field] + delta);
      try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (_) {}
    }

    let sessionStart = 0;              // time of the first action, for the pace

    // n > 1 when one action covers a selection of photos in the grid.
    function count(field, n = 1) {
      if (!sessionStart) sessionStart = Date.now();
      bump(field, n);
      history.push([field, n]);
    }

    // --- Photos left to sort ---------------------------------------------------
    // T sets the number. Each archive, delete or keep takes one off it, and Undo
    // puts it back, because the number is worked out from the saved counts.
    const LEFT_KEY = 'gpqk-left';
    const sortedOf = (t) => t.archived + t.trashed + t.kept;

    function photosLeft() {
      let l;
      try { l = JSON.parse(localStorage.getItem(LEFT_KEY) || 'null'); } catch (_) {}
      if (!l || typeof l.left !== 'number') return null;
      const left = Math.max(0, l.left - (sortedOf(loadStats().total) - l.sortedAt));
      return { left, start: l.left };
    }

    function saveLeft(left, sortedAt) {
      try {
        if (left == null) localStorage.removeItem(LEFT_KEY);
        else localStorage.setItem(LEFT_KEY, JSON.stringify({ left, sortedAt }));
      } catch (_) {}
    }

    // On an album page the header gives the number of items: offered as a start.
    function albumItemCount() {
      if (!/\/(album|share)\//.test(location.pathname)) return null;
      for (const n of document.querySelectorAll('div, span')) {
        if (n.children.length) continue;
        const m = RX.albumCount.exec(textOf(n));
        if (m) return parseInt(m[1].replace(/\D/g, ''), 10);
      }
      return null;
    }

    function setLeft() {
      const cur = photosLeft();
      const guess = cur ? cur.left : albumItemCount();
      const v = prompt('Photos left to sort (empty = stop counting):', guess != null ? String(guess) : '');
      if (v === null) return;
      const n = parseInt(v.replace(/\D/g, ''), 10);
      if (isNaN(n)) {
        saveLeft(null);
        toast('Not counting the photos left');
      } else {
        saveLeft(n, sortedOf(loadStats().total));
        toast(`${n.toLocaleString('en-GB')} photos left`);
      }
    }

    // In the console: gpqkStats() prints the counts, gpqkResetStats() deletes them.
    window.gpqkStats = () => {
      const s = loadStats();
      console.table({ total: s.total, ...s.days });
      return s;
    };
    window.gpqkResetStats = () => {
      const left = photosLeft();
      try { localStorage.removeItem(STATS_KEY); } catch (_) {}
      if (left) saveLeft(left.left, 0);  // keep the photos left as they are
      Object.assign(stats, emptyStats());
      history.length = 0;
      renderHud();
    };

    function findMenuItem(rx) {
      for (const m of visibleMenus()) {
        const it = find(rx, { root: m, by: 'text' }) || find(rx, { root: m, by: 'aria' });
        if (it) return it;
      }
      // Fallback: any visible menu item, also outside [role=menu].
      return [...document.querySelectorAll('[role="menuitem"]')]
        .filter(isVisible)
        .find((it) => rx.test(textOf(it)) || rx.test(ariaOf(it))) || null;
    }

    function logMenuItems() {
      log('visible menu items:', [...document.querySelectorAll('[role="menuitem"]')]
        .filter(isVisible).map((it) => textOf(it) || ariaOf(it)));
    }

    function pressEscape() {
      (document.activeElement || document.body).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true })
      );
    }

    // Returns true when the photo is archived, 'already' when the menu offers
    // Unarchive. Shift+A is not sent then: on an archived photo it unarchives it.
    async function archive() {
      // In the grid, A archives the selected photos: count all of them.
      const n = inViewer() ? 1 : selectionSize();
      const more = find(RX.moreBtn, { by: 'aria' });
      if (more) {
        realClick(more);
        const item = await waitFor(() => findMenuItem(RX.archiveItem) || findMenuItem(RX.unarchiveItem), 1500);
        if (!item) logMenuItems();
        if (item && !RX.archiveItem.test(textOf(item)) && !RX.archiveItem.test(ariaOf(item))) {
          pressEscape();
          toast(n > 1 ? 'The photos are already archived' : 'Already archived');
          return 'already';
        }
        if (item) {
          realClick(item);
          count('archived', n);
          toast(n > 1 ? `${n} photos archived` : 'Archived');
          return true;
        }
        log('no "Archive" item in the menu');
        pressEscape();
        if (DEBUG) dump();
        sendKey({ key: 'A', code: 'KeyA', keyCode: 65, shiftKey: true });
        return toast('No "Archive" item in the menu (see console)', true);
      }
      log('no "More options" button');
      if (DEBUG) dump();
      sendKey({ key: 'A', code: 'KeyA', keyCode: 65, shiftKey: true });
      toast('No "More options" button (see console)', true);
    }

    async function trash() {
      const btn = find(RX.trashBtn, { by: 'aria' });
      if (btn) {
        realClick(btn);
      } else {
        log('no "Delete" button');
        if (DEBUG) dump();
        sendKey({ key: '#', code: 'Digit3', keyCode: 51, shiftKey: true });
      }

      if (!AUTO_CONFIRM_TRASH) return;

      const ok = await waitFor(() => {
        for (const d of confirmDialogs()) {
          const b = find(RX.confirmTrash, { root: d, by: 'any', exclude: (_, l) => RX.cancel.test(l) });
          if (b) return b;
        }
        return null;
      });

      if (ok) {
        realClick(ok);
        count('trashed');
        toast('Moved to bin');
        return true;
      } else {
        log('no confirmation dialog');
        if (DEBUG) dump();
        toast('No confirmation found: check the page and press Enter', true);
      }
    }

    async function favorite() {
      const btn = find(RX.favorite, { by: 'aria' });
      if (!btn) {
        if (DEBUG) dump();
        return toast('No favourite button', true);
      }
      // On a favourite the button reads "Remove from favourites" (or is pressed):
      // then F only removes it, and nothing else happens.
      const removing = RX.unfavorite.test(ariaOf(btn)) || btn.getAttribute('aria-pressed') === 'true';
      realClick(btn);
      if (removing) return toast('Removed from favourites');
      count('favorited');
      toast('Favourite ★');
      if (FAVORITE_THEN === 'stay') return;
      await sleep(300);
      return FAVORITE_THEN === 'archive' ? archiveOrSkip() : next();
    }

    // After F or a number key: archive the photo. If it is already archived
    // (an album of archived photos), open the next photo, without counting it as kept.
    async function archiveOrSkip() {
      const r = await archive();
      if (r !== 'already' || !inViewer()) return r;
      await sleep(300);
      return openNext();
    }

    // --- Selecting in the viewer ------------------------------------------------
    // With photos selected in the grid, the viewer shows a "Select" box at the
    // top right in place of the usual buttons. S ticks or unticks it for the
    // open photo; the arrows still move between photos.
    async function selectOpen() {
      if (!inViewer()) return toast('S works with a photo open', true);
      const boxes = [...document.querySelectorAll('[role="checkbox"]')].filter(isVisible).reverse();
      const box = boxes.find((b) => RX.selectBox.test(ariaOf(b))) || (boxes.length === 1 ? boxes[0] : null);
      if (!box) {
        if (DEBUG) dump();
        return toast('No "Select" box: tick a photo in the grid first, then open one', true);
      }
      const was = box.getAttribute('aria-checked') === 'true';
      realClick(box);
      const changed = await waitFor(() => (box.getAttribute('aria-checked') === 'true') !== was, 1500);
      if (!changed) return toast('The "Select" box did not change', true);
      const n = googleCount(true);
      toast(`${was ? 'Unselected' : 'Selected'}${n ? ` (${n} selected)` : ''}`);
    }

    // --- Albums on the number keys --------------------------------------------
    const ALBUMS_KEY = 'gpqk-albums';

    function savedAlbums() {
      try { return JSON.parse(localStorage.getItem(ALBUMS_KEY) || '{}'); } catch (_) { return {}; }
    }

    // Key → album name. An empty saved entry clears the one set in the code.
    function albums() {
      const all = { ...ALBUMS, ...savedAlbums() };
      return Object.fromEntries(Object.entries(all).filter(([, n]) => n && n.trim()));
    }

    function assignAlbum(digit) {
      const name = prompt(`Exact album name for key ${digit} (empty = clear):`, albums()[digit] || '');
      if (name === null) return;
      const saved = savedAlbums();
      saved[digit] = name.trim();
      try { localStorage.setItem(ALBUMS_KEY, JSON.stringify(saved)); } catch (_) {}
      renderAlbums();
      toast(name.trim() ? `Key ${digit} → "${name.trim()}"` : `Key ${digit} cleared`);
    }

    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

    // Each row of the album picker holds the title and the number of items: find
    // the text node equal to the name and go up to its row.
    function findAlbumEntry(root, name) {
      const want = norm(name);
      for (const leaf of root.querySelectorAll('*')) {
        if (leaf.children.length || norm(leaf.textContent) !== want) continue;
        const row = leaf.closest(CLICKABLE + ', [role="option"], [role="listitem"], li, [tabindex]');
        if (row && root.contains(row)) return row;
      }
      return null;
    }

    function scrollableIn(root) {
      return [root, ...root.querySelectorAll('*')].find((n) =>
        n.scrollHeight > n.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(n).overflowY));
    }

    function closeDialog(d) {
      const b = find(RX.closeDialog, { root: d, by: 'any' });
      if (b) realClick(b); else pressEscape();
    }

    // In the viewer: More options → Add to album. In the grid, with photos
    // selected: Create or add to album → Album. Both open the same picker.
    async function addToAlbum(digit) {
      const name = albums()[digit];
      if (!name) return toast(`No album on key ${digit}: press Shift+${digit} to assign one`, true);

      const grid = !inViewer();
      let ids = [], n = 1;
      if (grid) {
        trackSelection();
        if (!selectionActive()) {
          return toast('Select the photos first: in the grid the number keys work on a selection', true);
        }
        n = selectionSize();
        if (sel.last.length < n) await collectSelection(n);
        ids = [...sel.last];
      }

      const dialogsBefore = new Set(visibleDialogs());
      if (grid) {
        const btn = find(RX.albumBtn, { by: 'aria' });
        if (!btn) {
          if (DEBUG) dump();
          return toast('No "Create or add to album" button', true);
        }
        realClick(btn);
        const item = await waitFor(() => findMenuItem(RX.albumMenuItem), 1500);
        if (!item) {
          logMenuItems();
          pressEscape();
          return toast('No "Album" item in the menu (see console)', true);
        }
        realClick(item);
      } else {
        const more = find(RX.moreBtn, { by: 'aria' });
        if (!more) {
          if (DEBUG) dump();
          return toast('No "More options" button', true);
        }
        realClick(more);
        const item = await waitFor(() => findMenuItem(RX.addToAlbumItem), 1500)
          || findMenuItem(RX.anyAlbumItem);
        if (!item) {
          logMenuItems();
          pressEscape();
          return toast('No "Add to album" item in the menu (see console)', true);
        }
        realClick(item);
      }

      // The picker is the new dialog, usually the one with "New album".
      const picker = await waitFor(() => {
        const fresh = visibleDialogs().filter((d) => !dialogsBefore.has(d));
        return fresh.find((d) => find(RX.newAlbum, { root: d, by: 'any' })) || fresh[fresh.length - 1];
      }, 3000);
      if (!picker) return toast('The album picker did not open', true);

      // The list loads in parts: wait, then scroll if needed.
      let entry = await waitFor(() => findAlbumEntry(picker, name), 1500);
      for (let i = 0; !entry && i < 60; i++) {
        const sc = scrollableIn(picker);
        if (!sc) break;
        const prev = sc.scrollTop;
        sc.scrollTop += sc.clientHeight * 0.8;
        entry = await waitFor(() => findAlbumEntry(picker, name), 300);
        if (!entry && sc.scrollTop === prev) break;   // end of the list
      }
      if (!entry) {
        closeDialog(picker);
        return toast(`Album "${name}" is not in the list`, true);
      }

      entry.scrollIntoView({ block: 'center' });
      realClick(entry);
      await waitFor(() => !isVisible(picker), 3000);
      count('albums', n);
      toast(n > 1 ? `${n} photos added to "${name}"` : `Added to "${name}"`);

      if (ALBUM_THEN === 'stay') return;
      if (grid) return ALBUM_THEN === 'archive' ? archiveAgain(ids, n) : undefined;
      await sleep(300);
      return ALBUM_THEN === 'archive' ? archiveOrSkip() : next();
    }

    // After the album, Google Photos clears the selection: tick the same photos
    // again and archive them. n is the count Google Photos showed. If the
    // script does not know all n photos, or does not find them all again,
    // nothing is archived.
    async function archiveAgain(ids, n) {
      if (ids.length < n) {
        return toast(`The script knows only ${ids.length} of the ${n} photos, nothing archived: archive them by hand`, true);
      }
      const cleared = await waitFor(() => !selectionActive(), 3000);
      if (cleared) {
        await sleep(300);
        await tickPhotos(ids, n);
        const now = googleCount();
        if (now < n) {
          return toast(`Only ${now} of ${n} photos selected again, nothing archived: press R, then A`, true);
        }
        await sleep(500);
      }
      return archive();
    }

    // --- Selecting the same photos again in the grid --------------------------
    // Google Photos clears the selection after an action such as adding to an
    // album. The script keeps the IDs of the photos that were selected, and
    // where each one is in the grid, and R ticks their boxes again.
    // current: the photos ticked now. unticked: photo ID → when its box was
    // seen unticked, kept for UNTICK_GRACE ms. last: the last selection that was
    // not empty. pos: photo ID → its height in the scrolling grid, for every
    // photo seen while photos are selected, ticked or not. when: photo ID → the
    // date and time in its label, for the same photos. count: the number
    // Google Photos showed for last. anchor: the photo of the last click, where
    // a Shift+click range starts. partial: R found only some of the photos, so
    // last and count are kept. ticking: the script is ticking boxes, and the
    // check every 400 ms waits.
    const sel = {
      current: new Set(), unticked: new Map(), last: [], pos: new Map(), when: new Map(),
      count: 0, anchor: null, partial: false, ticking: false, idle: 0, scroller: null,
      countEl: null, countScan: 0,
    };
    // When Google Photos clears a selection, it unticks the boxes on screen a
    // moment before the selection ends. A photo unticked while the selection
    // goes on for this long was unticked by hand, and leaves last.
    const UNTICK_GRACE = 1500;

    // The label of a photo box ends with when it was taken: "16 Aug 2026,
    // 18:39:01" in British English, "16 ago 2026, 18:39:01" in Italian, "Aug 16,
    // 2026, 6:39:01 PM" in American English. The grid is in that order, newest
    // first, so a Shift+click range is every photo between the two times.
    // Returns a number to compare, or null.
    const MONTHS = {
      jan: 0, gen: 0, feb: 1, mar: 2, apr: 3, may: 4, mag: 4, jun: 5, giu: 5, jul: 6, lug: 6,
      aug: 7, ago: 7, sep: 8, set: 8, oct: 9, ott: 9, nov: 10, dec: 11, dic: 11,
    };
    function whenOf(label) {
      const t = /(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([ap])?\.?\s?m?\.?/i.exec(label.slice(-14));
      let d = /(\d{1,2})\s+([a-zà-ÿ]{3,})\.?\s+(\d{4})/i.exec(label);
      let day, mon, year;
      if (d) [, day, mon, year] = d;
      else if ((d = /([a-zà-ÿ]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/i.exec(label))) [, mon, day, year] = d;
      const m = d && MONTHS[mon.slice(0, 3).toLowerCase()];
      if (m === undefined || m === null || !t) return null;
      let h = +t[1] % 24;
      if (t[4] && /p/i.test(t[4]) && h < 12) h += 12;
      if (t[4] && /a/i.test(t[4]) && h === 12) h = 0;
      return Date.UTC(+year, m, +day, h, +t[2], +(t[3] || 0));
    }

    // The box of a photo sits next to the link to the photo, which holds its ID.
    // The box of a whole day has no link that close.
    function photoIdOf(box) {
      for (let p = box, i = 0; p && i < 2; p = p.parentElement, i++) {
        const a = p.querySelector('a[href*="/photo/"]');
        if (a) return (/\/photo\/([^/?#]+)/.exec(a.getAttribute('href')) || [])[1] || null;
      }
      return null;
    }

    const photoBoxes = () => [...document.querySelectorAll('[role="checkbox"]')]
      .map((box) => ({ box, id: photoIdOf(box) })).filter((b) => b.id);

    // The element that scrolls the grid: the first parent of a photo box that
    // can scroll.
    function gridScroller() {
      if (sel.scroller && sel.scroller.isConnected) return sel.scroller;
      const first = photoBoxes()[0];
      for (let n = first && first.box.parentElement; n; n = n.parentElement) {
        if (n.scrollHeight > n.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) {
          return (sel.scroller = n);
        }
      }
      return document.scrollingElement;
    }

    function offsetIn(sc, el) {
      const top = el.getBoundingClientRect().top + sc.scrollTop;
      return sc === document.scrollingElement ? top : top - sc.getBoundingClientRect().top;
    }

    // With the selected photos scrolled away, no box on the page is ticked, but
    // the "Clear selection" button is still at the top.
    // After a selection is cleared, the "Clear selection" button stays in the
    // page with opacity 0: it counts only when it and its parents can be seen.
    const opaque = (el) => {
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        if (getComputedStyle(n).opacity === '0') return false;
      }
      return true;
    };
    const clearSelectionShown = () => [...document.querySelectorAll('button[aria-label], [role="button"][aria-label]')]
      .some((b) => RX.clearSelection.test(ariaOf(b)) && isVisible(b) && opaque(b));

    // A ticked box of a photo in the grid that is drawn. Other checkboxes on the
    // page, and grids hidden with display: none, do not count.
    const tickedPhotoShown = () => [...document.querySelectorAll('[role="checkbox"][aria-checked="true"]')]
      .some((b) => b.getClientRects().length > 0 && photoIdOf(b));

    const selectionActive = () => tickedPhotoShown() || clearSelectionShown();

    // Runs every 400 ms. The grid only keeps the photos near the screen in the
    // page, so a photo scrolled out of view stays in the set until its box is
    // seen unticked. The selection counts as ended after 2 checks in a row
    // find none, since the page can show no selection for a moment. While a
    // dialog is open, such as the album list, the check waits.
    function trackSelection() {
      if (inViewer() || sel.ticking || visibleDialogs().length) return;
      if (!selectionActive()) {
        if (++sel.idle < 2) return;
        sel.current = new Set();
        sel.unticked = new Map();
        sel.partial = false;
        return;
      }
      sel.idle = 0;
      if (!sel.current.size && !sel.unticked.size && !sel.partial) {   // a new selection
        sel.pos = new Map();
        sel.when = new Map();
      }
      const sc = gridScroller();
      const now = Date.now();
      for (const { box, id } of photoBoxes()) {
        sel.pos.set(id, offsetIn(sc, box));
        if (!sel.when.has(id)) sel.when.set(id, whenOf(box.getAttribute('aria-label') || ''));
        if (box.getAttribute('aria-checked') === 'true') {
          sel.current.add(id);
          sel.unticked.delete(id);
        } else if (sel.current.delete(id)) {
          sel.unticked.set(id, now);
        }
      }
      for (const [id, t] of sel.unticked) if (now - t > UNTICK_GRACE) sel.unticked.delete(id);
      if (!sel.partial && (sel.current.size || sel.unticked.size)) {
        sel.last = [...sel.current, ...sel.unticked.keys()];
        const k = googleCount();
        if (k) sel.count = k;
      }
    }

    // Clicks on the boxes, as you make them. A Shift+click ticks or unticks a
    // range of photos, also ones far from the screen that the grid does not
    // keep in the page. The script adds or removes the photos it has seen
    // whose time is in the range. The box of a day does the same for the
    // photos of that day. Google Photos shows the result after a moment, so
    // the script looks 500 ms later.
    document.addEventListener('click', (e) => {
      if (!e.isTrusted || inViewer()) return;
      const box = e.target.closest && e.target.closest('[role="checkbox"]');
      if (!box) return;
      const id = photoIdOf(box);
      const shift = e.shiftKey;
      setTimeout(() => {
        if (sel.ticking) return;
        trackSelection();
        if (id) onPhotoClick(id, shift);
        else onDayClick(box);
      }, 500);
    }, true);

    function setRange(from, to, on) {
      const lo = Math.min(from, to), hi = Math.max(from, to);
      for (const [id, w] of sel.when) {
        if (w === null || w < lo || w > hi) continue;
        if (on) {
          sel.current.add(id);
          sel.unticked.delete(id);
        } else {
          sel.current.delete(id);
        }
      }
    }

    function afterClick() {
      if (sel.partial) return;
      sel.last = [...sel.current, ...sel.unticked.keys()];
      const k = googleCount();
      if (k) sel.count = k;
    }

    function onPhotoClick(id, shift) {
      const w = sel.when.get(id);
      const b = photoBoxes().find((x) => x.id === id);
      const on = b ? b.box.getAttribute('aria-checked') === 'true' : sel.current.has(id);
      if (shift && sel.anchor && sel.anchor.when !== null && w !== null && w !== undefined) {
        setRange(sel.anchor.when, w, on);
        afterClick();
      }
      sel.anchor = { id, when: w === undefined ? null : w };
    }

    // The photos of a day follow the box of the day in the page.
    function onDayClick(dayBox) {
      const boxes = [...document.querySelectorAll('[role="checkbox"]')];
      const first = boxes.slice(boxes.indexOf(dayBox) + 1).find((b) => photoIdOf(b));
      const w = first && whenOf(first.getAttribute('aria-label') || '');
      if (w === null || w === undefined) return;
      const dayStart = w - (w % 86400000);
      setRange(dayStart, dayStart + 86399999, dayBox.getAttribute('aria-checked') === 'true');
      afterClick();
    }

    // The number in "12 selected" at the top, or 0. The element is kept, and
    // the page is searched for it again at most every 2 s.
    function googleCount(fresh = false) {
      const read = (n) => {
        const m = n && n.isConnected && RX.selectedCount.exec(textOf(n));
        return m && isVisible(n) && opaque(n) ? parseInt(m[1].replace(/\D/g, ''), 10) : null;
      };
      const k = read(sel.countEl);
      if (k !== null) return k;
      if (!fresh && Date.now() - sel.countScan < 2000) return 0;
      sel.countScan = Date.now();
      for (const n of document.querySelectorAll('div, span')) {
        if (n.children.length) continue;
        const v = read(n);
        if (v !== null) {
          sel.countEl = n;
          return v;
        }
      }
      return 0;
    }

    // The number of selected photos, or else the boxes seen ticked.
    const selectionSize = () => googleCount() || sel.current.size || 1;

    // Scrolls the grid to y. While it is still loading after a long scroll,
    // Google Photos can put the grid back where it was: then set it again, up
    // to 3 times.
    async function scrollGridTo(sc, y) {
      y = Math.max(0, Math.round(y));
      for (let i = 0; i < 3; i++) {
        sc.scrollTop = y;
        await sleep(150);
        if (Math.abs(sc.scrollTop - y) < 50) return;
      }
    }

    const onScreen = (el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    };

    // Waits up to 3 s for the grid to draw photos on screen at the new place.
    async function gridDrawn() {
      await waitFor(() => photoBoxes().some((b) => onScreen(b.box)), 3000);
      await sleep(200);
    }

    // How far the photos on screen have moved since they were seen: the median
    // of (height now − height seen). The grid above them can change height, for
    // example when a part of it is loaded again.
    function driftHere(sc) {
      const d = photoBoxes().filter((b) => onScreen(b.box) && sel.pos.has(b.id))
        .map((b) => offsetIn(sc, b.box) - sel.pos.get(b.id)).sort((a, b) => a - b);
      return d.length ? d[Math.floor(d.length / 2)] : null;
    }

    // Brings the photo with this ID into the page. It goes to where the photo
    // was seen, moved by the drift of the last photo found. If the photo is
    // not there, the drift of the photos on screen gives a better place, up to
    // 5 times. Then it looks up to 4 screens above and below. Returns the
    // drift of the photo, or null if it was not found.
    async function bringIntoPage(sc, id, drift) {
      const box = () => (photoBoxes().find((b) => b.id === id) || {}).box;
      const seen = sel.pos.get(id);
      const third = sc.clientHeight / 3;
      let y = seen + drift;
      for (let i = 0; i < 5; i++) {
        await scrollGridTo(sc, y - third);
        await gridDrawn();
        if (box()) return offsetIn(sc, box()) - seen;
        const d = driftHere(sc);
        if (d === null || Math.abs(seen + d - y) < third) break;
        y = seen + d;
      }
      for (const k of [1, -1, 2, -2, 3, -3, 4, -4]) {
        await scrollGridTo(sc, y - third + k * sc.clientHeight * 0.8);
        await gridDrawn();
        if (box()) return offsetIn(sc, box()) - seen;
      }
      return null;
    }

    // Before a number key, with fewer photos known than Google Photos counts:
    // scroll through the part of the grid with the selected photos, from 1
    // screen above the first to 1 screen below the last, and note every ticked
    // box. If some are still missing, go on up to 10 screens below and above.
    // Then go back.
    async function collectSelection(n) {
      const sc = gridScroller();
      const start = sc.scrollTop;
      const ys = sel.last.map((id) => sel.pos.get(id)).filter((y) => y !== undefined);
      if (!ys.length) return;
      const step = sc.clientHeight * 0.8;
      const top = Math.min(...ys) - sc.clientHeight, bottom = Math.max(...ys) + sc.clientHeight;
      const visit = async (y) => {
        await scrollGridTo(sc, y);
        await gridDrawn();
        sel.idle = 0;
        trackSelection();
        toast(`Looking for the selected photos: ${sel.last.length} of ${n}`);
      };
      for (let y = top; y <= bottom && sel.last.length < n; y += step) await visit(y);
      for (let i = 1; i <= 10 && sel.last.length < n; i++) await visit(bottom + i * step);
      for (let i = 1; i <= 10 && sel.last.length < n && top - i * step > -step; i++) await visit(top - i * step);
      await scrollGridTo(sc, start);
      await sleep(300);
    }

    // Ticks the photos with these IDs. The ones not on the page are found by
    // scrolling to where they were seen. Then the grid goes back to where it
    // was. Returns how many were found.
    //
    // Google Photos shows a tick a moment after the click. Until then the
    // selection looks empty, so the check every 400 ms waits until the ticks
    // or the "Clear selection" button are there, for up to 2 s.
    // expected: the count Google Photos showed for these photos. If it now
    // shows fewer, the selection counts as partial, and last and count stay.
    // The count at the top catches up with the ticks after a moment: wait up
    // to 3 s for it to reach the number of photos ticked.
    async function tickPhotos(ids, expected) {
      sel.ticking = true;
      try {
        const found = await tickAll(ids);
        await waitFor(selectionActive, 2000);
        await waitFor(() => googleCount() >= found.size, 3000);
        await sleep(300);
        sel.current = found;
        sel.unticked = new Map();
        sel.partial = found.size > 0 && (found.size < ids.length || googleCount() < expected);
        return found.size;
      } finally {
        sel.ticking = false;
      }
    }

    async function tickAll(ids) {
      const want = new Set(ids);
      const found = new Set(), tried = new Set();
      const tickShown = async () => {
        for (const { box, id } of photoBoxes()) {
          if (!want.has(id) || found.has(id)) continue;
          found.add(id);
          if (box.getAttribute('aria-checked') !== 'true') {
            realClick(box);
            await sleep(80);
          }
        }
      };
      await tickShown();
      const sc = gridScroller();
      const start = sc.scrollTop;
      let drift = 0;
      for (;;) {
        const id = ids.filter((x) => !found.has(x) && !tried.has(x) && sel.pos.has(x))
          .sort((a, b) => sel.pos.get(a) - sel.pos.get(b))[0];
        if (!id) break;
        tried.add(id);
        toast(`Selecting the photos again: ${found.size} of ${ids.length}`);
        const d = await bringIntoPage(sc, id, drift);
        if (d !== null) drift = d;
        await tickShown();
      }
      if (Math.abs(sc.scrollTop - start) > 1) {
        await scrollGridTo(sc, start);
        await sleep(300);
      }
      return found;
    }

    async function reselect() {
      if (inViewer()) return toast('R works in the grid: close the photo first', true);
      trackSelection();
      const ids = sel.last;
      // After an R that found only some of the photos, those stay ticked and R
      // goes on with the rest. Otherwise ticked photos are a selection in use.
      // Only the count Google Photos shows at the top stops R: "12 selected".
      const shown = googleCount(true);
      if (shown > 0 && !sel.partial) {
        return toast(`${shown} photos are already selected: clear the selection first (Esc)`, true);
      }
      if (!ids.length) return toast('No earlier selection', true);
      const expected = Math.max(sel.count, ids.length);
      const found = await tickPhotos(ids, expected);
      if (!found) return toast('The photos were not found: scroll to them and press R again', true);
      // Google Photos' own count says how many are selected now.
      const now = googleCount() || found;
      if (now < expected) {
        const why = found < ids.length ? 'scroll to the others and press R again'
          : 'the others were selected while off screen, and the script never saw them';
        return toast(`${now} of ${expected} photos selected again: ${why}`, true);
      }
      toast(`${now} photos selected again`);
    }

    function undo() {
      // The Undo button of the notification at the bottom, not a dialog's Cancel.
      const dialogs = confirmDialogs();
      const candidates = [...document.querySelectorAll(CLICKABLE)].filter(
        (b) => isVisible(b) && RX.undo.test(ariaOf(b) || textOf(b)) && !dialogs.some((d) => d.contains(b))
      );
      const btn = candidates[candidates.length - 1];
      if (!btn) return toast('Nothing to undo', true);
      realClick(btn);
      const last = history.pop();
      if (last) bump(last[0], -last[1]);
      toast('Undone ↶');
    }

    function openNext() {
      const btn = find(RX.nextBtn, { by: 'aria' });
      if (btn) realClick(btn);
      else sendKey({ key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 });
      return true;
    }

    function next() {
      openNext();
      count('kept');
      renderHud();
      return true;
    }

    // --- Comparison mode -------------------------------------------------------
    // Photo A stays on the left, the open photo (B) is on the right. When A is
    // kept, it is compared with the next photo, which handles bursts of 3 or more.
    const dup = { on: false, a: null, b: null, lastUrl: null, staleSrc: null, timer: null, ui: null };
    const inViewer = () => location.pathname.includes('/photo/');

    // Opacity is checked here: the viewer keeps the neighbouring photos in the
    // DOM, transparent, in the same place as the one shown.
    function imgShown(img) {
      const r = img.getBoundingClientRect();
      if (r.width < 50 || r.height < 50) return false;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
      for (let n = img; n && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
      }
      return true;
    }

    // The open photo is the largest visible image (leaving out our overlay).
    function currentPhoto() {
      let best = null, bestArea = 0;
      for (const img of document.images) {
        if (img.closest('#gpqk-dup') || !imgShown(img)) continue;
        const r = img.getBoundingClientRect();
        const area = (Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
        if (area > bestArea) { best = img; bestArea = area; }
      }
      if (!best || bestArea < 200 * 200) return null;
      const holder = best.closest('[aria-label]');
      const label = best.alt || (holder ? ariaOf(holder) : '');
      return { url: location.href, src: best.currentSrc || best.src, label };
    }

    function dupUI() {
      if (dup.ui) return dup.ui;
      const pane = (tag) => {
        const img = el('img');
        const cap = el('div', { className: 'gpqk-cap' });
        return { img, cap, root: el('div', { className: 'gpqk-pane' }, [el('div', { className: 'gpqk-tag', textContent: tag }), img, cap]) };
      };
      const left = pane('A  ←');
      const right = pane('→  B');
      const bar = el('div', { className: 'gpqk-dupbar' }, [
        el('kbd', { textContent: '←' }), ' keep A, delete B     ',
        el('kbd', { textContent: '→' }), ' keep B, delete A     ',
        el('kbd', { textContent: '↓' }), ' / ', el('kbd', { textContent: 'Space' }), ' keep both     ',
        el('kbd', { textContent: 'Esc' }), ' leave',
      ]);
      const root = el('div', { id: 'gpqk-dup' }, [left.root, right.root, bar]);
      document.body.append(root);
      dup.ui = { root, left, right };
      return dup.ui;
    }

    function showPhoto(pane, ph) {
      if (!ph) {
        pane.img.removeAttribute('src');
        pane.cap.textContent = 'loading…';
        return;
      }
      if (pane.img.getAttribute('src') !== ph.src) pane.img.src = ph.src;
      pane.cap.textContent = ph.label || '';
    }

    // Keeps pane B up to date. After the photo changes, the previous image can stay
    // on screen for a moment: it is skipped until the new one is there.
    function syncDup() {
      if (!dup.on) return;
      if (!inViewer()) return exitDup('The viewer was closed');
      if (location.href !== dup.lastUrl) {
        dup.staleSrc = dup.b ? dup.b.src : dup.staleSrc;
        dup.lastUrl = location.href;
        dup.b = null;
        showPhoto(dup.ui.right, null);
      }
      if (location.href === dup.a.url) return;     // back on A to delete it
      const cur = currentPhoto();
      if (cur && cur.src !== dup.a.src && cur.src !== dup.staleSrc) {
        dup.b = cur;
        showPhoto(dup.ui.right, cur);
      }
    }

    async function go(rx, key, keyCode) {
      const before = location.href;
      const btn = find(rx, { by: 'aria' });
      if (btn) realClick(btn);
      else sendKey({ key, code: key, keyCode });
      return waitFor(() => location.href !== before, ADVANCE_TIMEOUT);
    }
    const goNext = () => go(RX.nextBtn, 'ArrowRight', 39);
    const goPrev = () => go(RX.prevBtn, 'ArrowLeft', 37);

    function setA(ph) {
      dup.a = ph;
      showPhoto(dup.ui.left, ph);
    }

    async function toggleDup() {
      if (dup.on) return exitDup();
      if (!inViewer()) return toast('Open a photo first', true);
      const a = currentPhoto();
      if (!a) return toast('No photo found on screen', true);
      dupUI().root.style.display = '';
      Object.assign(dup, { on: true, b: null, lastUrl: location.href, staleSrc: a.src });
      setA(a);
      showPhoto(dup.ui.right, null);
      dup.timer = setInterval(syncDup, 200);
      toast('Comparison mode');
      if (!(await goNext())) exitDup('No more photos');
    }

    function exitDup(msg) {
      if (!dup.on) return;
      dup.on = false;
      clearInterval(dup.timer);
      dup.ui.root.style.display = 'none';
      toast(msg || 'Comparison mode closed', !!msg);
    }

    function needB() {
      if (dup.b && dup.b.url === location.href) return true;
      toast('Wait for photo B to load', true);
      return false;
    }

    // ← : delete B (the open photo); A stays and is compared with the next one.
    async function dupKeepA() {
      if (!needB()) return;
      const before = location.href;
      if (!(await trash())) return exitDup('The delete was not confirmed: check the page');
      await waitFor(() => location.href !== before, ADVANCE_TIMEOUT);
      if (location.href === before || location.href === dup.a.url) exitDup('No more photos');
    }

    // → : go back to A, delete it, then B becomes the new A.
    async function dupKeepB() {
      if (!needB()) return;
      const b = dup.b;
      await goPrev();
      if (location.href !== dup.a.url) {
        return toast('Could not go back to photo A: nothing deleted', true);
      }
      await sleep(300);
      if (!(await trash())) return exitDup('The delete was not confirmed: check the page');
      await waitFor(() => location.href !== dup.a.url, ADVANCE_TIMEOUT);
      if (location.href !== b.url) {
        return exitDup('After deleting, the open photo is not B: check the page');
      }
      setA(b);
      await sleep(300);
      if (!(await goNext())) exitDup('No more photos');
    }

    // ↓ / Space : different photos, keep both. B becomes the new A.
    async function dupKeepBoth() {
      if (!needB()) return;
      count('kept');
      setA(dup.b);
      if (!(await goNext())) exitDup('No more photos');
    }

    const DUP_ACTIONS = {
      arrowleft: dupKeepA,
      arrowright: dupKeepB,
      arrowdown: dupKeepBoth,
      ' ': dupKeepBoth,
      escape: () => exitDup(),
    };

    // ---------------------------------------------------------------------------
    // Panel (counts and key list) and messages
    // ---------------------------------------------------------------------------
    const el = (tag, props = {}, children = []) => {
      const n = document.createElement(tag);
      Object.assign(n, props);
      for (const c of children) n.append(c);
      return n;
    };

    document.head.append(el('style', {
      textContent: `
        #gpqk-hud {
          position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
          background: rgba(32,33,36,.92); color: #fff; font: 12px/1.6 system-ui, sans-serif;
          padding: 10px 12px; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,.35);
          pointer-events: none; min-width: 170px; padding-top: 14px;
        }
        #gpqk-hud b { color: #8ab4f8; }
        #gpqk-hud kbd {
          display: inline-block; min-width: 14px; text-align: center; padding: 0 4px; margin-right: 2px;
          border: 1px solid #5f6368; border-radius: 4px; background: #3c4043; font: inherit;
        }
        #gpqk-hud { transition: box-shadow .1s; }
        #gpqk-hud.gpqk-wait { box-shadow: 0 0 0 2px #fbbc04, 0 4px 16px rgba(0,0,0,.35); }
        #gpqk-hud.gpqk-busy { box-shadow: 0 0 0 3px #d93025, 0 4px 16px rgba(0,0,0,.35); }
        #gpqk-hud .gpqk-help { margin-top: 6px; }
        #gpqk-hud.gpqk-counts .gpqk-help { display: none !important; }
        #gpqk-hud.gpqk-gone { display: none !important; }
        #gpqk-hud .gpqk-offline { display: none; }
        #gpqk-hud.gpqk-off { opacity: .85; }
        #gpqk-hud.gpqk-off > :not(.gpqk-offline):not(.gpqk-power) { display: none !important; }
        #gpqk-hud.gpqk-off .gpqk-offline { display: block; padding-right: 22px; }
        #gpqk-hud .gpqk-power {
          position: absolute; top: 4px; right: 4px; pointer-events: auto; cursor: pointer;
          width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%;
          background: transparent; color: #8ab4f8; font: 13px/20px system-ui, sans-serif;
        }
        #gpqk-hud.gpqk-off .gpqk-power { color: #9aa0a6; }
        #gpqk-hud .gpqk-power:hover { background: #3c4043; }
        #gpqk-hud .gpqk-stats {
          display: grid; grid-template-columns: auto repeat(5, minmax(26px, auto));
          column-gap: 8px; text-align: right; font-variant-numeric: tabular-nums;
        }
        #gpqk-hud .gpqk-stats span:nth-child(6n+1) { text-align: left; color: #bdc1c6; }
        #gpqk-hud .gpqk-left { margin-top: 4px; padding-top: 4px; border-top: 1px solid #5f6368; }
        #gpqk-hud .gpqk-albums { border-top: 1px solid #5f6368; padding-top: 6px; }
        #gpqk-dup {
          position: fixed; inset: 0; z-index: 2147483646; background: rgba(0,0,0,.95);
          display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr auto;
          gap: 12px; padding: 64px 16px 16px; box-sizing: border-box;
          font: 13px/1.5 system-ui, sans-serif; color: #e8eaed;
        }
        #gpqk-dup .gpqk-pane {
          position: relative; min-height: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center; border: 1px solid #3c4043; border-radius: 10px;
          overflow: hidden; background: #111;
        }
        #gpqk-dup .gpqk-pane img { max-width: 100%; max-height: calc(100% - 28px); object-fit: contain; }
        #gpqk-dup .gpqk-tag {
          position: absolute; top: 8px; left: 8px; background: #1a73e8; color: #fff;
          font-weight: 700; padding: 2px 10px; border-radius: 12px;
        }
        #gpqk-dup .gpqk-cap { padding: 4px 8px; color: #bdc1c6; text-align: center; font-size: 12px; }
        #gpqk-dup .gpqk-dupbar { grid-column: 1 / -1; text-align: center; padding-bottom: 4px; white-space: pre-wrap; }
        #gpqk-dup kbd {
          display: inline-block; min-width: 14px; text-align: center; padding: 0 6px;
          border: 1px solid #5f6368; border-radius: 4px; background: #3c4043; font: inherit;
        }
        #gpqk-toast {
          position: fixed; left: 50%; top: 24px; transform: translateX(-50%); z-index: 2147483647;
          background: #1a73e8; color: #fff; font: 600 14px system-ui, sans-serif;
          padding: 8px 16px; border-radius: 20px; opacity: 0; transition: opacity .15s;
          pointer-events: none;
        }
        #gpqk-toast.show { opacity: 1; }
        #gpqk-toast.warn { background: #d93025; }
      `,
    }));

    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const toggleLabel = [TOGGLE_KEY.shift && 'Shift', TOGGLE_KEY.alt && (isMac ? 'Option' : 'Alt'),
      TOGGLE_KEY.code.replace(/^(Key|Digit)/, '')].filter(Boolean).join('+');
    const statsLine = el('div');
    const leftLine = el('div', { className: 'gpqk-left' });
    const keyLabel = (x) => (x === ' ' ? 'Space' : x.toUpperCase());
    const helpRow = (action, label) =>
      el('div', {}, [...KEYS[action].map((x) => el('kbd', { textContent: keyLabel(x) })), ' ' + label]);
    const help = el('div', { className: 'gpqk-help' }, [
      helpRow('archive', 'archive'),
      helpRow('trash', AUTO_CONFIRM_TRASH ? 'delete (confirmed)' : 'delete'),
      helpRow('favorite', 'favourite'),
      helpRow('next', 'keep, next photo'),
      helpRow('undo', 'undo'),
      helpRow('dupMode', 'compare similar photos'),
      helpRow('setLeft', 'set photos left'),
      helpRow('reselect', 'grid: select the last photos again'),
      helpRow('select', 'viewer: select the open photo'),
      helpRow('toggleHud', 'panel: full, counts only, hidden'),
      el('div', {}, [el('kbd', { textContent: toggleLabel }), ' all keys on/off']),
      el('div', {}, [el('kbd', { textContent: '1–9' }), ' album  ', el('kbd', { textContent: 'Shift+1–9' }), ' assign']),
    ]);
    const albumsBox = el('div', { className: 'gpqk-help gpqk-albums' });
    // The only part of the panel that takes the mouse: a click turns the keys on/off.
    const power = el('button', { className: 'gpqk-power', type: 'button', textContent: '⏻', title: `QuickKeys on/off (${toggleLabel})` });
    power.addEventListener('click', () => toggleEnabled());
    const offLine = el('div', { className: 'gpqk-offline' }, ['QuickKeys off · ', el('kbd', { textContent: toggleLabel })]);
    const hud = el('div', { id: 'gpqk-hud' }, [power, offLine, statsLine, leftLine, help, albumsBox]);

    function renderAlbums() {
      const entries = Object.entries(albums()).sort(([a], [b]) => a.localeCompare(b));
      albumsBox.replaceChildren(...entries.map(([d, n]) => el('div', {}, [el('kbd', { textContent: d }), ' ' + n])));
      albumsBox.style.display = entries.length ? '' : 'none';
    }
    const toastEl = el('div', { id: 'gpqk-toast' });
    document.body.append(hud, toastEl);

    function renderHud() {
      const s = loadStats();
      const rows = [
        ['', ...['📦', '🗑', '✓', '★', '🗂']],
        ['Session', ...FIELDS.map((f) => stats[f])],
        ['Today', ...FIELDS.map((f) => (s.days[today()] || {})[f] || 0)],
        ['Total', ...FIELDS.map((f) => s.total[f])],
      ];
      statsLine.replaceChildren(el('div', { className: 'gpqk-stats' },
        rows.flatMap((r, i) => r.map((c, j) =>
          i && j ? el('b', { textContent: c }) : el('span', { textContent: c })))));
      renderLeft();
    }

    // "Left: 12,345 (37% done) · about 3 h 20 min at this pace". The time appears
    // after 10 photos sorted in this session.
    function renderLeft() {
      const pl = photosLeft();
      leftLine.style.display = pl ? '' : 'none';
      if (!pl) return;
      const done = pl.start ? Math.round((100 * (pl.start - pl.left)) / pl.start) : 100;
      const parts = ['Left: ', el('b', { textContent: pl.left.toLocaleString('en-GB') }), ` (${done}% done)`];
      const sorted = sortedOf(stats);
      if (sorted >= 10 && pl.left > 0) {
        const mins = Math.round((pl.left * (Date.now() - sessionStart)) / sorted / 60000);
        const time = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
        parts.push(` · about ${time} at this pace`);
      }
      leftLine.replaceChildren(...parts);
    }

    // Another tab has changed the counts.
    window.addEventListener('storage', (e) => { if (e.key === STATS_KEY || e.key === LEFT_KEY) renderHud(); });

    // H goes round three panel modes: everything, counts only, hidden.
    const HUD_MODES = ['full', 'counts', 'hidden'];
    const HUD_MODE_TEXT = { full: 'Panel: counts and keys', counts: 'Panel: counts only', hidden: 'Panel hidden (H to show)' };
    let hudMode = 'full';
    try {
      hudMode = localStorage.getItem('gpqk-hud-mode')
        || (localStorage.getItem('gpqk-hud-hidden') === '1' ? 'counts' : 'full');
    } catch (_) {}
    if (!HUD_MODES.includes(hudMode)) hudMode = 'full';

    function applyHudMode() {
      hud.classList.toggle('gpqk-counts', hudMode === 'counts');
      hud.classList.toggle('gpqk-gone', hudMode === 'hidden');
    }
    applyHudMode();

    function toggleHud() {
      hudMode = HUD_MODES[(HUD_MODES.indexOf(hudMode) + 1) % HUD_MODES.length];
      applyHudMode();
      try { localStorage.setItem('gpqk-hud-mode', hudMode); } catch (_) {}
      toast(HUD_MODE_TEXT[hudMode]);
    }

    // Alt+K (Option+K on a Mac): all keys on or off. Saved in the browser.
    let enabled = true;
    try { enabled = localStorage.getItem('gpqk-enabled') !== '0'; } catch (_) {}

    function applyEnabled() {
      hud.classList.toggle('gpqk-off', !enabled);
    }
    applyEnabled();

    function toggleEnabled() {
      enabled = !enabled;
      try { localStorage.setItem('gpqk-enabled', enabled ? '1' : '0'); } catch (_) {}
      if (!enabled && dup.on) exitDup();
      applyEnabled();
      toast(enabled ? 'QuickKeys on' : `QuickKeys off (${toggleLabel} to turn on)`, !enabled);
    }

    let toastTimer;
    function toast(msg, warn = false) {
      toastEl.textContent = msg;
      toastEl.classList.toggle('warn', warn);
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), warn ? 2000 : 900);
      renderHud();
    }

    renderHud();
    renderAlbums();

    // ---------------------------------------------------------------------------
    // Keyboard
    // ---------------------------------------------------------------------------
    const ACTIONS = { archive, trash, favorite, undo, next, toggleHud, dupMode: toggleDup, setLeft, reselect, select: selectOpen };
    setInterval(trackSelection, 400);
    const keyMap = new Map();
    for (const [action, keys] of Object.entries(KEYS)) {
      for (const key of keys) keyMap.set(key, ACTIONS[action]);
    }

    // Actions that move to the next photo return true. Before taking another key,
    // wait until Google Photos has opened the next photo: otherwise the requests
    // pile up and the page hangs while it works through them.
    const ADVANCE_TIMEOUT = 5000;  // longest wait for the next photo, in ms
    const MIN_GAP = 300;           // shortest gap between two actions, in ms

    async function waitForAdvance(before) {
      if (!location.pathname.includes('/photo/')) return sleep(600); // grid: no address to watch
      const changed = await waitFor(() => location.href !== before, ADVANCE_TIMEOUT, 50);
      if (!changed) {
        log('the photo did not change within', ADVANCE_TIMEOUT, 'ms');
        toast('Google Photos is slow: waiting before the next key', true);
      }
    }

    let busy = false;

    onKey = async (e) => {
      if (!e.isTrusted) return;                       // skip the keys this script sends

      if (e.code === TOGGLE_KEY.code && e.altKey === TOGGLE_KEY.alt && e.shiftKey === TOGGLE_KEY.shift
          && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) toggleEnabled();
        return;
      }
      if (!enabled) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (typingIn(e)) return;
      if (confirmDialogs().length) return;            // leave open dialogs alone

      // Digits come from e.code: with Shift, e.key is "!", "\"" and so on, depending on the layout.
      const digit = (/^(?:Digit|Numpad)([1-9])$/.exec(e.code) || [])[1];
      let fn;
      if (digit) fn = e.shiftKey ? () => assignAlbum(digit) : () => addToAlbum(digit);
      else if (!e.shiftKey) {
        const k = e.key.toLowerCase();
        fn = (dup.on && DUP_ACTIONS[k]) || keyMap.get(k);
      }
      if (!fn) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;                           // key held down: one action only
      if (busy) {
        hud.classList.add('gpqk-busy');
        return;
      }
      busy = true;
      hud.classList.add('gpqk-wait');
      const before = location.href;
      log('action', fn.name);
      try {
        const advanced = await fn();
        if (advanced === true) await waitForAdvance(before);
        await sleep(MIN_GAP);
      } catch (err) {
        console.error('[GPQK]', err);
        toast('Error: ' + err.message, true);
      } finally {
        busy = false;
        hud.classList.remove('gpqk-wait', 'gpqk-busy');
      }
    };

    log('loaded. Type gpqkDump() in the console to list the visible buttons');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main, { once: true });
  else main();
})();
