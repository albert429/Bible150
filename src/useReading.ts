import { useEffect, useState } from "react";
import { readings, type Day } from "./plan/readings";

export function useReading<T extends Day | Day[]>(key: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>({ key });
  const cached = readings.peek(key) as T | undefined;
  useEffect(() => {
    let active = true;
    setResult({ key });
    readings.load(key).then(
      (data) => {
        if (active) setResult({ key, data: data as T });
      },
      (error: Error) => {
        if (active) setResult({ key, error: error.message });
      },
    );
    return () => {
      active = false;
    };
  }, [key, attempt]);
  return {
    data: cached || (result.key === key ? result.data : undefined),
    error: result.key === key ? result.error : undefined,
    retry: () => {
      setResult({ key });
      setAttempt((n) => n + 1);
    },
  };
}
