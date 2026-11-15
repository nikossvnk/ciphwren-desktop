// SPDX-FileCopyrightText: © 2019 EteSync Authors
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import { View, StyleProp, StyleSheet, ViewStyle } from "react-native";
import { Text, TouchableRipple } from "react-native-paper";
import { useTheme } from "../theme";
import { tint } from "../pim/style";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Link from "./Link";

// (the props are the text's, but the style is the box's)
type PropsType = Omit<React.ComponentProps<typeof Text>, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  severity: "error" | "warning" | "info" | "success";
  to?: string;
  external?: boolean;
  onPress?: () => void;
};

export default function Alert(props_: React.PropsWithChildren<PropsType>) {
  const theme = useTheme();
  const { children, style, severity, to, external, onPress, ...props } = props_;
  // (each severity has an icon of its own, so that it isn't told by its colour alone)
  const icons: Record<PropsType["severity"], React.ComponentProps<typeof MaterialCommunityIcons>["name"]> = {
    error: "alert-circle-outline",
    warning: "alert-outline",
    info: "information-outline",
    success: "checkbox-marked-circle-outline",
  };
  const color = {
    error: theme.colors.error,
    warning: theme.colors.warning,
    info: theme.colors.accent,
    success: theme.colors.success,
  }[severity];

  return (
    // A tint of the severity's colour behind the text, which has the colour of the app's
    <View style={[styles.root, { backgroundColor: tint(color, 0.12) }, style]}>
      <MaterialCommunityIcons name={icons[severity]} style={styles.icon} color={color} size={24} />
      {(to) ? (
        <Link
          to={to}
          external={external}
          onPress={onPress}
          renderChild={(props) => (
            <TouchableRipple style={styles.touchable} {...props}>
              <Text
                style={styles.text}
                {...props}
              >
                {children}
              </Text>
            </TouchableRipple>
          )}
        />
      ) : (
        <View style={styles.touchable}>
          <Text
            style={styles.text}
            {...props}
          >
            {children}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 4,
  },
  icon: {
    marginRight: 12,
  },
  touchable: {
    flex: 1,
  },
  text: {
    flex: 1,
  },
});
