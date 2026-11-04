// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { IconButton, Text, Tooltip, TouchableRipple } from "react-native-paper";

import { code, Edit, heading, link, linePrefix, wrap } from "../markdownFormat";
import { fonts, useTheme } from "../theme";

// A button's keyboard shortcut is ctrl (or cmd) with the key (by its place, as with shift the
// digits type other characters) and maybe shift
type Button = { icon: string, label: string, apply: (edit: Edit) => Edit, keys?: { code: string, shift?: boolean } };

const groups: Button[][] = [
  [
    { icon: "format-header-pound", label: "Heading", apply: heading, keys: { code: "KeyH", shift: true } },
    { icon: "format-bold", label: "Bold", apply: (e) => wrap(e, "**", "bold text"), keys: { code: "KeyB" } },
    { icon: "format-italic", label: "Italic", apply: (e) => wrap(e, "_", "italic text"), keys: { code: "KeyI" } },
    { icon: "format-strikethrough-variant", label: "Strikethrough", apply: (e) => wrap(e, "~~", "struck text"), keys: { code: "KeyX", shift: true } },
  ],
  [
    { icon: "format-list-bulleted", label: "Bulleted list", apply: (e) => linePrefix(e, "- "), keys: { code: "Digit8", shift: true } },
    { icon: "format-list-numbered", label: "Numbered list", apply: (e) => linePrefix(e, "1. "), keys: { code: "Digit7", shift: true } },
    { icon: "format-list-checks", label: "Checklist", apply: (e) => linePrefix(e, "- [ ] "), keys: { code: "Digit9", shift: true } },
  ],
  [
    { icon: "format-quote-close", label: "Quote", apply: (e) => linePrefix(e, "> "), keys: { code: "Period", shift: true } },
    { icon: "code-tags", label: "Code", apply: code, keys: { code: "KeyE" } },
    { icon: "link-variant", label: "Insert link", apply: link, keys: { code: "KeyK" } },
  ],
];

// The formatting a key press in the editor asks for: a button's shortcut
export function formatShortcut(e: KeyboardEvent): ((edit: Edit) => Edit) | undefined {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) {
    return undefined;
  }
  return groups.flat().find((x) => x.keys && (x.keys.code === e.code) && (!!x.keys.shift === e.shiftKey))?.apply;
}

// The keys of a button's shortcut, e.g. ["Ctrl", "Shift", "8"]
function shortcutKeys(keys: NonNullable<Button["keys"]>) {
  const key = (keys.code === "Period") ? "." : keys.code.replace(/^(Key|Digit)/, "");
  return ["Ctrl", ...((keys.shift) ? ["Shift"] : []), key];
}

// For the list of the keyboard shortcuts
export const formatShortcuts = groups.flat().flatMap<[string[], string]>((x) => (x.keys) ? [[shortcutKeys(x.keys), x.label]] : []);

// E.g. "Bold (Ctrl+B)"
function tooltip(button: Button) {
  return (button.keys) ? `${button.label} (${shortcutKeys(button.keys).join("+")})` : button.label;
}

interface PropsType {
  // Applies a change of the Markdown to the note, around its selection
  onFormat: (apply: (edit: Edit) => Edit) => void;
  // Shown at the end on narrow screens, which don't have room for the view mode button in the bar
  onDone?: () => void;
}

// The bar above the editor with buttons that format the Markdown of the note
export default function FormatBar(props: PropsType) {
  const theme = useTheme();
  const { onFormat, onDone } = props;

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Formatting"
      style={[styles.bar, { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.border }]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.buttons}>
        {groups.map((group, i) => (
          <React.Fragment key={i}>
            {(i > 0) && <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />}
            {group.map((button) => (
              <Tooltip key={button.label} title={tooltip(button)}>
                <IconButton
                  icon={button.icon}
                  size={20}
                  containerColor="transparent"
                  iconColor={theme.colors.textBody}
                  style={styles.button}
                  accessibilityLabel={button.label}
                  // Keeps the focus (and so the selection) in the editor on the web
                  {...((Platform.OS === "web") ? { onMouseDown: (e: any) => e.preventDefault() } : {})}
                  onPress={() => onFormat(button.apply)}
                />
              </Tooltip>
            ))}
          </React.Fragment>
        ))}
      </ScrollView>
      {onDone && (
        <TouchableRipple
          borderless
          accessibilityRole="button"
          accessibilityLabel="Done editing"
          onPress={onDone}
          style={[styles.done, { backgroundColor: theme.colors.accent }]}
        >
          <Text style={[styles.doneText, { color: theme.colors.onAccent }]}>Done</Text>
        </TouchableRipple>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingRight: 8,
  },
  buttons: {
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  button: {
    margin: 0,
    borderRadius: 8,
  },
  separator: {
    width: 1,
    height: 20,
    marginHorizontal: 6,
  },
  done: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: "center",
    marginLeft: 6,
  },
  doneText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 16,
  },
});
