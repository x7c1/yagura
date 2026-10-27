import { useEffect, useId, useRef, useState } from "react";
import { useLiveStatus } from "./live-updates-context";
import type { LiveStatus } from "./live-updates";
import styles from "./LiveStatusDot.module.css";

const statusLabels: Readonly<Record<LiveStatus, string>> = {
  live: "Live",
  connecting: "Connecting",
  "not-live": "Not live",
};

const explanations: Readonly<Record<LiveStatus, string>> = {
  live: "Live. Updates appear within seconds.",
  connecting: "Connecting…",
  "not-live": "Not live. Reload to update.",
};

/** What opened the explanation, which decides what closes it. */
type OpenedBy = "pointer" | "focus" | "press";

/**
 * A dot in the header that shows whether the page is live: filled green
 * while live, an amber ring while connecting, a grey ring while not live,
 * told apart by shape as well as colour. It draws nothing while there is
 * no status to show (see {@link useLiveStatus}).
 *
 * Its explanation is a toggletip: pointing at the dot or focusing it opens
 * it, and the pointer or focus leaving closes it; a press opens it, and a
 * press outside, Escape or a second press closes it, Escape after a
 * press returning focus to the dot. The dot's name includes the status,
 * and a change of status is not announced on its own.
 */
export function LiveStatusDot() {
  const status = useLiveStatus();
  const [openedBy, setOpenedBy] = useState<OpenedBy | undefined>(undefined);
  const containerRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set while Escape moves focus back to the dot, so that the focus does
  // not open the explanation again.
  const refocusing = useRef(false);
  const tipId = useId();
  const open = openedBy !== undefined;

  // While open, a press outside the dot or Escape anywhere closes it.
  useEffect(() => {
    const container = containerRef.current;
    if (!open || container === null) {
      return;
    }
    const document = container.ownerDocument;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.contains(event.target as Node)) {
        setOpenedBy(undefined);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setOpenedBy(undefined);
      // Only a press brought the viewer to the dot; opened by pointing,
      // focus stays where the viewer is working.
      const button = buttonRef.current;
      if (
        openedBy === "press" &&
        button !== null &&
        document.activeElement !== button
      ) {
        refocusing.current = true;
        button.focus();
        refocusing.current = false;
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, openedBy]);

  if (status === undefined) {
    return null;
  }
  return (
    <span
      ref={containerRef}
      className={styles.container}
      onPointerEnter={(event) => {
        // A touch has no hover: the tap that follows opens it instead.
        if (event.pointerType !== "touch" && openedBy === undefined) {
          setOpenedBy("pointer");
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch" && openedBy === "pointer") {
          setOpenedBy(undefined);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Connection: ${statusLabels[status]}`}
        aria-expanded={open}
        aria-controls={open ? tipId : undefined}
        className={styles.button}
        onFocus={() => {
          if (!refocusing.current && openedBy === undefined) {
            setOpenedBy("focus");
          }
        }}
        onBlur={() => setOpenedBy(undefined)}
        onClick={() => setOpenedBy(openedBy === "press" ? undefined : "press")}
      >
        <span aria-hidden="true" className={styles.dot} data-status={status} />
      </button>
      {open && (
        <span id={tipId} className={styles.tip}>
          {explanations[status]}
        </span>
      )}
    </span>
  );
}
