"""Real owned process trees, cancellation isolation and port release on macOS."""

import asyncio
import os
import signal
import socket
import sys
from pathlib import Path
from uuid import uuid4

import pytest

from forge.processes import ProcessController, ProcessError

TREE_PROGRAM = """
import os, signal, socket, subprocess, sys, time
from pathlib import Path
root, role, behavior = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
(root / (role + '.pid')).write_text(str(os.getpid()))
if role == 'grandchild':
    server = socket.socket()
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', 0))
    server.listen(1)
    (root / 'port').write_text(str(server.getsockname()[1]))
    if behavior == 'hang':
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
    while True:
        (root / 'heartbeat').write_text(str(time.monotonic()))
        time.sleep(.05)
else:
    child_role = 'child' if role == 'parent' else 'grandchild'
    child = subprocess.Popen([sys.executable, __file__, str(root), child_role, behavior])
    if role == 'parent' and behavior == 'parent-exits':
        sys.exit(0)
    child.wait()
"""


async def _wait_for(path: Path) -> str:
    for _ in range(150):
        if path.exists():
            return path.read_text()
        await asyncio.sleep(0.04)
    raise AssertionError(f"Expected fixture marker {path.name}")


@pytest.mark.asyncio
async def test_process_tree_cancel_is_run_scoped_and_releases_port(tmp_path: Path) -> None:
    fixture = tmp_path / "tree.py"
    fixture.write_text(TREE_PROGRAM)
    controller = ProcessController(uuid4(), tmp_path / "journal", 0.25, 2)
    a, b = tmp_path / "A", tmp_path / "B"
    a.mkdir()
    b.mkdir()
    run_a = await controller.spawn(
        "run-A", sys.executable, [str(fixture), str(a), "parent", "hang"], a
    )
    run_b = await controller.spawn(
        "run-B", sys.executable, [str(fixture), str(b), "parent", "normal"], b
    )
    user = await asyncio.create_subprocess_exec(
        sys.executable, "-c", "import time;time.sleep(40)", start_new_session=True
    )
    try:
        port = int(await _wait_for(a / "port"))
        await _wait_for(b / "port")
        for role in ("parent", "child", "grandchild"):
            assert int(await _wait_for(a / f"{role}.pid")) > 0
        report = await controller.cancel("run-A")
        assert report.confirmed and report.forced
        assert report.processIds == [run_a.descriptor.processId]
        assert (await controller.cancel("run-A")) == report
        assert not controller.has_active("run-A")
        assert controller.has_active("run-B")
        assert user.returncode is None
        before = (a / "heartbeat").read_text()
        await asyncio.sleep(0.2)
        assert (a / "heartbeat").read_text() == before
        with socket.socket() as rebound:
            rebound.bind(("127.0.0.1", port))
        assert (await controller.cancel("run-B")).confirmed
        assert not controller.has_active("run-B")
        assert await run_a.wait() is not None
        assert await run_b.wait() is not None
        assert controller.inspect(run_a.descriptor.processId).status == "cancelled"
        other = ProcessController(uuid4(), tmp_path / "journal")
        assert other.inspect_orphans() == []
    finally:
        await controller.dispose()
        if user.returncode is None:
            os.killpg(user.pid, signal.SIGTERM)
        await user.wait()


@pytest.mark.asyncio
async def test_parent_exit_and_invalid_process_requests(tmp_path: Path) -> None:
    fixture = tmp_path / "tree.py"
    fixture.write_text(TREE_PROGRAM)
    target = tmp_path / "orphaned-child"
    target.mkdir()
    controller = ProcessController(uuid4(), tmp_path / "journal", 0.3, 2)
    with pytest.raises(ProcessError, match="PROCESS_INVALID_RUN"):
        await controller.spawn("../escape", sys.executable, ["-V"], target)
    session = await controller.spawn(
        "run-parent-exit", sys.executable,
        [str(fixture), str(target), "parent", "parent-exits"], target,
    )
    try:
        await _wait_for(target / "port")
        assert await session.wait() == 0
        assert controller.has_active("run-parent-exit")
        result = await controller.cancel("run-parent-exit")
        assert result.confirmed and not controller.has_active("run-parent-exit")
    finally:
        await controller.dispose()
