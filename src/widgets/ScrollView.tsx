// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { ScrollViewProps, ScrollView as NativeScrollView } from "react-native";
import { useTheme } from "../theme";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

// (without the keyboard events of React Native's ScrollView, which react-native-keyboard-aware-scroll-view
// has under the same names with other arguments; nothing passes them)
type Props = Omit<ScrollViewProps, "onKeyboardWillShow" | "onKeyboardDidShow" | "onKeyboardWillHide" | "onKeyboardDidHide">;

export default function ScrollView(inProps: React.PropsWithChildren<Props> & { keyboardAware?: boolean }) {
  const { keyboardAware, style, ...props } = inProps;
  const theme = useTheme();

  const Scroller = (keyboardAware) ? KeyboardAwareScrollView : NativeScrollView;

  return (
    <Scroller style={[{ backgroundColor: theme.colors.background }, style]} {...props} />
  );
}
