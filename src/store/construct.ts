// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only


import * as Etebase from "etebase";

import AsyncStorage from "../AsyncStorage";
import * as C from "../constants";

import { combineReducers } from "redux";
import { persistReducer, createTransform, createMigrate } from "redux-persist";

import { List, Map as ImmutableMap } from "immutable";

import {
  SettingsType,
  fetchCount, syncCount, credentials, settingsReducer, syncStatusReducer, lastSyncReducer, connectionReducer, errorsReducer,
  CredentialsData, SyncCollectionsData, SyncGeneralData, ConnectionInfo,
  collections, items, syncCollections, syncItems, syncGeneral, pendingCollections, CachedCollectionsData, CachedItemsData, SyncItemsData, PendingCollectionsData, messagesReducer, Message,
  pendingDeletesReducer, PendingDeletes,
} from "./reducers";

export interface StoreState {
  fetchCount: number;
  syncCount: number;
  syncStatus: string | null;
  settings: SettingsType;
  credentials: CredentialsData;
  sync: {
    collections: SyncCollectionsData;
    items: SyncItemsData;
    pendingCollections: PendingCollectionsData;
    general: SyncGeneralData;

    lastSync: Date | null;
  };
  // The notebooks and their notes only, which is what the notes part of the app works with
  cache: {
    collections: CachedCollectionsData;
    items: CachedItemsData;
  };
  // All of the synced collections (notebooks, calendars, task lists and address books) and their items
  allCache: {
    collections: CachedCollectionsData;
    items: CachedItemsData;
  };
  connection: ConnectionInfo | null;
  errors: List<Error>;
  messages: List<Message>;
  // The notes or bookmarks deleted a moment ago, which the message with Undo is shown for
  pendingDeletes: PendingDeletes;
}

const settingsMigrations = {
  1: (state: any) => {
    const oldViewSettings = { ...state.viewSettings };
    const viewSettings = {
      defaultViewMode: "last",
      lastViewMode: oldViewSettings.viewMode ?? false,
      filterBy: oldViewSettings.filterBy,
      sortBy: oldViewSettings.sortBy,
      editorFontFamily: oldViewSettings.editorFontFamily ?? "monospace",
      viewerFontFamily: oldViewSettings.viewerFontFamily ?? "regular",
    };
    return {
      ...state,
      viewSettings,
    };
  },
  // Open notes in the viewer by default. With "last" they opened in the editor once it was used,
  // which was confusing. Choosing "editor" or "last" in the settings still works.
  2: (state: any) => {
    const viewSettings = { ...state.viewSettings };
    if (viewSettings.defaultViewMode === "last") {
      viewSettings.defaultViewMode = "viewer";
    }
    return {
      ...state,
      viewSettings,
    };
  },
  // The settings of the tasks, which came with the calendar, the tasks and the contacts
  3: (state: any) => {
    return {
      ...state,
      locale: state.locale ?? "en-gb",
      taskSettings: state.taskSettings ?? { filterBy: null, sortBy: "smart", showCompleted: false },
      calendarView: state.calendarView ?? "month",
    };
  },
};

const settingsPersistConfig = {
  key: "settings",
  version: 3,
  storage: AsyncStorage,
  migrate: createMigrate(settingsMigrations, { debug: false }),
};

const credentialsPersistConfig = {
  key: "credentials",
  version: 0,
  storage: AsyncStorage,
};

const syncSerialize = (state: any, key: string | number) => {
  if ((key === "collections") || (key === "items") || (key === "pendingCollections")) {
    return state.toJS();
  }

  return state;
};

const syncDeserialize = (state: any, key: string | number) => {
  if ((key === "collections") || (key === "pendingCollections")) {
    return ImmutableMap(state);
  } else if (key === "items") {
    return ImmutableMap(state).map((items: any) => {
      return ImmutableMap(items);
    });
  }

  return state;
};

const syncPersistConfig = {
  key: "sync",
  storage: AsyncStorage,
  transforms: [createTransform(syncSerialize, syncDeserialize)] as any,
};

const cacheSerialize = (state: any, key: string | number) => {
  if (key === "collections") {
    const typedState = state as CachedCollectionsData;
    const ret = typedState.map((x) => ({ ...x, cache: Etebase.toBase64(x.cache) }));
    return ret.toJS();
  } else if (key === "items") {
    const typedState = state as CachedItemsData;
    const ret = typedState.map((items) => {
      return items.map((x) => ({ ...x, cache: Etebase.toBase64(x.cache) }));
    });
    return ret.toJS();
  }

  return state;
};

