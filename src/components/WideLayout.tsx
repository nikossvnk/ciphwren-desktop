// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { GestureResponderHandlers, PanResponder, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { NavigationState, StackActions, useNavigation, useNavigationState } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";

import { StoreState } from "../store";
import { setSettings } from "../store/actions";
import { useCredentials } from "../credentials";
import { useDeviceBreakpoint } from "../helpers";
import { useTheme } from "../theme";

// The widths of the columns can be changed between these, and always leave room for the columns
// next to them: the sidebar for the notes column and the note (the room of `sidebarRoom`), the notes
// column for the note (`noteRoom`) next to the sidebar
const sidebarLimits = { min: 200, max: 400 };
const sidebarRoom = 720;
const notesColumnLimits = { min: 260, max: 600 };
const noteRoom = 420;
const notesColumnDefaultWidth = 340;

function clamp(width: number, min: number, max: number) {
  return Math.round(Math.max(min, Math.min(width, max)));
}

function sidebarWidthIn(width: number, windowWidth: number) {
  return clamp(width, sidebarLimits.min, Math.min(sidebarLimits.max, windowWidth - sidebarRoom));
}

// The width of a column whose edge can be dragged, and the handlers of the handle on that edge
export interface Resize {
  width: number;
  dragging: boolean;
  handlers: GestureResponderHandlers;
}

// Changes the width of a column by dragging the handle on its edge. The width is shown while
// dragging and saved when it's let go; `widthIn` keeps it within its limits for the window's width.
function useResize(savedWidth: number, save: (width: number) => void, widthIn: (width: number, windowWidth: number) => number): Resize {
  const windowWidth = useWindowDimensions().width;
  const [dragWidth, setDragWidth] = React.useState<number>();
  const startRef = React.useRef(savedWidth);
  const latest = React.useRef({ savedWidth, windowWidth, save, widthIn });
  latest.current = { savedWidth, windowWidth, save, widthIn };

  const panResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      startRef.current = latest.current.widthIn(latest.current.savedWidth, latest.current.windowWidth);
      setDragWidth(startRef.current);
    },
    onPanResponderMove: (_e, gesture) => {
      setDragWidth(latest.current.widthIn(startRef.current + gesture.dx, latest.current.windowWidth));
    },
    onPanResponderRelease: (_e, gesture) => {
      latest.current.save(latest.current.widthIn(startRef.current + gesture.dx, latest.current.windowWidth));
      setDragWidth(undefined);
    },
    onPanResponderTerminate: () => setDragWidth(undefined),
  }), []);

  return {
    width: dragWidth ?? widthIn(savedWidth, windowWidth),
    dragging: dragWidth !== undefined,
    handlers: panResponder.panHandlers,
  };
}

export function useSidebarResize() {
  const dispatch = useDispatch();
  const savedWidth = useSelector((state: StoreState) => state.settings.sidebarWidth);
  return useResize(savedWidth, (sidebarWidth) => dispatch(setSettings({ sidebarWidth }) as any), sidebarWidthIn);
}

export function useNotesColumnResize() {
  const dispatch = useDispatch();
  const savedWidth = useSelector((state: StoreState) => state.settings.notesColumnWidth) ?? notesColumnDefaultWidth;
  const sidebarShown = useSidebarShown();
  const sidebarWidth = useSelector((state: StoreState) => state.settings.sidebarWidth);
  const widthIn = (width: number, windowWidth: number) => {
    const besides = (sidebarShown) ? sidebarWidthIn(sidebarWidth, windowWidth) : 0;
    return clamp(width, notesColumnLimits.min, Math.min(notesColumnLimits.max, windowWidth - besides - noteRoom));
  };
  return useResize(savedWidth, (notesColumnWidth) => dispatch(setSettings({ notesColumnWidth }) as any), widthIn);
}

