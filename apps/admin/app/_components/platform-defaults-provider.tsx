"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  DEFAULT_PLATFORM_DEFAULTS,
  type PlatformDefaults,
} from "@/lib/reference-data/platform-reference-data";

type PlatformDefaultsContextValue = {
  defaults: PlatformDefaults;
  updateDefaults: (defaults: PlatformDefaults) => void;
};

const PlatformDefaultsContext = createContext<PlatformDefaultsContextValue>({
  defaults: DEFAULT_PLATFORM_DEFAULTS,
  updateDefaults: () => undefined,
});

export function PlatformDefaultsProvider({
  children,
  defaults,
}: {
  children: React.ReactNode;
  defaults: Partial<PlatformDefaults>;
}) {
  const [currentDefaults, setCurrentDefaults] = useState<PlatformDefaults>({
    ...DEFAULT_PLATFORM_DEFAULTS,
    ...defaults,
  } as PlatformDefaults);
  const value = useMemo(
    () => ({
      defaults: currentDefaults,
      updateDefaults: setCurrentDefaults,
    }),
    [currentDefaults],
  );

  return (
    <PlatformDefaultsContext.Provider value={value}>
      {children}
    </PlatformDefaultsContext.Provider>
  );
}

export function usePlatformDefaults() {
  return useContext(PlatformDefaultsContext);
}