const cacheDeserialize = (state: any, key: string | number) => {
  if (key === "collections") {
    return ImmutableMap<string, any>(state).map((x) => {
      return { ...x, cache: Etebase.fromBase64(x.cache) };
    });
  } else if (key === "items") {
    return ImmutableMap(state).map((item: any) => {
      return ImmutableMap<string, any>(item).map((x) => ({ ...x, cache: Etebase.fromBase64(x.cache) }));
    });
  }

  return state;
};

const cacheMigrations = {
  1: (state: any) => {
    const collections = (state.collections as CachedCollectionsData).map((x) => {
      return { ...x, collectionType: x.meta.type! };
    });
    return {
      ...state,
      collections,
    };
  },
};

const cachePersistConfig = {
  key: "cache",
  version: 1,
  storage: AsyncStorage,
  transforms: [createTransform(cacheSerialize, cacheDeserialize)] as any,
  migrate: createMigrate(cacheMigrations, { debug: false }),
};

const reducers = combineReducers<any>({
  fetchCount,
  syncCount,
  syncStatus: syncStatusReducer,
  settings: persistReducer(settingsPersistConfig, settingsReducer),
  credentials: persistReducer(credentialsPersistConfig, credentials),
  sync: persistReducer(syncPersistConfig, combineReducers<any>({
    collections: syncCollections,
    items: syncItems,
    pendingCollections,
    general: syncGeneral,

    lastSync: lastSyncReducer,
  })),
  cache: persistReducer(cachePersistConfig, combineReducers<any>({
    collections,
    items,
  })),
  connection: connectionReducer,
  errors: errorsReducer,
  messages: messagesReducer,
  pendingDeletes: pendingDeletesReducer,
});

// The notes part of the app sees only the notebooks, so "cache" is a view of the notebooks in the
// cache of everything ("allCache"), which is what is synced and saved. The view is only made again
// when the cache changes, and its maps stay the same objects while no notebook or note changed (so
// the notes screens don't draw again when e.g. an event is saved). The notes waiting to be deleted
// (`pendingDeletes`) are marked deleted in it, so that every list, count and search leaves them out.
let lastAllCache: any;
let lastPending: string[] | undefined;
let lastNotesCache: any;
export function notesView(allCache: any, pendingDeletes: string[] = []) {
  if ((allCache === lastAllCache) && (pendingDeletes === lastPending)) {
    return lastNotesCache;
  }
  const notebooks = (allCache.collections as CachedCollectionsData).filter((x) => x.collectionType === C.colType);
  const items = shownAsDeleted((allCache.items as CachedItemsData).filter((_items, colUid) => notebooks.has(colUid)), pendingDeletes);
  const last = lastNotesCache;
  lastAllCache = allCache;
  lastPending = pendingDeletes;
  const collections = (last && sameEntries(last.collections, notebooks)) ? last.collections : notebooks;
  const notes = (last && sameEntries(last.items, items)) ? last.items : items;
  const others = Object.keys(allCache).filter((key) => (key !== "collections") && (key !== "items"));
  if (last && (collections === last.collections) && (notes === last.items) && others.every((key) => allCache[key] === last[key])) {
    return last;
  }
  lastNotesCache = { ...allCache, collections, items: notes };
  return lastNotesCache;
}

// Whether two maps have the same keys, with the same objects
function sameEntries(a: ImmutableMap<string, unknown>, b: ImmutableMap<string, unknown>) {
  return (a.size === b.size) && a.every((value, key) => b.get(key) === value);
}

// The items with the ones given as "colUid/itemUid" marked as deleted (only those that are in them:
// the others are of another kind), each notebook or list with none of them staying the same object
export function shownAsDeleted(items: CachedItemsData, deleted: string[]) {
  let ret = items;
  for (const key of deleted) {
    const [colUid, itemUid] = key.split("/");
    const item = ret.get(colUid)?.get(itemUid);
    if (item) {
      ret = ret.setIn([colUid, itemUid], { ...item, isDeleted: true });
    }
  }
  return ret;
}

let lastState: any;
export default function rootReducer(state: any, action: any) {
  let inner = undefined;
  if (state) {
    const { allCache, cache: _cache, ...rest } = state;
    inner = { ...rest, cache: allCache };
  }
  const next = reducers(inner, action);
  if (lastState && (lastState.allCache === next.cache) && Object.keys(next).every((key) => (key === "cache") || (next[key] === lastState[key]))) {
    return lastState;
  }
  lastState = { ...next, allCache: next.cache, cache: notesView(next.cache, (next.pendingDeletes as PendingDeletes).items) };
  return lastState;
}
