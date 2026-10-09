import type { JSX, ReactNode } from "react";
import { Text as RNText } from "react-native";

import { fontClass } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type TextProps = {
  children: ReactNode;
  weight?: keyof typeof fontClass;
  className?: string;
  numberOfLines?: number;
};

export function Text({
  children,
  weight = "regular",
  className,
  numberOfLines,
}: TextProps): JSX.Element {
  return (
    <RNText
      numberOfLines={numberOfLines}
      className={cn("text-ink", fontClass[weight], className)}
    >
      {children}
    </RNText>
  );
}
