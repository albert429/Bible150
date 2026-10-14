import { chapterRange, rangeAriaLabel } from "../bible/reference";
import type { Passage } from "../plan/readings";
import "./PassageReference.css";

export default function PassageReference({ passage }: { passage: Passage }) {
  return (
    <bdi
      className="passage-reference"
      dir="ltr"
      aria-label={rangeAriaLabel(passage.chapter, passage)}
    >
      {chapterRange(passage.chapter, passage)}
    </bdi>
  );
}
