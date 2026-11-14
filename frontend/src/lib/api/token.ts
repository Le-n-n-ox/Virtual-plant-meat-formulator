const KEY = "vpmf.access_token";
let memoryToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const tokenStore = {
  get(): string | null {
    if (memoryToken) return memoryToken;
    memoryToken = storage()?.getItem(KEY) ?? null;
    return memoryToken;
  },
  set(token: string): void {
    memoryToken = token;
    storage()?.setItem(KEY, token);
    listeners.forEach((l) => l(token));
  },
  clear(): void {
    memoryToken = null;
    storage()?.removeItem(KEY);
    listeners.forEach((l) => l(null));
  },
  subscribe(listener: (token: string | null) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const getToken = (): string | null => tokenStore.get();
export const setToken = (token: string): void => tokenStore.set(token);
export const clearToken = (): void => tokenStore.clear();
export const subscribeToken = (
  listener: (token: string | null) => void,
): (() => void) => tokenStore.subscribe(listener);
