"""Current, bounded Project metadata for the read-only draft refiner.

This intentionally does not return a root path, file list, manifest contents,
source text, or script command. Those are outside the refiner disclosure boundary.
"""

from __future__ import annotations

import json
import re

from forge.projects import SCRIPT_NAMES, ProjectError, ProjectService
from forge.run_inspection import redact

MAX_SUMMARY_CHARS = 1024
_PLAIN_NAME = re.compile(r"^[\w .()+-]{1,120}$", re.UNICODE)
_PLAIN_BRANCH = re.compile(r"^[\w./+-]{1,120}$", re.UNICODE)
_SENSITIVE_LABEL = re.compile(
    r"(?i)(?:api[_-]?key|password|secret|token|credential|private|"
    r"[A-Za-z0-9_+-]{32,})"
)


def _safe_label(value: str | None, *, branch: bool = False) -> str | None:
    if value is None:
        return None
    allowed = _PLAIN_BRANCH if branch else _PLAIN_NAME
    if (not allowed.fullmatch(value) or _SENSITIVE_LABEL.search(value)
            or redact(value) != value or value in (".", "..")
            or (branch and (value.startswith("/") or "//" in value or ".." in value))):
        return "[redacted]"
    return value


def current_project_summary(projects: ProjectService, project_id: str) -> str:
    """Reprobe a trusted project and send only ADR 0012-approved metadata.

    Reprobe verifies the persisted root identity and reads at most the existing
    probe's bounded manifests. It does not execute the declared scripts. An
    unavailable or untrusted project raises instead of sending stale metadata.
    """
    probe = projects.reprobe(project_id)
    project = projects.get(project_id)
    if project is None:
        raise ProjectError("PROJECT_NOT_FOUND", "Project is not active in Forge")
    summary = json.dumps({
        "name": _safe_label(project.name),
        "projectType": probe.projectType,
        "packageManager": probe.packageManager,
        "branch": _safe_label(probe.currentBranch, branch=True),
        "workingTree": probe.workingTree,
        "declaredScripts": [name for name in SCRIPT_NAMES if getattr(probe.scripts, name)],
    }, ensure_ascii=False, separators=(",", ":"))
    if len(summary) > MAX_SUMMARY_CHARS:
        raise ProjectError("PROJECT_PROBE_STALE", "Project metadata exceeds refiner limit")
    return summary
