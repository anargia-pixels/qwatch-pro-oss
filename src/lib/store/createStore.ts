import { useSyncExternalStore } from "react";

export type Store<State> = {
  get: () => State;
  set: (patch: Partial<State>) => void;
  subscribe: (listener: () => void) => () => void;
  /** A hook; the `use` prefix lets the React Compiler and lint treat it as one. */
  useSelector: <Selected>(select: (state: State) => Selected) => Selected;
};

/** Minimal external store; selectors must return stable references (state fields, not new objects). */
export function createStore<State>(initial: State): Store<State> {
  let state = initial;
  const listeners = new Set<() => void>();

  const get = (): State => state;
  const set = (patch: Partial<State>): void => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const useSelector = <Selected>(
    select: (current: State) => Selected,
  ): Selected => useSyncExternalStore(subscribe, () => select(state));

  return { get, set, subscribe, useSelector };
}
