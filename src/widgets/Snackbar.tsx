// SPDX-FileCopyrightText: © 2026 Ciphwren Desktop Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { useTheme } from "../theme";

type PropsType = {
  visible: boolean;
  // Called when its time is up (not after the action, which closes it itself)
  onDismiss: () => void;
  duration: number;
  action: { label: string, onPress: () => void };
  // Over the columns of wide screens (and not under them)
  zIndex: number;
  // A line along the bottom that shrinks while the time goes, for an action that can only be done
  // until then (e.g. Undo)
  countdown?: boolean;
};

// The app's message at the bottom: centred, as wide as the screen on phones and at most 560 pixels on
// wide screens, with colors of the theme. (Paper's Snackbar has no room for the countdown: what's in
// it is in a box of its own.) A new message for the same bar (e.g. another deletion) needs a new
// `key`, to start its time again.
export default function Snackbar(props: React.PropsWithChildren<PropsType>) {
  const { visible, onDismiss, duration, action, zIndex, countdown, children } = props;
  const theme = useTheme();
  const opacity = React.useRef(new Animated.Value(0)).current;
  const timeLeft = React.useRef(new Animated.Value(1)).current;
  // (shown until it has faded out)
  const [shown, setShown] = React.useState(visible);
  const dismissRef = React.useRef(onDismiss);
  dismissRef.current = onDismiss;

  React.useEffect(() => {
    if (!visible) {
      Animated.timing(opacity, { toValue: 0, duration: 100, useNativeDriver: false }).start(({ finished }) => finished && setShown(false));
      return undefined;
    }
    setShown(true);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    timeLeft.setValue(1);
    const countdownAnimation = Animated.timing(timeLeft, { toValue: 0, duration, easing: Easing.linear, useNativeDriver: false });
    countdownAnimation.start();
    const timer = setTimeout(() => dismissRef.current(), duration);
    return () => {
      clearTimeout(timer);
      countdownAnimation.stop();
    };
  }, [visible, duration]);

  if (!shown) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { zIndex }]}>
      <Animated.View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.bar, { backgroundColor: theme.colors.snackbar, opacity }]}
      >
        <Text style={[styles.text, { color: theme.colors.onSnackbar }]}>{children}</Text>
        <Button compact mode="text" textColor={theme.colors.snackbarAction} style={styles.action} onPress={action.onPress}>
          {action.label}
        </Button>
        {countdown && (
          <Animated.View
            aria-hidden
            style={[styles.countdown, {
              backgroundColor: theme.colors.snackbarAction,
              width: timeLeft.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
            }]}
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    padding: 8,
  },
  bar: {
    width: "100%",
    maxWidth: 560,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
    // (the countdown follows the rounded corners)
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 4px 14px rgba(0, 0, 0, 0.28)" },
      default: { elevation: 6 },
    }),
  },
  text: {
    flex: 1,
    marginHorizontal: 16,
    marginVertical: 14,
  },
  action: {
    marginRight: 8,
  },
  countdown: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 3,
  },
});
