import { Fragment } from "react";
import type { BibleBlock } from "../bible/types";
import type { Verse } from "../plan/readings";
import { ar } from "../lib/format";
import { chapterSegments } from "./chapterSegments";

/** A source paragraph or poetry line starts a new line; `nb` continues one. */
const startsLine = (block: BibleBlock) =>
  (block.kind === "paragraph" && block.marker !== "nb") ||
  block.kind === "poetry";

/** Headings, Psalm titles and unnumbered source notes between verses. */
function Note({ block }: { block: BibleBlock }) {
  if (!block.text) return null;
  if (block.kind === "heading") return <h3>{block.text}</h3>;
  const kind = block.kind === "paragraph" ? "source-note" : block.kind;
  return <p className={`scripture-${kind}`}>{block.text}</p>;
}

/** The few headings that fall inside a numbered verse. */
function InlineNote({ block }: { block: BibleBlock }) {
  if (!block.text) return null;
  const heading = block.kind === "heading";
  return (
    <span
      className="scripture-inline-note"
      role={heading ? "heading" : undefined}
      aria-level={heading ? 3 : undefined}
    >
      <span>{block.text}</span>
    </span>
  );
}

// Verses flow as one text, as in the plan reader; structure only adds line
// starts and notes, so each verse keeps one `.verse` element for highlighting.
// A chronological passage passes its own in-range verses and blocks.
export default function ChapterText({
  verses,
  structure,
}: {
  verses: readonly Verse[];
  structure: readonly BibleBlock[];
}) {
  return (
    <div className="verse-text chapter-text">
      {verses.map((verse, verseIndex) => {
        const length = Array.from(verse.text).length;
        const blocks = structure.filter(
          (block) => block.verse === verse.number,
        );
        const before = blocks.filter((block) => block.offset === 0);
        const after = blocks.filter(
          (block) => block.offset > 0 && block.offset >= length,
        );
        const segments = chapterSegments(
          verse.text,
          blocks.filter((block) => block.offset < length),
        );
        const titled = before.some((block) => block.text);
        return (
          <Fragment key={verse.number}>
            {before.map((block, index) => (
              <Note key={index} block={block} />
            ))}
            {verseIndex > 0 && !titled && before.some(startsLine) && (
              <span className="scripture-break" />
            )}
            <span
              className={
                before.some((block) => block.marker === "qc")
                  ? "verse scripture-qc"
                  : "verse"
              }
              data-v={verse.number}
            >
              {segments.map((segment, index) => (
                <Fragment key={index}>
                  {index === 0 ? (
                    <sup>
                      <button
                        type="button"
                        className="verse-number"
                        aria-haspopup="dialog"
                        aria-label={`تفاصيل الآية ${ar(verse.number)}`}
                      >
                        {ar(verse.number)}
                      </button>
                    </sup>
                  ) : (
                    <>
                      {segment.blocks.map((block, blockIndex) => (
                        <InlineNote key={blockIndex} block={block} />
                      ))}
                      {!segment.blocks.some((block) => block.text) &&
                        segment.blocks.some(startsLine) && (
                          <span className="scripture-break" />
                        )}
                    </>
                  )}
                  {segment.text}
                </Fragment>
              ))}{" "}
            </span>
            {after.map((block, index) => (
              <Note key={index} block={block} />
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}
