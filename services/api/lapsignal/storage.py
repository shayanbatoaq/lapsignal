from __future__ import annotations

import hashlib
import json
from pathlib import Path

import polars as pl


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _safe_path(self, relative: str) -> Path:
        candidate = (self.root / relative).resolve()
        if candidate != self.root and self.root not in candidate.parents:
            raise ValueError("storage path escapes configured data directory")
        return candidate

    def write_json(self, relative: str, payload: object) -> Path:
        path = self._safe_path(relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return path

    def append_jsonl(self, relative: str, rows: list[dict]) -> Path:
        path = self._safe_path(relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as stream:
            for row in rows:
                stream.write(json.dumps(row, separators=(",", ":")) + "\n")
        return path

    def write_parquet(self, relative: str, rows: list[dict]) -> Path:
        path = self._safe_path(relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        pl.DataFrame(rows).write_parquet(path, compression="zstd")
        return path

    @staticmethod
    def checksum(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
