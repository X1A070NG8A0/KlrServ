# Refactor plan: modern platform features

Status: done on 2026-11-17 (all four passes, htmx 4.0.1, JavaScript with JSDoc).

This plan maps the "Frameworkless Web Development: Modern Platform Features"
document onto the site code. The goal is a light, readable, static hypermedia
document. Each pass groups the features that change the same code, so that
each file changes one time.

## What the site uses now

| Part | Size | Notes |
| --- | --- | --- |
| `site/client/main.ts` | 278 lines | Checklists, filters, search, popup windows, two old side-panel handlers |
| `site/static/style.css` | 261 lines | Grew by appends. The dark tokens are in two blocks. Some rules have no markup now. |
| htmx 2.0.4 | 50.9 KB, 16.4 KB gzip | Used by 18 links on the maintenance page only |
| `tsc` | build step | Compiles `main.ts` to `dist/assets/main.js` |

The popup windows are the main interactive feature, and they do not use htmx.
htmx loads one milestone checklist into the maintenance page. The `?mi=9000`
address works only because `initMilestoneFromUrl` repeats the htmx request
in JavaScript.

The code has these defects now:

- A popup body is set with `innerHTML`. htmx does not process it, so an `hx-` link in a popup does nothing.
- Each new popup increases a z-index counter. Page content with a higher z-index can cover a popup.
- `htmx:beforeRequest` and `htmx:targetError` handle a side panel that the site no longer has.
- About 20 CSS rules style markup that the build no longer writes (`.split`, `.panel`, `.dep .pop`, `[data-theme]`).
- Each block of new content needs a manual call to `initChecklists`: on load, after an htmx swap, and after a popup loads.
- On narrow screens, figure and diagram layouts use `@media`. A popup is narrow on a wide screen, so the layout in a popup does not change.

## What htmx does with these features

These findings come from the htmx documentation and release notes.

