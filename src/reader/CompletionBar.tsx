import { Check, RotateCcw } from "lucide-react";

export default function CompletionBar({
  done,
  disabled,
  onComplete,
}: {
  done: boolean;
  disabled: boolean;
  onComplete: () => void;
}) {
  return (
    <div className={`reading-completion ${done ? "is-complete" : ""}`}>
      {done && (
        <p className="completion-state">
          <Check size={18} aria-hidden="true" /> تمت قراءة هذا اليوم
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
