import { useEffect } from "react";

/** Pause as soon as any modal dialog is open, and whenever one opens later. */
export function usePauseOnDialog(pause: () => void) {
  useEffect(() => {
    const checkDialogs = () => {
      if (document.querySelector("dialog[open]")) pause();
    };
    const observer = new MutationObserver(checkDialogs);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    checkDialogs();
    return () => observer.disconnect();
  }, [pause]);
}
