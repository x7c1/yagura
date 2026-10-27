import type { KeyValueStore } from "@yagura/browser";
import { createContext, useContext, useState, type ReactNode } from "react";

const PreferencesContext = createContext<KeyValueStore | undefined>(undefined);

/**
 * Where the view keeps the viewer's choices that belong to the browser
 * rather than to a signed-in viewer (`localStorage` in the browser).
 */
export function PreferencesProvider(props: {
  readonly store: KeyValueStore;
  readonly children: ReactNode;
}) {
  return (
    <PreferencesContext.Provider value={props.store}>
      {props.children}
    </PreferencesContext.Provider>
  );
}

/**
 * A choice that is on or off, kept under `key`, and the function that
 * changes it, storing it. It is off unless stored as on. Like the cache,
 * the store only saves the viewer a step: a store that fails reads as off
 * and keeps nothing, with a warning in the console, and the choice still
 * holds until the page is left.
 */
export function useStoredSwitch(key: string): [boolean, (on: boolean) => void] {
  const store = useContext(PreferencesContext);
  if (store === undefined) {
    throw new Error("useStoredSwitch outside a PreferencesProvider");
  }
  const [on, setOn] = useState(() => {
    try {
      return store.get(key) === "true";
    } catch (error) {
      console.warn(`Could not read the preference ${key}:`, error);
      return false;
    }
  });
  const change = (next: boolean) => {
    setOn(next);
    try {
      if (next) {
        store.set(key, "true");
      } else {
        store.remove(key);
      }
    } catch (error) {
      console.warn(`Could not store the preference ${key}:`, error);
    }
  };
  return [on, change];
}
