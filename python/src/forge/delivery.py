"""Snapshot-bound delivery evidence and explicit, local Git merge intents."""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import subprocess
import threading
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

from forge.conversations import timestamp
from forge.final_acceptance import FinalAcceptanceService
from forge.handoffs import CodeSnapshot
from forge.persistence import ForgePersistence
from forge.projects import ProjectService

SHA = re.compile(r"^[0-9a-f]{40,64}$")


class DeliveryError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class DeliverySummary(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    deliveryId: UUID
    projectId: UUID
    taskId: UUID
    acceptanceDecisionId: UUID
    contractRevision: int = Field(ge=1)
    contractHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    planStatus: Literal["not_configured"]
    attemptRunIds: list[UUID]
    snapshotId: UUID
    snapshotCommit: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    baseRevision: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    reviewReportIds: list[UUID]
    verifyReportIds: list[UUID]
    criterionDecisionIds: list[UUID]
    advisoryWaiverIds: list[UUID]
    unresolvedRisks: list[str]
    finalStatus: Literal["accepted"]
    acceptedAt: str
    createdAt: str
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")


class MergePreview(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    deliveryId: UUID
    targetBranch: str
    targetHead: str | None
    snapshotCommit: str
    canMerge: bool
    blockers: list[str]
    operationId: UUID | None
    operationState: Literal["intent", "merged", "conflict", "unknown"] | None
    resultCommit: str | None


class MergeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    deliveryId: UUID
    targetBranch: str = Field(min_length=1, max_length=240)
    expectedTargetHead: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    expectedSnapshotId: UUID
    confirmed: Literal[True]
    idempotencyKey: UUID

    @field_validator("targetBranch")
    @classmethod
    def safe_branch_label(cls, value: str) -> str:
        if any(ord(character) < 32 or ord(character) == 127 for character in value):
            raise ValueError("Branch contains control characters")
        return value


class MergeReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    operationId: UUID
    deliveryId: UUID
    targetBranch: str
    expectedTargetHead: str
    snapshotCommit: str
    state: Literal["intent", "merged", "conflict", "unknown"]
    resultCommit: str | None
    errorCode: str | None
    createdAt: str
    updatedAt: str


def _git(root: Path, *args: str, timeout: int = 30, hooks: Path | None = None) -> str:
    command = ["git"]
    if hooks is not None:
        command += ["-c", f"core.hooksPath={hooks}"]
    command += ["-C", str(root), *args]
    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=timeout, check=False,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )
    except (OSError, subprocess.TimeoutExpired, UnicodeError) as error:
        raise DeliveryError("MERGE_GIT_UNAVAILABLE") from error
    if result.returncode or len(result.stdout) > 65536:
        raise DeliveryError("MERGE_GIT_FAILED")
    return result.stdout.strip()


def _receipt(row: sqlite3.Row) -> MergeReceipt:
    return MergeReceipt(
        operationId=UUID(row["operation_id"]), deliveryId=UUID(row["delivery_id"]),
        targetBranch=row["target_branch"], expectedTargetHead=row["expected_target_head"],
        snapshotCommit=row["snapshot_commit"], state=row["state"],
        resultCommit=row["result_commit"], errorCode=row["error_code"],
        createdAt=row["created_at"], updatedAt=row["updated_at"],
    )


class DeliveryService:
    def __init__(self, storage: ForgePersistence, projects: ProjectService,
                 final: FinalAcceptanceService) -> None:
        self.storage = storage
        self.projects = projects
        self.final = final
        self.merge_root = storage.data_dir / "merge-workspaces"
        self._merge_lock = threading.Lock()

    def get(self, project_id: UUID, task_id: UUID) -> DeliverySummary:
        view = self.final.get(project_id, task_id)
        if view.status != "accepted" or view.decision is None or view.snapshotId is None:
            raise DeliveryError("DELIVERY_NOT_ACCEPTED")
        db = self.storage.session()
        existing = db.execute(
            "SELECT summary_json FROM delivery_records WHERE acceptance_decision_id=?",
            (str(view.decision.decisionId),),
        ).fetchone()
        if existing is not None:
            return DeliverySummary.model_validate_json(existing["summary_json"])
        contract = db.execute(
            "SELECT content_hash FROM task_revisions WHERE task_id=? AND revision=?",
            (str(task_id), view.contractRevision),
        ).fetchone()
        snapshot_row = db.execute(
            "SELECT snapshot_json FROM code_snapshots WHERE snapshot_id=? AND project_id=?",
            (str(view.snapshotId), str(project_id)),
        ).fetchone()
        if contract is None or snapshot_row is None:
            raise DeliveryError("DELIVERY_SOURCE_STALE")
        snapshot = CodeSnapshot.model_validate_json(snapshot_row["snapshot_json"])
        params = (str(project_id), str(task_id))
        attempts = db.execute(
            "SELECT r.run_id FROM runs r JOIN run_attempts a ON a.run_id=r.run_id "
            "WHERE r.project_id=? AND r.task_id=? ORDER BY a.rowid", params,
        ).fetchall()
        reviews = db.execute(
            "SELECT review_id FROM review_reports WHERE project_id=? AND task_id=? "
            "ORDER BY rowid", params,
        ).fetchall()
        checks = db.execute(
            "SELECT r.report_id FROM verifier_reports r JOIN verifier_jobs j "
            "ON j.verification_id=r.verification_id WHERE j.project_id=? AND j.task_id=? "
            "ORDER BY r.rowid", params,
        ).fetchall()
        waivers = db.execute(
            "SELECT waiver_id FROM review_advisory_waivers WHERE project_id=? "
            "AND task_id=? AND snapshot_id=? ORDER BY rowid",
            (*params, str(snapshot.snapshotId)),
        ).fetchall()
        matrix = self.final.matrix.get(project_id, task_id)
        risks = [f"AC:{item.criterion.id}:risk_accepted" for item in matrix.criteria
                 if item.status == "risk_accepted"]
        risks += [f"Review:{item.issueId}:waived" for item in view.advisoryIssues
                  if item.status == "waived"]
        base = {
            "deliveryId": str(uuid4()), "projectId": str(project_id), "taskId": str(task_id),
            "acceptanceDecisionId": str(view.decision.decisionId),
            "contractRevision": view.contractRevision, "contractHash": contract["content_hash"],
            "planStatus": "not_configured", "attemptRunIds": [row["run_id"] for row in attempts],
            "snapshotId": str(snapshot.snapshotId), "snapshotCommit": snapshot.commitSha,
            "baseRevision": snapshot.baseRevision,
            "reviewReportIds": [row["review_id"] for row in reviews],
            "verifyReportIds": [row["report_id"] for row in checks],
            "criterionDecisionIds": [str(item) for item in view.criterionDecisionIds],
            "advisoryWaiverIds": [row["waiver_id"] for row in waivers],
            "unresolvedRisks": risks, "finalStatus": "accepted",
            "acceptedAt": view.decision.createdAt, "createdAt": timestamp(),
        }
        base["contentHash"] = hashlib.sha256(json.dumps(
            base, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode()).hexdigest()
        summary = DeliverySummary.model_validate_json(json.dumps(base))
        with self.storage.transaction() as transaction:
            fresh = self.final.get(project_id, task_id)
            if (fresh.status != "accepted" or fresh.decision is None
                    or fresh.decision.decisionId != view.decision.decisionId
                    or fresh.basisHash != view.basisHash):
                raise DeliveryError("DELIVERY_SOURCE_STALE")
            prior = transaction.execute(
                "SELECT summary_json FROM delivery_records WHERE acceptance_decision_id=?",
                (str(view.decision.decisionId),),
            ).fetchone()
            if prior is not None:
                return DeliverySummary.model_validate_json(prior["summary_json"])
            transaction.execute(
                "INSERT INTO delivery_records(delivery_id,project_id,task_id,"
                "acceptance_decision_id,snapshot_id,content_hash,summary_json,created_at) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (str(summary.deliveryId), str(project_id), str(task_id),
                 str(summary.acceptanceDecisionId), str(summary.snapshotId),
                 summary.contentHash, summary.model_dump_json(), summary.createdAt),
            )
        return summary

    def _repo(self, project_id: UUID) -> Path:
        project = self.projects.get(str(project_id))
        if project is None or project.repositoryType != "git" or project.gitRoot is None:
            raise DeliveryError("MERGE_GIT_REQUIRED")
        root = Path(project.gitRoot).resolve(strict=True)
        if root != Path(project.gitRoot) or not root.is_dir():
            raise DeliveryError("MERGE_REPO_CHANGED")
        if _git(root, "rev-parse", "--show-toplevel") != str(root):
            raise DeliveryError("MERGE_REPO_CHANGED")
        return root

    def _snapshot(self, delivery: DeliverySummary, root: Path) -> None:
        ref = f"refs/forge/snapshots/{delivery.snapshotId}"
        if _git(root, "rev-parse", "--verify", f"{ref}^{{commit}}") != delivery.snapshotCommit:
            raise DeliveryError("MERGE_SNAPSHOT_CHANGED")

    def _target(self, root: Path, branch: str) -> str:
        if (branch.startswith("-") or _git(root, "check-ref-format", "--branch", branch)
                != branch):
            raise DeliveryError("MERGE_BRANCH_INVALID")
        if _git(root, "symbolic-ref", "--quiet", "--short", "HEAD") != branch:
            raise DeliveryError("MERGE_TARGET_NOT_CHECKED_OUT")
        if _git(root, "status", "--porcelain", "--untracked-files=all"):
            raise DeliveryError("MERGE_TARGET_DIRTY")
        if (root / ".git" / "MERGE_HEAD").exists():
            raise DeliveryError("MERGE_TARGET_DIRTY")
        return _git(root, "rev-parse", "--verify", f"refs/heads/{branch}^{{commit}}")

    def preview(self, project_id: UUID, task_id: UUID) -> MergePreview:
        delivery = self.get(project_id, task_id)
        project = self.projects.get(str(project_id))
        assert project is not None
        branch = project.defaultBranch or ""
        blockers: list[str] = []
        target_head: str | None = None
        operation = self.storage.session().execute(
            "SELECT * FROM merge_operations WHERE delivery_id=? ORDER BY rowid DESC LIMIT 1",
            (str(delivery.deliveryId),),
        ).fetchone()
        try:
            root = self._repo(project_id)
            self._snapshot(delivery, root)
            if not branch:
                raise DeliveryError("MERGE_TARGET_UNKNOWN")
            target_head = self._target(root, branch)
            if target_head != delivery.baseRevision:
                blockers.append("MERGE_REVALIDATION_REQUIRED")
            if target_head == delivery.snapshotCommit:
                blockers.append("MERGE_ALREADY_APPLIED")
        except (DeliveryError, OSError) as error:
            blockers.append(getattr(error, "code", "MERGE_REPO_CHANGED"))
        if operation:
            blockers.append("MERGE_OPERATION_EXISTS")
        return MergePreview(
            deliveryId=delivery.deliveryId, targetBranch=branch,
            targetHead=target_head, snapshotCommit=delivery.snapshotCommit,
            canMerge=not blockers, blockers=blockers,
            operationId=UUID(operation["operation_id"]) if operation else None,
            operationState=operation["state"] if operation else None,
            resultCommit=operation["result_commit"] if operation else None,
        )

    def _set_state(self, operation_id: UUID, state: str,
                   result_commit: str | None, error_code: str | None) -> MergeReceipt:
        with self.storage.transaction() as db:
            db.execute(
                "UPDATE merge_operations SET state=?,result_commit=?,error_code=?,updated_at=? "
                "WHERE operation_id=? AND state='intent'",
                (state, result_commit, error_code, timestamp(), str(operation_id)),
            )
            row = db.execute("SELECT * FROM merge_operations WHERE operation_id=?",
                             (str(operation_id),)).fetchone()
            assert row is not None
            return _receipt(row)

    def _reconcile(self, operation: MergeReceipt, root: Path) -> MergeReceipt:
        if operation.state != "intent":
            return operation
        head = _git(root, "rev-parse", "--verify",
                    f"refs/heads/{operation.targetBranch}^{{commit}}")
        if head == operation.expectedTargetHead:
            return operation
        parents = _git(root, "rev-list", "--parents", "-n", "1", head).split()
        if (len(parents) == 3 and parents[1] == operation.expectedTargetHead
                and parents[2] == operation.snapshotCommit
                and self._candidate_matches(operation, root, head)):
            return self._set_state(operation.operationId, "merged", head, None)
        return self._set_state(operation.operationId, "unknown", None,
                               "MERGE_OUTCOME_UNKNOWN")

    def _candidate_matches(self, operation: MergeReceipt, root: Path, head: str) -> bool:
        """Require the surviving Forge-owned candidate, not merely matching parents."""
        candidate = self.merge_root / str(operation.operationId)
        if (self.merge_root.is_symlink() or candidate.is_symlink()
                or not candidate.is_dir()
                or candidate.resolve(strict=True).parent != self.merge_root.resolve(strict=True)):
            return False
        try:
            source_common = Path(_git(root, "rev-parse", "--git-common-dir"))
            candidate_common = Path(_git(candidate, "rev-parse", "--git-common-dir"))
            if not source_common.is_absolute():
                source_common = root / source_common
            if not candidate_common.is_absolute():
                candidate_common = candidate / candidate_common
            return (source_common.resolve(strict=True) == candidate_common.resolve(strict=True)
                    and _git(candidate, "rev-parse", "HEAD") == head)
        except (DeliveryError, OSError):
            return False

    def recover_pending(self) -> dict[str, int]:
        """Audit prior merge intents without redoing a Git operation."""
        counts = {"merged": 0, "pending": 0, "unknown": 0}
        rows = self.storage.session().execute(
            "SELECT * FROM merge_operations WHERE state='intent'"
        ).fetchall()
        for row in rows:
            operation = _receipt(row)
            try:
                root = self._repo(UUID(row["project_id"]))
                result = self._reconcile(operation, root)
                if result.state == "intent":
                    with self.storage.transaction() as db:
                        db.execute(
                            "UPDATE merge_operations SET error_code=?,updated_at=? "
                            "WHERE operation_id=? AND state='intent'",
                            ("MERGE_RETRY_REQUIRES_CONFIRMATION", timestamp(),
                             str(operation.operationId)),
                        )
                    counts["pending"] += 1
                else:
                    counts[result.state] += 1
            except (DeliveryError, OSError):
                # A missing or inaccessible repository cannot establish an outcome.
                # Preserve the intent for later human investigation.
                counts["unknown"] += 1
        return counts

    def merge(self, value: MergeRequest) -> MergeReceipt:
        with self._merge_lock:
            return self._merge_locked(value)

    def _merge_locked(self, value: MergeRequest) -> MergeReceipt:
        delivery = self.get(value.projectId, value.taskId)
        if (delivery.deliveryId != value.deliveryId
                or delivery.snapshotId != value.expectedSnapshotId):
            raise DeliveryError("MERGE_DELIVERY_STALE")
        root = self._repo(value.projectId)
        db = self.storage.session()
        prior = db.execute("SELECT * FROM merge_operations WHERE idempotency_key=?",
                           (str(value.idempotencyKey),)).fetchone()
        if prior is not None:
            receipt = _receipt(prior)
            if (receipt.deliveryId != value.deliveryId
                    or receipt.targetBranch != value.targetBranch
                    or receipt.expectedTargetHead != value.expectedTargetHead
                    or receipt.snapshotCommit != delivery.snapshotCommit):
                raise DeliveryError("MERGE_OPERATION_CONFLICT")
            receipt = self._reconcile(receipt, root)
            if receipt.state != "intent":
                return receipt
        else:
            preview = self.preview(value.projectId, value.taskId)
            if (not preview.canMerge or preview.targetBranch != value.targetBranch
                    or preview.targetHead != value.expectedTargetHead):
                raise DeliveryError("MERGE_REVALIDATION_REQUIRED")
            with self.storage.transaction() as transaction:
                existing = transaction.execute(
                    "SELECT 1 FROM merge_operations WHERE delivery_id=? AND target_branch=?",
                    (str(value.deliveryId), value.targetBranch),
                ).fetchone()
                if existing:
                    raise DeliveryError("MERGE_OPERATION_CONFLICT")
                operation_id = uuid4()
                now = timestamp()
                transaction.execute(
                    "INSERT INTO merge_operations(operation_id,idempotency_key,delivery_id,"
                    "project_id,task_id,target_branch,expected_target_head,snapshot_commit,"
                    "state,result_commit,error_code,created_at,updated_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (str(operation_id), str(value.idempotencyKey), str(value.deliveryId),
                     str(value.projectId), str(value.taskId), value.targetBranch,
                     value.expectedTargetHead, delivery.snapshotCommit, "intent", None,
                     None, now, now),
                )
                row = transaction.execute("SELECT * FROM merge_operations WHERE operation_id=?",
                                          (str(operation_id),)).fetchone()
                assert row is not None
                receipt = _receipt(row)
        self._snapshot(delivery, root)
        self._accepted_current(delivery)
        head = self._target(root, value.targetBranch)
        if head != value.expectedTargetHead or head != delivery.baseRevision:
            raise DeliveryError("MERGE_REVALIDATION_REQUIRED")
        self.merge_root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.merge_root.is_symlink() or self.merge_root.resolve(strict=True) != self.merge_root:
            raise DeliveryError("MERGE_ROOT_INVALID")
        hooks = self.merge_root / "empty-hooks"
        hooks.mkdir(mode=0o700, exist_ok=True)
        candidate = self.merge_root / str(receipt.operationId)
        if candidate.is_symlink():
            raise DeliveryError("MERGE_ROOT_INVALID")
        if not candidate.exists():
            _git(root, "worktree", "add", "--detach", str(candidate),
                 receipt.expectedTargetHead, timeout=60, hooks=hooks)
        if not candidate.is_dir() or candidate.resolve(strict=True).parent != self.merge_root:
            raise DeliveryError("MERGE_ROOT_INVALID")
        source_common = Path(_git(root, "rev-parse", "--git-common-dir"))
        candidate_common = Path(_git(candidate, "rev-parse", "--git-common-dir"))
        if not source_common.is_absolute():
            source_common = root / source_common
        if not candidate_common.is_absolute():
            candidate_common = candidate / candidate_common
        if source_common.resolve(strict=True) != candidate_common.resolve(strict=True):
            raise DeliveryError("MERGE_ROOT_INVALID")
        candidate_head = _git(candidate, "rev-parse", "HEAD")
        if candidate_head == receipt.expectedTargetHead:
            try:
                _git(candidate, "merge", "--no-ff", "--no-edit", "--",
                     receipt.snapshotCommit, timeout=90, hooks=hooks)
            except DeliveryError:
                conflict = _git(candidate, "status", "--porcelain")
                code = "MERGE_CONFLICT" if conflict else "MERGE_GIT_FAILED"
                self._set_state(receipt.operationId, "conflict" if conflict else "unknown",
                                None, code)
                raise DeliveryError(code) from None
            candidate_head = _git(candidate, "rev-parse", "HEAD")
        parents = _git(candidate, "rev-list", "--parents", "-n", "1", candidate_head).split()
        if (len(parents) != 3 or parents[1] != receipt.expectedTargetHead
                or parents[2] != receipt.snapshotCommit):
            self._set_state(receipt.operationId, "unknown", None, "MERGE_OUTCOME_UNKNOWN")
            raise DeliveryError("MERGE_OUTCOME_UNKNOWN")
        self._accepted_current(delivery)
        try:
            _git(root, "merge", "--ff-only", "--", candidate_head,
                 timeout=60, hooks=hooks)
        except DeliveryError:
            # The ref may have moved. Never force or reset the user's checkout.
            self._reconcile(receipt, root)
            raise DeliveryError("MERGE_REVALIDATION_REQUIRED") from None
        result = self._reconcile(receipt, root)
        if result.state != "merged":
            raise DeliveryError("MERGE_OUTCOME_UNKNOWN")
        try:
            _git(root, "worktree", "remove", str(candidate), timeout=60, hooks=hooks)
        except DeliveryError:
            # The merge is durable; orphan cleanup remains a separate diagnosis.
            pass
        return result

    def _accepted_current(self, delivery: DeliverySummary) -> None:
        view = self.final.get(delivery.projectId, delivery.taskId)
        if (view.status != "accepted" or view.decision is None
                or view.decision.decisionId != delivery.acceptanceDecisionId
                or view.snapshotId != delivery.snapshotId):
            raise DeliveryError("MERGE_DELIVERY_STALE")
