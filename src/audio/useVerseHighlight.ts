import { useEffect } from "react";
import {
  clearListening,
  markListening,
  verseElement,
} from "../reader/scriptureDom";
import { scrollDelta } from "./highlightScroll.ts";
import type { Cue } from "./manifest";

/** Mark the verse being read, and keep it in view while audio plays. */
export function useVerseHighlight(cue: Cue | undefined, playing: boolean) {
  useEffect(() => {
    const element = cue ? verseElement(cue.passage, cue.verse) : null;
    if (!element) return;
    markListening(element);
    if (playing) {
      const rect = element.getBoundingClientRect();
      const delta = scrollDelta({
        verseTop: rect.top,
        verseBottom: rect.bottom,
        topbarBottom: document.querySelector(".topbar")?.getBoundingClientRect()
          .bottom,
        playerTop: document
          .querySelector(".audio-player")
          ?.getBoundingClientRect().top,
        viewportHeight: innerHeight,
      });
      if (delta !== null) window.scrollBy({ top: delta, behavior: "instant" });
    }
    return () => clearListening(element);
  }, [cue, playing]);
}
