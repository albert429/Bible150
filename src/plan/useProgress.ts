import { useSyncExternalStore } from "react";
import {
  PROGRESS_KEY,
  createReader,
  importBackup,
  loadProgress,
  selectReader,
  setCompletion,
  type Reader,
} from "./progress";

type Snapshot = {
  profiles: Reader[];
  member: Reader | null;
  error: string;
  switches: number;
};

const listeners = new Set<() => void>();
let snapshot: Snapshot | undefined;

function read() {
  const state = loadProgress(localStorage);
  return {
    profiles: state.profiles,
    member: state.profiles.find((p) => p.id === state.activeId) || null,
  };
}
function load(): Snapshot {
  try {
    return { ...read(), error: "", switches: 0 };
  } catch (err) {
    return {
      profiles: [],
      member: null,
      error: (err as Error).message,
      switches: 0,
    };
  }
}
function get() {
  return (snapshot ??= load());
}
function update(patch: Partial<Snapshot>) {
  snapshot = { ...get(), ...patch };
  listeners.forEach((listener) => listener());
}
function fail(err: unknown) {
  update({ error: (err as Error).message });
}
function act(run: () => unknown, switched = 0) {
  try {
    run();
    update({
      ...read(),
      error: "",
      switches: get().switches + switched,
    });
    return true;
  } catch (err) {
    fail(err);
    return false;
  }
}
function onStorage(event: StorageEvent) {
  if (event.key !== PROGRESS_KEY && event.key !== null) return;
  try {
    const next = read();
    update({
      ...next,
      switches: get().switches + Number(next.member?.id !== get().member?.id),
    });
  } catch (err) {
    fail(err);
  }
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

const actions = {
  select: (id: string | null) => act(() => selectReader(localStorage, id), 1),
  create: (name: string, start: string) =>
    act(() => createReader(localStorage, name, start), 1),
  restore: (text: string) => act(() => importBackup(localStorage, text), 1),
  complete: (id: string, day: number, done: boolean) =>
    act(() => setCompletion(localStorage, id, day, done)),
  fail,
  clearError() {
    if (get().error) update({ error: "" });
  },
};

/** `switches` counts changes of the active reader, including re-selecting the same one. */
export function useProgress() {
  return { ...useSyncExternalStore(subscribe, get), ...actions };
}
