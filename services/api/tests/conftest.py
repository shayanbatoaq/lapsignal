from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

TEST_DATA_ROOT = Path(tempfile.mkdtemp(prefix="lapsignal-api-tests-")).resolve()
os.environ["DATABASE_URL"] = f"sqlite:///{(TEST_DATA_ROOT / 'lapsignal-tests.db').as_posix()}"
os.environ["DATA_DIR"] = str(TEST_DATA_ROOT)
os.environ["OPENROUTER_API_KEY"] = ""
os.environ["AI_MAX_RETRIES"] = "0"


def pytest_sessionstart(session) -> None:
    del session
    from lapsignal.database_init import initialize_database

    initialize_database()


def pytest_sessionfinish(session, exitstatus) -> None:
    del session, exitstatus
    from lapsignal.database import engine

    engine.dispose()
    expected_parent = Path(tempfile.gettempdir()).resolve()
    if TEST_DATA_ROOT.parent == expected_parent and TEST_DATA_ROOT.name.startswith(
        "lapsignal-api-tests-"
    ):
        shutil.rmtree(TEST_DATA_ROOT, ignore_errors=True)
