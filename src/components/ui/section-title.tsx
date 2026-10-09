import type { JSX, ReactNode } from "react";

import { Text } from "./text";

export function SectionTitle({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <Text
      weight="bold"
      className="mt-2 text-sm uppercase tracking-widest text-muted"
    >
      {children}
    </Text>
  );
}
