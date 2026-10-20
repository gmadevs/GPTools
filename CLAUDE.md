# GPTools

One userscript, `google-photos-quickkeys.user.js`, with no build step. Google Photos enforces
Trusted Types: build DOM with `createElement` and `textContent`, never `innerHTML`.

Release: bump `@version`, commit, run `./release.sh`.

## Writing rules for the README

- Headings say what the section covers.
- Say what the script does and how to use it. One point per sentence.
- No em dashes, no "not X, but Y", no closing morals. The script and the page do not "want"
  or "know" things.
- Bold only for interface labels, exactly as Google Photos or the panel shows them, and for
  real warnings.
- Numbers instead of adjectives (timeouts, delays, counts), checked against the code.
- British spelling, as in the other gmadevs repositories.

Run `node ~/.claude/skills/plain-docs/scripts/prose.mjs README.md` on any change to the README.
