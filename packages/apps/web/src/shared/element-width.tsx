import type { ElementWidths } from "@yagura/browser";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

const ElementWidthsContext = createContext<ElementWidths | undefined>(
  undefined,
);

export function ElementWidthsProvider(props: {
  readonly widths: ElementWidths;
  readonly children: ReactNode;
}) {
  return (
    <ElementWidthsContext.Provider value={props.widths}>
      {props.children}
    </ElementWidthsContext.Provider>
  );
}

/**
 * The width of the element `ref` is attached to, in whole CSS pixels, kept
 * up to date as it is resized; `null` until the element is laid out. It is
 * measured before the browser paints, so that what is drawn from it never
 * shows at a wrong width.
 */
export function useElementWidth<T extends Element>(): {
  readonly ref: RefObject<T>;
  readonly width: number | null;
} {
  const widths = useContext(ElementWidthsContext);
  if (!widths) {
    throw new Error(
      "useElementWidth must be used inside an ElementWidthsProvider",
    );
  }
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    // Rounded down, so that what is drawn to it never overflows it.
    return widths.observe(element, (next) => setWidth(Math.floor(next)));
  }, [widths]);
  return { ref, width };
}
