# Browser tests

These tests use the web build of Ciphwren Desktop in a headless Chromium, against an Etebase test
server, the way a person would: logging in, writing notes offline, two devices changing the same
note, notebooks, navigation, and so on. Every check prints `ok` or `FAIL`, and a test fails when any
of its checks does.

They change the data of the test account, so never point them at a real server or account.

## Running them

1. An Etebase test server that allows signing up, e.g. the `test-server` image of our Etebase server
   (`docker/test-server` in its repository), on `http://127.0.0.1:3735`:

   ```
   docker build -t etebase-test-server -f docker/test-server/Dockerfile https://github.com/nikossvnk/ciphwren-server.git
   docker run -d --name etebase-test -p 127.0.0.1:3735:3735 etebase-test-server
   ```

2. The web build of the app, served on `http://localhost:8765`:

   ```
   npx expo export --platform web --output-dir web-build    # in the root of the repository
   cd e2e
   npm install
   node serve.js &
   ```

3. A Chromium for Playwright: `npx playwright install chromium`, or set `E2E_CHROMIUM` to the path
   of a Chromium (or chrome-headless-shell) binary.

4. Create the test account (only needed once per server), then run the tests:

   ```
   node setup.js
   node run.js                    # all of them
   node run.js offline.js         # or some of them
   E2E_SHARD=2/3 node run.js      # every third test, from the second (CI runs 3 parts in parallel)
   ```

A full run takes about 15 minutes, as the tests wait for syncs and reconnections. It starts by
emptying the test account (deleting all of its notebooks), as the notes that earlier runs left behind
fill the lists the tests look in; `E2E_KEEP_DATA=1` skips that. Running some of the tests keeps the data.

## Sample data

`node seed.js` fills the account (`E2E_USER`, `E2E_PASSWORD`; it's created when it doesn't exist)
with sample data to try the app with: two notebooks of notes (two of them pinned), a calendar with
events around today, a task list, an address book and bookmarks. Running it again adds them again.

```
E2E_USER=aio-tester E2E_PASSWORD=aio-tester-password node seed.js
```

`node screenshots.js` takes the screenshots of the main README (`../.github/screenshots/`) with an
account that `seed.js` filled once: the calendar, the tasks, a note, the bookmarks and a contact, and
a note in dark mode. The app is told the server is `https://etebase.example.com`, which is what the
screenshots show; the test server answers for it.

```
E2E_USER=alex E2E_PASSWORD=some-password node seed.js
E2E_USER=alex E2E_PASSWORD=some-password node screenshots.js
```

## Configuration

| Variable | Default | |
|---|---|---|
| `E2E_APP_URL` | `http://localhost:8765` | Where the web build is served |
| `E2E_SERVER` | `http://127.0.0.1:3735` | The Etebase test server |
| `E2E_USER`, `E2E_PASSWORD` | `e2e-tester`, `e2e-tester-password` | The test account, created by `setup.js` |
| `E2E_CHROMIUM` | Playwright's Chromium | The Chromium binary to use |

## Writing tests

The helpers are in `lib.js`. Tests create the notes they need with `api.addNote()` (directly on the
server), rather than relying on what's already in the account. A test can also have an account of
its own, `newAccount()`, which its session logs in to with `login(account)`; `waitFor()` waits for a
change to reach the server, and `collectionOf()` gives the first collection of a type. To check what a note shows use
`noteText()` or `viewerText()`: they fail when a saved note doesn't open in the viewer or doesn't
show its text there, so that "opening a note shows it" is part of every test that reads a note.

Sessions are 900 pixels wide, which is the layout of phones and small tablets. For the layout of wide
screens (the sidebar, and the actions in the bars instead of menus), pass a size:
`session(browser, "A", { width: 1280, height: 800 })`, as `sidebar.js` and `wide-actions.js` do.
