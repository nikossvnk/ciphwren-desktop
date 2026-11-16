// The store: saving many items is one change of it (each change makes the screens look at it again),
// the notes part's view of the cache stays the same while no notebook or note changed, and the notes
// and bookmarks deleted a moment ago (which Undo can still bring back) look deleted.
require("./register");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Map: ImmutableMap } = require("immutable");

const { store } = require("../src/store");
const { notesView, shownAsDeleted } = require("../src/store/construct");
const { SyncManager, saveItemsLocally } = require("../src/sync/SyncManager");

test("saving 200 items changes the store a few times, and they're all saved and queued to be uploaded", async () => {
  // (no syncing here, that would need a server)
  SyncManager.prototype.sync = async () => undefined;
  const etebase = { user: { username: "tester" } };
  const col = { uid: "contacts" };
  const itemMgr = { cacheSave: (item) => new TextEncoder().encode(item.uid) };
  const items = Array.from({ length: 200 }, (_x, i) => ({ uid: `item${i}`, isDeleted: false, getMeta: () => ({ name: `item${i}` }) }));

  let changes = 0;
  const unsubscribe = store.subscribe(() => changes++);
  await saveItemsLocally(etebase, col, itemMgr, items);
  unsubscribe();

  const state = store.getState();
  assert.equal(state.allCache.items.get("contacts").size, 200);
  assert.equal(new TextDecoder().decode(state.allCache.items.getIn(["contacts", "item42"]).cache), "item42");
  assert.equal(state.allCache.items.getIn(["contacts", "item42"]).meta.name, "item42");
  assert.equal(state.sync.items.get("contacts").size, 200);
  assert.ok(changes <= 5, `the store changed ${changes} times`);
});

test("the notes part's view of the cache stays the same while no notebook or note changed", () => {
  const notebook = { cache: "nb", meta: { name: "My Notes" }, collectionType: "etebase.md.note" };
  const calendar = { cache: "cal", meta: { name: "Work" }, collectionType: "etebase.vevent" };
  const note = { cache: "n", meta: { name: "Shopping" }, isDeleted: false };
  const first = {
    collections: ImmutableMap({ nb: notebook, cal: calendar }),
    items: ImmutableMap({ nb: ImmutableMap({ n: note }), cal: ImmutableMap() }),
  };
  const view = notesView(first);
  assert.deepEqual(Array.from(view.collections.keys()), ["nb"]);
  assert.deepEqual(Array.from(view.items.keys()), ["nb"]);

  // An event saved: everything is a new object, but not for the notes
  const eventSaved = { ...first, items: first.items.setIn(["cal", "e"], { cache: "e", meta: { name: "e" }, isDeleted: false }) };
  assert.equal(notesView(eventSaved), view);

  // A note saved
  const noteSaved = { ...eventSaved, items: eventSaved.items.setIn(["nb", "n"], { ...note, meta: { name: "Shopping list" } }) };
  const after = notesView(noteSaved);
  assert.notEqual(after.items, view.items);
  assert.equal(after.collections, view.collections);
  assert.equal(after.items.getIn(["nb", "n"]).meta.name, "Shopping list");

  // A notebook renamed
  const renamed = { ...noteSaved, collections: noteSaved.collections.set("nb", { ...notebook, meta: { name: "Notes" } }) };
  assert.equal(notesView(renamed).collections.get("nb").meta.name, "Notes");
  assert.equal(notesView(renamed).items, after.items);
});

test("the notes and bookmarks waiting to be deleted look deleted, and come back when they no longer wait", () => {
  const notebook = { cache: "nb", meta: { name: "My Notes" }, collectionType: "etebase.md.note" };
  const other = { cache: "nb2", meta: { name: "Work" }, collectionType: "etebase.md.note" };
  const note = (name) => ({ cache: name, meta: { name }, isDeleted: false });
  const cache = {
    collections: ImmutableMap({ nb: notebook, nb2: other }),
    items: ImmutableMap({ nb: ImmutableMap({ a: note("a"), b: note("b") }), nb2: ImmutableMap({ c: note("c") }) }),
  };
  const before = notesView(cache);

  const waiting = notesView(cache, ["nb/a", "bookmarks/x"]);
  assert.equal(waiting.items.getIn(["nb", "a"]).isDeleted, true);
  assert.equal(waiting.items.getIn(["nb", "b"]).isDeleted, false);
  // (the other notebook stays the same object, so its screens don't draw again)
  assert.equal(waiting.items.get("nb2"), before.items.get("nb2"));
  // (and the cache itself isn't changed: that's what is deleted when the time is up)
  assert.equal(cache.items.getIn(["nb", "a"]).isDeleted, false);

  const undone = notesView(cache, []);
  assert.equal(undone.items.getIn(["nb", "a"]).isDeleted, false);

  // The same for the bookmarks
  const bookmarks = ImmutableMap({ list: ImmutableMap({ x: note("x") }) });
  assert.equal(shownAsDeleted(bookmarks, ["nb/a", "list/x"]).getIn(["list", "x"]).isDeleted, true);
  assert.equal(shownAsDeleted(bookmarks, []), bookmarks);
});