- htmx 4.0.0 was released on 2026-08-28. It uses `fetch()`. It removes the history snapshots in `localStorage`. When you go back, htmx requests the page again. ([release](https://four.htmx.org/announcements/2026-08-28-htmx-4.0.0-is-released), [migration guide](https://four.htmx.org/migration-guide-htmx-2))
- In htmx 4, attribute inheritance is explicit (`hx-target:inherited`). The event names change to the `htmx:phase:action` pattern. The site uses no inheritance. Pass 1 removes the three htmx events that the site uses.
- The htmx 4 migration guide says that view transitions are on by default for swaps. One older release note says that this was not decided. Pass 2 sets it explicitly.
- A reported htmx 4 beta build is 33.3 KB raw and 11.6 KB gzip. ([guide](https://zenn.dev/nonejp/articles/c99d12985a543c)) Pass 2 measures the release file.
- htmx does not look inside a shadow root. A component with Shadow DOM must call `htmx.process(shadowRoot)`, and `hx-target` cannot see out of the shadow root without `host` or `global`. ([htmx web components](https://htmx.org/examples/web-components/)) Light DOM components do not have this problem.
- A custom element runs `connectedCallback` each time that htmx or a popup inserts it. Thus a component starts itself, and the manual re-init calls go away.
- Cross-document view transitions and htmx swap transitions use the same CSS (`view-transition-name`). One set of rules covers both.
- Speculation Rules prerender full page loads. `hx-boost` replaces full page loads with fetches, so the two features work against each other. The site does not use `hx-boost`.

## Pass 1: Interaction layer

Features: light DOM custom elements, Popover API, anchor positioning,
invoker commands, pointer events, `AbortController` with `{signal}`, `:has()`.

These features change the same code: the popup manager, the checklist code and
the markup that the build writes for them. Do them as one pass.

| Element | Replaces | Platform features |
| --- | --- | --- |
| `<check-list>` | `initChecklists`, the `.done` class, three init calls | `connectedCallback`, `:has(input:checked)` |
| `<list-filter>` | `initFilters` | `connectedCallback` |
| `<site-search>` | `initSearch` | `connectedCallback`, `AbortController` |
| `<pop-window>` | `openWin`, `placeWin`, the z-index counter, `makeDraggable` | `popover="manual"`, anchor positioning, `command`/`commandfor`, pointer capture |

How the popup windows change:

- Each window is `popover="manual"`. A manual popover goes into the top layer, so no page content covers it. It does not close on an outside click, so pinned windows stay.
- The close button is `<button command="hide-popover" commandfor="...">`. The pin button sends a custom command (`--pin`). No click handlers are necessary.
- Anchor positioning puts the window below its link and flips it above if there is no space. The JavaScript placement stays as a fallback for browsers without `anchor-name`.
- Drag uses pointer events with `setPointerCapture`. Touch and pen then also work. An `AbortController` removes the drag listeners.
- A click on a window brings it to the front. The code hides the popover and shows it again, which moves it to the top of the top layer.
- After a fragment loads, the code calls `htmx.process(body)`, so `hx-` links in a popup work.

The hover behavior stays the same: 220 ms delay, nested windows, close on
pointer exit, Escape closes unpinned windows. The checklist behavior stays
the same: ticked items cross out and move to the end of the list.

Not used: Shadow DOM, Declarative Shadow DOM, `adoptedStyleSheets` and
`ElementInternals`. The site has one global stylesheet, and the components
hold server-written content. Shadow DOM would hide that content from the
stylesheet and from htmx. `interestfor` (hover popovers without JavaScript)
is in Chrome 142 only, so the hover code stays.

| Cost | Benefit |
| --- | --- |
| Rewrite of about 280 lines into about 230 lines in 5 files | No init plumbing: content starts itself wherever it is inserted |
| `build.ts` writes 4 new element names | Popups always on top, no z-index counter |
| Popup behavior can regress. It needs a test in the browser pane, and that pane is Chromium only. | Touch drag, native close command, `hx-` links work in popups |
| Anchor positioning is new in Firefox (147, January 2026) and Safari (26) | Removes about 15 lines of placement math in supporting browsers |

## Pass 2: Hypermedia navigation

Features: real addresses for each milestone, htmx 4 (or no htmx),
cross-document view transitions, bfcache.

- The build writes `/maintenance/9000.html` and the other 17 milestone pages as full pages. Each page has its checklist already in place.
- The milestone links become `<a href="/maintenance/9000.html">` with `hx-get` to the fragment and `hx-push-url` to the page. Without JavaScript, the link opens the full page. With htmx, only the checklist changes.
- `initMilestoneFromUrl` goes away. The back button works because each pushed address is a real page.
- `@view-transition { navigation: auto; }` gives a cross-fade between pages. The header has a `view-transition-name`, so it stays still. `prefers-reduced-motion` turns the transitions off.
- bfcache: the site has no `unload` handler and no `no-store` header. No change is necessary.

Not used: Speculation Rules. The server is on `127.0.0.1`, so a page loads in
a few milliseconds. Prerender gives no visible gain. Navigation API and
`URLPattern` are for single-page apps.

| Cost | Benefit |
| --- | --- |
| 18 more pages in `dist/` (about 300 KB) | Every address works without JavaScript and after a reload |
| htmx 4 is a major version. The site uses a small part of it. | htmx 4 is about 30% smaller and keeps no snapshots in `localStorage` |
| Cross-document transitions are partial in Firefox | No JavaScript for page transitions, and older browsers ignore the rule |

## Pass 3: Stylesheet

Features: `@layer`, nesting, `light-dark()`, container queries, `:has()`,
`@starting-style`, `text-wrap`.

- `@layer tokens, base, layout, components, popups` sets the order of the rules. A later rule then does not need a more specific selector to win.
- `color-scheme: light dark` and `light-dark()` put each color in one token. The two dark blocks go away. Nothing sets `data-theme`, so those selectors go away.
- Container queries replace the `@media` rules for figure cards, diagrams and tool cards. The same content then fits in a popup and in a page.
- `@starting-style` gives a short fade when a popup opens.
- `text-wrap: balance` for headings and `text-wrap: pretty` for paragraphs.
- The dead rules go away.

Pass 3 depends on the element names from Pass 1. If you do both, do Pass 3
directly after Pass 1.

| Cost | Benefit |
| --- | --- |
| Rewrite of 261 lines, probably to about 210 | One place for each rule, readable by section |
| Small visual changes are possible. Each page type needs a look. | Content in popups uses the narrow layout |

## Pass 4: Client source and modules

Features: ES modules without a bundler, and one of three source formats.

The browser cannot run TypeScript. There are three choices:

1. Keep TypeScript. `build.ts` removes the types with `stripTypeScriptTypes` from `node:module`, which Node 26 has. `tsc` stays for `npm run check` only. Node marks this function experimental.
2. Change the client to JavaScript with JSDoc types and `// @ts-check`. The file that you read is the file that runs. `tsc --noEmit` still checks the types.
3. Keep the `tsc` compile step as it is.

Each custom element from Pass 1 becomes its own module file. The browser loads
them with `import`. No bundler and no import map are necessary.

| Cost | Benefit |
| --- | --- |
| Choice 1 depends on an experimental Node function | One build command, no compile step for the client |
| Choice 2 puts types in comments, which is more verbose | Source and served file are the same |
| 5 small requests in place of 1 | Each file has one job |

## Baseline status of the features in this plan

Check the status again before you depend on a feature. Sources: MDN, caniuse
and web.dev, read on 2026-11-17.

| Feature | Status |
| --- | --- |
| Custom elements, ES modules, `:has()`, nesting, `@layer`, container queries | Widely available |
| Popover API, `light-dark()`, `@starting-style`, `text-wrap` | Available in all three engines |
| Same-document view transitions | Newly available (Firefox 144, October 2025) |
| Anchor positioning | All three engines since Firefox 147 (January 2026). Some trackers still show "limited". |
| Invoker commands (`command`, `commandfor`) | Chrome 135 and Firefox 144. Make sure that your Safari version has it. |
| Cross-document view transitions | Chrome and Safari. Partial in Firefox. |
| `interestfor` | Chrome 142 only. Not used. |
| Speculation Rules | Chromium only. Not used. |
