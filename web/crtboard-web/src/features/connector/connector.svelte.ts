import { persisted } from "../../lib/persisted.svelte";
import { CrtboarddClient, HttpError, type TrackedBody, type TrackedKind } from "./api";
import { COLUMN_KINDS, type AvailableResources, type ColumnKind, type EventSum } from "./types";

const DEFAULT_PORT = 7777;
/** `CRTBOARD_EVENT_SUM` doubles as a heartbeat; this long without one counts as lost. */
const HEARTBEAT_TIMEOUT_MS = 15_000;
/** The CRT has room for two repositories. */
export const REPO_SLOTS = 2;

export interface TrackedRepo {
  name: string;
  id: string | null;
}

export interface TrackedBoard {
  name: string;
  id: string | null;
  columns: Record<ColumnKind, string | null>;
}

interface Settings {
  port: number;
  teamName: string;
  repos: (TrackedRepo | null)[];
  board: TrackedBoard | null;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

const emptyColumns = () =>
  Object.fromEntries(COLUMN_KINDS.map((kind) => [kind, null])) as Record<ColumnKind, string | null>;

/**
 * Connection to `crtboardd` and the user's tracked resources. Choices are
 * kept in localStorage and sent to the daemon as soon as they change.
 */
class Connector {
  status = $state<ConnectionStatus>("connecting");
  available = $state<AvailableResources>({ asanaBoards: [], gitRepos: [] });
  sum = $state<EventSum | null>(null);

  readonly settings = persisted<Settings>("crtboard:connector", {
    port: DEFAULT_PORT,
    teamName: "",
    repos: Array(REPO_SLOTS).fill(null),
    board: null,
  });

  #client: CrtboarddClient | null = null;
  #unsubscribe: (() => void) | null = null;
  #heartbeat: ReturnType<typeof setTimeout> | undefined;
  #attempt = 0;
  /** Serialises daemon writes per resource so ids are never assigned out of order. */
  #queues = new Map<string, Promise<unknown>>();

  constructor() {
    const port = Number(new URLSearchParams(location.search).get("port"));
    if (Number.isInteger(port) && port > 0) this.settings.value.port = port;
  }

  async connect(): Promise<void> {
    this.#close();
    const attempt = ++this.#attempt;
    this.status = "connecting";
    this.sum = null;
    const client = new CrtboarddClient(`http://localhost:${this.settings.value.port}`);
    try {
      const available = await client.available();
      if (attempt !== this.#attempt) return;
      this.#client = client;
      this.available = available;
      this.#restoreTracked();
      this.#unsubscribe = client.subscribe((sum) => this.#receive(sum));
      this.#armHeartbeat();
    } catch (error) {
      if (attempt !== this.#attempt) return;
      console.warn("could not reach crtboardd", error);
      this.status = "disconnected";
    }
  }

  setRepo(slot: number, name: string | null): void {
    const previous = this.settings.value.repos[slot];
    if ((previous?.name ?? null) === name) return;
    this.settings.value.repos[slot] = name === null ? null : { name, id: previous?.id ?? null };
    this.#syncRepo(slot, previous?.id ?? null);
  }

  setBoard(name: string | null): void {
    const previous = this.settings.value.board;
    if ((previous?.name ?? null) === name) return;
    this.settings.value.board = name === null ? null : { name, id: previous?.id ?? null, columns: emptyColumns() };
    this.#syncBoard(previous?.id ?? null);
  }

  setColumn(kind: ColumnKind, column: string | null): void {
    const board = this.settings.value.board;
    if (!board || board.columns[kind] === column) return;
    board.columns[kind] = column;
    this.#syncBoard(board.id);
  }

  #receive(sum: EventSum): void {
    this.sum = sum;
    this.status = "connected";
    this.#armHeartbeat();
  }

  #armHeartbeat(): void {
    clearTimeout(this.#heartbeat);
    this.#heartbeat = setTimeout(() => {
      this.#close();
      this.status = "disconnected";
    }, HEARTBEAT_TIMEOUT_MS);
  }

  #close(): void {
    clearTimeout(this.#heartbeat);
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#client = null;
  }

  /** Drops stored choices the daemon no longer offers, then re-sends the rest. */
  #restoreTracked(): void {
    const { repos, board } = this.settings.value;
    const repoNames = new Set(this.available.gitRepos.map((repo) => repo.name));
    repos.forEach((repo, slot) => {
      if (repo && !repoNames.has(repo.name)) repos[slot] = null;
      else if (repo) this.#syncRepo(slot, repo.id);
    });
    if (repos.length < REPO_SLOTS) repos.push(...Array(REPO_SLOTS - repos.length).fill(null));

    const available = this.available.asanaBoards.find((b) => b.name === board?.name);
    if (board && !available) {
      this.settings.value.board = null;
    } else if (board && available) {
      for (const kind of COLUMN_KINDS) {
        const column = board.columns[kind];
        if (column && !available.availableColumns.includes(column)) board.columns[kind] = null;
      }
      this.#syncBoard(board.id);
    }
  }

  #syncRepo(slot: number, previousId: string | null): void {
    this.#enqueue(`git:${slot}`, async (client) => {
      const repo = this.settings.value.repos[slot];
      const id = await this.#upsert(client, "git", repo?.id ?? previousId, repo ? { name: repo.name } : null);
      const current = this.settings.value.repos[slot];
      if (current) current.id = id;
    });
  }

  #syncBoard(previousId: string | null): void {
    this.#enqueue("asana", async (client) => {
      const board = this.settings.value.board;
      const body = board ? { name: board.name, columns: { ...board.columns } } : null;
      const id = await this.#upsert(client, "asana", board?.id ?? previousId, body);
      const current = this.settings.value.board;
      if (current) current.id = id;
    });
  }

  /** Creates, updates or deletes one tracked resource and returns its id. */
  async #upsert(
    client: CrtboarddClient,
    kind: TrackedKind,
    id: string | null,
    body: TrackedBody | null,
  ): Promise<string | null> {
    if (body === null) {
      if (id !== null) await client.untrack(kind, id);
      return null;
    }
    if (id !== null) {
      try {
        await client.update(kind, id, body);
        return id;
      } catch (error) {
        if (!(error instanceof HttpError && error.status === 404)) throw error;
      }
    }
    return (await client.track(kind, body)).id;
  }

  #enqueue(key: string, task: (client: CrtboarddClient) => Promise<void>): void {
    const client = this.#client;
    if (!client) return;
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const next = previous
      .then(() => task(client))
      .catch((error) => console.warn(`could not save ${key} to crtboardd`, error));
    this.#queues.set(key, next);
  }
}

export const connector = new Connector();
