import type { Ref } from "react";
import { Headphones } from "lucide-react";

export default function ListenButton({
  listening,
  onToggle,
  ref,
}: {
  listening: boolean;
  onToggle: () => void;
  ref: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      className="listen-button"
      onClick={onToggle}
      aria-label={listening ? "إيقاف وإغلاق المشغل" : "استمع إلى قراءة اليوم"}
      aria-pressed={listening}
    >
      <Headphones size={16} aria-hidden="true" />
      {listening ? "إغلاق المشغل" : "استمع"}
    </button>
  );
}
