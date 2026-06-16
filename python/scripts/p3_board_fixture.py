"""Construct real accepted Done and approved TODO records for the Desktop board probe."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "tests"))
from test_delivery import mixed_status_board_fixture  # noqa: E402


async def main() -> None:
    root = Path(sys.argv[1]).resolve(strict=True)
    storage, project_id, done_id, todo_ids = await mixed_status_board_fixture(root)
    try:
        print(json.dumps({
            "projectId": str(project_id), "doneId": str(done_id),
            "todoIds": [str(value) for value in todo_ids],
        }))
    finally:
        storage.close()


if __name__ == "__main__":
    asyncio.run(main())
