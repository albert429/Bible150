import { useEffect, useState } from "react";
import { today } from "./format";

export function useToday() {
  const [date, setDate] = useState(today);
  useEffect(() => {
    const tick = () => setDate(today());
    const timer = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return date;
}
