import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ThemeChoice, ThemeController } from "./theme-controller";

const ThemeContext = createContext<ThemeController | undefined>(undefined);

export function ThemeProvider(props: {
  readonly controller: ThemeController;
  readonly children: ReactNode;
}) {
  return (
    <ThemeContext.Provider value={props.controller}>
      {props.children}
    </ThemeContext.Provider>
  );
}

/** The theme controller and the current choice. */
export function useTheme(): {
  readonly controller: ThemeController;
  readonly choice: ThemeChoice;
} {
  const controller = useContext(ThemeContext);
  if (!controller) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  const choice = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.choice,
  );
  return { controller, choice };
}
