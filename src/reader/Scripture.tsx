import { memo, Fragment, type Ref } from "react";
import { ar } from "../lib/format";
import { isBibleChapter, type ScriptureReading } from "../bible/types";
import ChapterText from "./ChapterText";
import PassageReference from "../components/PassageReference";
import ListenButton from "./ListenButton";
import { passageHeadingId, passageId } from "./scriptureDom";
import "./Scripture.css";

type Props = {
  reading: ScriptureReading;
  audio: boolean;
  listening: boolean;
  onToggleListen: () => void;
  listenButton: Ref<HTMLButtonElement>;
};

export default memo(function Scripture({
  reading,
  audio,
  listening,
  onToggleListen,
  listenButton,
}: Props) {
  return (
    <div className="scripture">
      {reading.passages.map((passage, index) => (
        <section
          className="passage"
          id={passageId(index)}
          aria-labelledby={passageHeadingId(index)}
          tabIndex={-1}
          key={index}
        >
          <div className="passage-title-row">
            <h2 id={passageHeadingId(index)}>
              {passage.book} <PassageReference passage={passage} />
            </h2>
            {index === 0 && audio && (
              <ListenButton
                ref={listenButton}
                label={
                  isBibleChapter(reading) ? "استمع إلى الإصحاح" : undefined
                }
                listening={listening}
                onToggle={onToggleListen}
              />
            )}
          </div>
          {index === 0 && isBibleChapter(reading) && !audio && (
            <p className="audio-unavailable">
              التسجيل الصوتي غير متاح لهذا الإصحاح حاليًا.
            </p>
          )}
          {isBibleChapter(reading) ? (
            <ChapterText reading={reading} />
          ) : (
            <div className="verse-text">
              {passage.verses?.map((verse) => (
                <Fragment key={verse.number}>
                  {verse.heading && <h3>{verse.heading}</h3>}
                  <span className="verse" data-v={verse.number}>
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
                    {verse.text}{" "}
                  </span>
                </Fragment>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
});
