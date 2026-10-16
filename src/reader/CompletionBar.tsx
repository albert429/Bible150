import { Check, RotateCcw } from "lucide-react";
import "./CompletionBar.css";

export default function CompletionBar({
  done,
  doneLabel,
  disabled,
  onComplete,
}: {
  done: boolean;
  /** What was read, e.g. «تمت قراءة هذا اليوم». */
  doneLabel: string;
  disabled: boolean;
  onComplete: () => void;
}) {
  return (
    <div className={`reading-completion ${done ? "is-complete" : ""}`}>
      {done && (
        <p className="completion-state">
          <Check size={18} aria-hidden="true" /> {doneLabel}
        </p>
      )}
      <button
        className={done ? "quiet-button" : "primary"}
        disabled={disabled}
        onClick={onComplete}
      >
        {done ? (
          <RotateCcw size={18} aria-hidden="true" />
        ) : (
          <Check size={18} aria-hidden="true" />
        )}
        {done ? "تراجع" : "تمت القراءة"}
      </button>
    </div>
  );
}
