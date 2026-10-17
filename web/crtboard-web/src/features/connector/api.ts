import type {
  AvailableResources,
  EventSum,
  TrackedBoardBody,
  TrackedRepoBody,
  TrackedResource,
} from "./types";

const REQUEST_TIMEOUT_MS = 5000;

export type TrackedKind = "git" | "asana";
export type TrackedBody = TrackedRepoBody | TrackedBoardBody;

/** REST and server-sent-event client for the local `crtboardd`. */
export class CrtboarddClient {
  constructor(readonly baseUrl: string) {}

  available(): Promise<AvailableResources> {
    return this.#request("GET", "/resources/available");
  }

  track(kind: TrackedKind, body: TrackedBody): Promise<TrackedResource> {
    return this.#request("POST", `/resources/${kind}/tracked`, body);
  }

  update(kind: TrackedKind, id: string, body: TrackedBody): Promise<unknown> {
    return this.#request("PUT", `/resources/${kind}/tracked/${encodeURIComponent(id)}`, body);
  }

  untrack(kind: TrackedKind, id: string): Promise<unknown> {
    return this.#request("DELETE", `/resources/${kind}/tracked/${encodeURIComponent(id)}`);
  }

  /** Subscribes to `CRTBOARD_EVENT_SUM` events and returns an unsubscribe function. */
  subscribe(onSum: (sum: EventSum) => void): () => void {
    const source = new EventSource(`${this.baseUrl}/events`);
    source.addEventListener("CRTBOARD_EVENT_SUM", (event) => {
      try {
        onSum(JSON.parse((event as MessageEvent<string>).data));
      } catch (error) {
        console.warn("crtboardd sent an unreadable event", error);
      }
    });
    return () => source.close();
  }

  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new HttpError(method, path, response.status);
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

export class HttpError extends Error {
  constructor(
    method: string,
    path: string,
    readonly status: number,
  ) {
    super(`${method} ${path} failed with ${status}`);
  }
}
