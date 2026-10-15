import { Fragment } from "react";
import type { BibleChapter, BibleBlock } from "../bible/types";
import { ar } from "../lib/format";
import { chapterSegments } from "./chapterSegments";

function Metadata({ block }: { block: BibleBlock }) {
  if (block.kind === "heading") return <h3>{block.text}</h3>;
  if (block.kind === "superscription" || block.kind === "acrostic")
    return <p className={`scripture-${block.kind}`}>{block.text}</p>;
  if (block.text) return <p className="scripture-source-note">{block.text}</p>;
  return null;
}
export default function ChapterText({ reading }: { reading: BibleChapter }) {
  return (
    <div className="verse-text chapter-text">
      {reading.structure
        .filter((block) => block.verse < 1)
        .map((block, index) => (
          <Metadata key={index} block={block} />
        ))}
      {reading.passages[0].verses.map((verse) => {
        const blocks = reading.structure.filter(
          (block) => block.verse === verse.number,
        );
        const segments = chapterSegments(verse.text, blocks);
        const prefix = blocks.filter((block) => block.offset === 0);
        return (
          <Fragment key={verse.number}>
            {prefix.map((block, index) => (
              <Metadata key={index} block={block} />
            ))}
            <span className="verse" data-v={verse.number}>
              {segments.map((segment, index) => {
                const layout = [...segment.blocks]
                  .reverse()
                  .find(
                    (block) =>
                      block.kind === "poetry" || block.kind === "paragraph",
                  );
                const className = layout
                  ? `scripture-${layout.kind} scripture-${layout.marker}`
                  : undefined;
                return (
                  <Fragment key={index}>
                    {index > 0 &&
                      segment.blocks.map(
                        (block, metadataIndex) =>
                          block.text && (
                            <span
                              key={metadataIndex}
                              className={`scripture-inline-${block.kind}`}
                              role={
                                block.kind === "heading" ? "heading" : undefined
                              }
                              aria-level={
                                block.kind === "heading" ? 3 : undefined
                              }
                            >
                              {block.text}
                            </span>
                          ),
                      )}
                    <span className={className}>
                      {index === 0 && (
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
                      )}
                      {segment.text}{" "}
                    </span>
                  </Fragment>
                );
              })}
            </span>
          </Fragment>
        );
      })}
      {reading.structure
        .filter((block) => block.verse > reading.verseCount)
        .map((block, index) => (
          <Metadata key={index} block={block} />
        ))}
    </div>
  );
}
