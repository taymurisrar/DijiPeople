"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  DEFAULT_PLATFORM_DEFAULTS,
  type PlatformDefaults,
} from "@/lib/reference-data/platform-reference-data";
import {
  DEFAULT_PLATFORM_APPEARANCE,
  normalizePlatformAppearance,
  type PlatformAppearance,
} from "@/lib/platform-appearance";

type PlatformDefaultsContextValue = {
  defaults: PlatformDefaults;
  updateDefaults: (defaults: PlatformDefaults) => void;
  appearance: PlatformAppearance;
  updateAppearance: (appearance: PlatformAppearance) => void;
};

const PlatformDefaultsContext = createContext<PlatformDefaultsContextValue>({
  defaults: DEFAULT_PLATFORM_DEFAULTS,
  updateDefaults: () => undefined,
  appearance: DEFAULT_PLATFORM_APPEARANCE,
  updateAppearance: () => undefined,
});

export function PlatformDefaultsProvider({
  children,
  defaults,
  appearance,
}: {
  children: React.ReactNode;
  defaults: Partial<PlatformDefaults>;
  appearance?: Partial<PlatformAppearance>;
}) {
  const [currentDefaults, setCurrentDefaults] = useState<PlatformDefaults>({
    ...DEFAULT_PLATFORM_DEFAULTS,
    ...defaults,
  } as PlatformDefaults);
  const [currentAppearance, setCurrentAppearance] = useState<PlatformAppearance>(
    () => normalizePlatformAppearance(appearance),
  );
  const value = useMemo(
    () => ({
      defaults: currentDefaults,
      updateDefaults: setCurrentDefaults,
      appearance: currentAppearance,
      updateAppearance: setCurrentAppearance,
    }),
    [currentAppearance, currentDefaults],
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
