// SPDX-FileCopyrightText: © 2026 Ciphwren Desktop Authors
// SPDX-License-Identifier: GPL-3.0-only

// Deleting notes or bookmarks doesn't ask: they're hidden at once (the notes view and the bookmarks
// selector show them as deleted, see `shownAsDeleted`), "Note deleted" is shown with Undo, and they're
// only deleted when that goes away, after 8 seconds. Undo just shows them again, as nothing was
// changed (so they keep their history). Deleting more while some wait deletes the ones that wait
// first. When the app is closed before, they aren't deleted.

import * as Etebase from "etebase";
import { useSelector } from "react-redux";

import { StoreState, store } from "./store";
import { popMessage, setPendingDeletes } from "./store/actions";
import { PendingDeletes } from "./store/reducers";
import { deleteNotes } from "./notes";
import { deleteBookmark } from "./bookmarks";
import { useCredentials } from "./credentials";
import Snackbar from "./widgets/Snackbar";

// Items given as "colUid/itemUid"
export async function deleteLater(etebase: Etebase.Account, what: PendingDeletes["what"], items: Iterable<string>) {
  await deletePending(etebase);
  // The Undo takes the place of the app's messages (e.g. "Bookmark saved"), which would cover it
  for (let i = store.getState().messages.size; i > 0; i--) {
    store.dispatch(popMessage());
  }
  store.dispatch(setPendingDeletes({ what, items: [...items] }));
}

async function deletePending(etebase: Etebase.Account) {
  const pending = store.getState().pendingDeletes;
  if (pending.items.length === 0) {
    return;
  }
  // (they're deleted before they're taken out of the list, so that they don't show for a moment)
  if (pending.what === "note") {
    await deleteNotes(etebase, pending.items);
  } else {
    for (const key of pending.items) {
      const [colUid, uid] = key.split("/");
      await deleteBookmark(etebase, { colUid, uid });
    }
  }
  if (store.getState().pendingDeletes === pending) {
    store.dispatch(setPendingDeletes({ what: pending.what, items: [] }));
  }
}

export function PendingDeletesBar() {
  const etebase = useCredentials();
  const { what, items } = useSelector((state: StoreState) => state.pendingDeletes);

  return (
    <Snackbar
      // (a new deletion is a new message, shown for the whole time again)
      key={items.join(" ")}
      visible={items.length > 0}
      duration={8000}
      // (when the time is up: Undo empties the list, which hides it)
      onDismiss={() => etebase && deletePending(etebase)}
      zIndex={10}
      countdown
      action={{ label: "Undo", onPress: () => store.dispatch(setPendingDeletes({ what, items: [] })) }}
    >
      {(items.length === 1) ? ((what === "note") ? "Note deleted" : "Bookmark deleted") : `${items.length} ${what}s deleted`}
    </Snackbar>
  );
}
