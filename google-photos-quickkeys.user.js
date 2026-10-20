// ==UserScript==
// @name         Google Photos QuickKeys
// @namespace    https://github.com/gmadevs/GPTools
// @homepageURL  https://github.com/gmadevs/GPTools
// @supportURL   https://github.com/gmadevs/GPTools/issues
// @downloadURL  https://raw.githubusercontent.com/gmadevs/GPTools/main/google-photos-quickkeys.user.js
// @updateURL    https://raw.githubusercontent.com/gmadevs/GPTools/main/google-photos-quickkeys.user.js
// @license      MIT
// @version      0.8.0
// @description  Single keys for sorting photos on Google Photos: archive, delete with the dialog confirmed, favourite and archive, albums on keys 1-9, side-by-side comparison of similar photos, saved counts and photos left.
// @match        https://photos.google.com/*
// @run-at       document-idle
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
  };
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
  const ALBUM_THEN_NEXT = false;     // true = go to the next photo after adding

  // Button labels in Italian and English Google Photos.
  const RX = {
    trashBtn: /^(elimina|delete|sposta nel cestino|move to trash|cestino|trash)$/i,
    moreBtn: /^(altre opzioni|more options|altro|more)$/i,
    // No \b: the item text runs into the shortcut shown beside it ("ArchiveShift+A").
    archiveItem: /^\s*(archivia|archive)(?!zion|d)/i,
    confirmTrash: /(sposta nel cestino|nel cestino|move to trash|^elimina|^delete|rimuovi|remove)/i,
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
  };

  const log = (...a) => DEBUG && console.log('%c[GPQK]', 'color:#1a73e8;font-weight:bold', ...a);

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

  const isTyping = (el) => {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  };

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

  function count(field) {
    if (!sessionStart) sessionStart = Date.now();
    bump(field, 1);
    history.push(field);
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

  async function archive() {
    const more = find(RX.moreBtn, { by: 'aria' });
    if (more) {
      realClick(more);
      const item = await waitFor(() => findMenuItem(RX.archiveItem), 1500);
      if (!item) logMenuItems();
      if (item) {
        realClick(item);
        count('archived');
        toast('Archived');
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
    return FAVORITE_THEN === 'archive' ? archive() : next();
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

  async function addToAlbum(digit) {
    const name = albums()[digit];
    if (!name) return toast(`No album on key ${digit}: press Shift+${digit} to assign one`, true);

    const more = find(RX.moreBtn, { by: 'aria' });
    if (!more) {
      if (DEBUG) dump();
      return toast('No "More options" button', true);
    }
    const dialogsBefore = new Set(visibleDialogs());
    realClick(more);
    const item = await waitFor(() => findMenuItem(RX.addToAlbumItem), 1500)
      || findMenuItem(RX.anyAlbumItem);
    if (!item) {
      logMenuItems();
      pressEscape();
      return toast('No "Add to album" item in the menu (see console)', true);
    }
    realClick(item);

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
    count('albums');
    toast(`Added to "${name}"`);

    if (ALBUM_THEN_NEXT) {
      await sleep(300);
      return next();
    }
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
    if (last) bump(last, -1);
    toast('Undone ↶');
  }

  function next() {
    const btn = find(RX.nextBtn, { by: 'aria' });
    if (btn) realClick(btn);
    else sendKey({ key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 });
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
        pointer-events: none; min-width: 170px;
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
      #gpqk-hud.hidden .gpqk-help { display: none !important; }
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
    helpRow('toggleHud', 'show/hide this list'),
    el('div', {}, [el('kbd', { textContent: '1–9' }), ' album  ', el('kbd', { textContent: 'Shift+1–9' }), ' assign']),
  ]);
  const albumsBox = el('div', { className: 'gpqk-help gpqk-albums' });
  const hud = el('div', { id: 'gpqk-hud' }, [statsLine, leftLine, help, albumsBox]);

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

  let hudHidden = false;
  try { hudHidden = localStorage.getItem('gpqk-hud-hidden') === '1'; } catch (_) {}
  hud.classList.toggle('hidden', hudHidden);

  function toggleHud() {
    hudHidden = !hudHidden;
    hud.classList.toggle('hidden', hudHidden);
    try { localStorage.setItem('gpqk-hud-hidden', hudHidden ? '1' : '0'); } catch (_) {}
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
  const ACTIONS = { archive, trash, favorite, undo, next, toggleHud, dupMode: toggleDup, setLeft };
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

  window.addEventListener('keydown', async (e) => {
    if (!e.isTrusted) return;                       // skip the keys this script sends
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e.target) || isTyping(document.activeElement)) return;
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
  }, true);

  log('loaded. Type gpqkDump() in the console to list the visible buttons');
})();