// The handle to drag the right edge of a column with, over the edge. The column needs a zIndex, to be
// over the column next to it, which the handle reaches into.
export function ResizeHandle(props: { resize: Resize, label: string, testID: string }) {
  const theme = useTheme();
  const { resize, label, testID } = props;
  return (
    <View
      {...resize.handlers}
      testID={testID}
      accessibilityLabel={label}
      style={[styles.handle, (Platform.OS === "web") ? ({ cursor: "col-resize" } as any) : undefined,
        (resize.dragging) ? { backgroundColor: theme.colors.activeIcon } : undefined]}
    />
  );
}

// No text gets selected while dragging an edge
export function noSelectWhile(resize: Resize) {
  return (resize.dragging && (Platform.OS === "web")) ? ({ userSelect: "none" } as any) : undefined;
}

const styles = StyleSheet.create({
  handle: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: -3,
    width: 6,
    zIndex: 1,
  },
});

// Wide screens show three columns when logged in: the sidebar (which can be hidden), the notes, and
// the screen of the open note (or other screen). There's no drawer then, the sidebar has its items.
export function useWideLayout() {
  const wide = useDeviceBreakpoint("tabletLandscape");
  const etebase = useCredentials();
  return wide && !!etebase;
}

// Whether the sidebar is shown: in the wide layout, unless it was hidden
export function useSidebarShown() {
  const wideLayout = useWideLayout();
  const sidebarVisible = useSelector((state: StoreState) => state.settings.sidebarVisible);
  return wideLayout && sidebarVisible;
}

// What's searched for in the sidebar, which the notes column shows the results of
type SearchContextType = { query: string, setQuery: (query: string) => void };
const SearchContext = React.createContext<SearchContextType>({ query: "", setQuery: () => undefined });

export function SearchProvider(props: React.PropsWithChildren<unknown>) {
  const [query, setQuery] = React.useState("");
  const value = React.useMemo(() => ({ query, setQuery }), [query]);
  return <SearchContext.Provider value={value}>{props.children}</SearchContext.Provider>;
}

export function useSearchQuery() {
  return React.useContext(SearchContext);
}

// The state of the stack with the screens, which is inside of the drawer
function useStackState() {
  return useNavigationState((state: NavigationState) => {
    const root = state.routes.find((x) => x.name === "Root");
    return root?.state as NavigationState | undefined;
  });
}

// Navigating from the columns, which are next to the stack of screens rather than in it
export function useWideNavigation() {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const stackState = useStackState();
  const cacheCollections = useSelector((state: StoreState) => state.cache.collections);
  const viewSettings = useSelector((state: StoreState) => state.settings.viewSettings);

  // (a state that came from a link, e.g. when the page is loaded, has no index yet: the last screen is open)
  const current = stackState?.routes[stackState.index ?? (stackState.routes.length - 1)];
  const currentParams: any = current?.params ?? {};
  // The note that is open, as "colUid/itemUid"
  const currentNote = (current?.name === "NoteEdit") ? `${currentParams.colUid}/${currentParams.itemUid}` : undefined;
  // The notebook whose notes are listed
  const filterBy = (viewSettings.filterBy && cacheCollections.has(viewSettings.filterBy)) ? viewSettings.filterBy : undefined;

  function navigate(screen: string, params?: any) {
    navigation.navigate("Root", { screen, params });
  }

  // Shows the notes of a notebook, or all of them
  function showNotebook(colUid: string | undefined) {
    dispatch(setSettings({
      viewSettings: {
        ...viewSettings,
        filterBy: colUid ?? null,
      },
    }) as any);
  }

  function openNote(colUid: string, itemUid: string) {
    if (currentNote === `${colUid}/${itemUid}`) {
      return;
    }
    // Going from note to note replaces the note, so that the back button goes back to where it was
    // (the stack replaces the screen the action comes from, which has to be passed as it's sent from outside of it)
    if (stackState && current && (current.name === "NoteEdit")) {
      navigation.dispatch({ ...StackActions.replace("NoteEdit", { colUid, itemUid }), source: current.key, target: stackState.key });
    } else {
      navigate("NoteEdit", { colUid, itemUid });
    }
  }

  return { currentNote, currentScreen: current?.name, currentParams, filterBy, navigate, showNotebook, openNote };
}
