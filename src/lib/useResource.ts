import { useEffect, useState } from "react";

type Client<T> = {
  load(key: string): Promise<T>;
  peek(key: string): T | undefined;
};

/** Load one keyed resource, ignoring responses for a key that is no longer current. */
export function useResource<T>(client: Client<T>, key: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>({
    key,
  });
  const cached = client.peek(key);
  useEffect(() => {
    let active = true;
    setResult({ key });
    client.load(key).then(
      (data) => {
        if (active) setResult({ key, data });
      },
      (error: Error) => {
        if (active) setResult({ key, error: error.message });
      },
    );
    return () => {
      active = false;
    };
  }, [client, key, attempt]);
  return {
    data: cached || (result.key === key ? result.data : undefined),
    error: result.key === key ? result.error : undefined,
    retry: () => {
      setResult({ key });
      setAttempt((n) => n + 1);
    },
  };
}
