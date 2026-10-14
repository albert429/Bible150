import { ar } from "../lib/format";
import type { Passage } from "../plan/readings";

export default function PassageReference({ passage }: { passage: Passage }) {
  const range =
    passage.start === passage.end
      ? ar(passage.start)
      : `${ar(passage.start)}–${ar(passage.end)}`;
  return (
    <bdi
      className="passage-reference"
      dir="ltr"
      aria-label={`الإصحاح ${ar(passage.chapter)}، ${passage.start === passage.end ? "الآية" : "الآيات"} ${range}`}
    >
      {ar(passage.chapter)}: {range}
    </bdi>
  );
}
