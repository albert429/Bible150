type Options<T> = {
  url: (key: string) => string;
  validate: (data: unknown, key: string) => data is T;
  message: (key: string) => string;
};

// Static public JSON only. A shared pending request survives component unmounts
// and React Strict Mode; failures are never cached, so a retry fetches again.
export function createJsonClient<T>(
  { url, validate, message }: Options<T>,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15000,
) {
  const cache = new Map<string, T>();
  const pending = new Map<string, Promise<T>>();
  function load(key: string): Promise<T> {
    if (cache.has(key)) return Promise.resolve(cache.get(key) as T);
    const existing = pending.get(key);
    if (existing) return existing;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const request = Promise.resolve()
      .then(async () => {
        const response = await fetcher(url(key), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const data: unknown = await response.json();
        if (!validate(data, key)) throw new Error("Invalid data");
        cache.set(key, data);
        return data;
      })
      .catch(() => {
        throw new Error(message(key));
      })
      .finally(() => {
        clearTimeout(timeout);
        pending.delete(key);
      });
    pending.set(key, request);
    return request;
  }
  return { load, peek: (key: string) => cache.get(key) };
}
