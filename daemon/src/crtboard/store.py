"""Tracked repositories and the tracked board, kept in SQLite.

crtboard-web shows one board, so tracking a board replaces any other; a
repository tracked twice keeps its first id. Ids are never reused, so an id a
browser still remembers cannot point at someone else's row.
"""

import json
import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path

COLUMN_KINDS = ("TO_DO", "BLOCKED", "IN_PROGRESS", "DONE")


@dataclass(frozen=True)
class TrackedBoard:
    id: str
    name: str
    columns: dict[str, str | None]


class Store:
    def __init__(self, path: Path | str):
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock, self._db:
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS tracked_repos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE
                );
                CREATE TABLE IF NOT EXISTS tracked_boards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    columns TEXT NOT NULL
                );
                """
            )

    def track_repo(self, name: str) -> str:
        with self._lock, self._db:
            row = self._db.execute("SELECT id FROM tracked_repos WHERE name = ?", (name,)).fetchone()
            if row:
                return str(row[0])
            return str(self._db.execute("INSERT INTO tracked_repos (name) VALUES (?)", (name,)).lastrowid)

    def update_repo(self, id: str, name: str) -> bool:
        with self._lock, self._db:
            # Renaming onto a repository tracked under another id merges the two.
            self._db.execute("DELETE FROM tracked_repos WHERE name = ? AND id != ?", (name, id))
            return self._db.execute("UPDATE tracked_repos SET name = ? WHERE id = ?", (name, id)).rowcount > 0

    def untrack_repo(self, id: str) -> None:
        with self._lock, self._db:
            self._db.execute("DELETE FROM tracked_repos WHERE id = ?", (id,))

    def tracked_repos(self) -> list[str]:
        with self._lock:
            return [r[0] for r in self._db.execute("SELECT name FROM tracked_repos ORDER BY id")]

    def track_board(self, name: str, columns: dict[str, str | None]) -> str:
        with self._lock, self._db:
            self._db.execute("DELETE FROM tracked_boards")
            cursor = self._db.execute(
                "INSERT INTO tracked_boards (name, columns) VALUES (?, ?)", (name, json.dumps(columns))
            )
            return str(cursor.lastrowid)

    def update_board(self, id: str, name: str, columns: dict[str, str | None]) -> bool:
        with self._lock, self._db:
            cursor = self._db.execute(
                "UPDATE tracked_boards SET name = ?, columns = ? WHERE id = ?",
                (name, json.dumps(columns), id),
            )
            return cursor.rowcount > 0

    def untrack_board(self, id: str) -> None:
        with self._lock, self._db:
            self._db.execute("DELETE FROM tracked_boards WHERE id = ?", (id,))

    def tracked_board(self) -> TrackedBoard | None:
        with self._lock:
            row = self._db.execute("SELECT id, name, columns FROM tracked_boards ORDER BY id DESC").fetchone()
        if not row:
            return None
        return TrackedBoard(id=str(row[0]), name=row[1], columns=json.loads(row[2]))
