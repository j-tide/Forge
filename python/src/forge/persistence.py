"""Host-owned SQLite boundary compatible with the frozen Node schema history."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from importlib.resources import files
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal, cast
from uuid import uuid4

if TYPE_CHECKING:
    from forge.projects import Project, ProjectProbe


class PersistenceError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class QueryResult:
    """Cursor surface retained inside persistence; domain services see rows only."""

    def __init__(self, cursor: sqlite3.Cursor) -> None:
        self._cursor = cursor

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount

    def fetchone(self) -> sqlite3.Row | None:
        return cast(sqlite3.Row | None, self._cursor.fetchone())

    def fetchall(self) -> list[sqlite3.Row]:
        return self._cursor.fetchall()

    def __iter__(self) -> Iterator[sqlite3.Row]:
        return iter(self._cursor)


class PersistenceSession:
    """Host-owned SQL session. No sqlite3 connection crosses this boundary."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection

    def execute(self, sql: str, parameters: tuple[Any, ...] = ()) -> QueryResult:
        return QueryResult(self._connection.execute(sql, parameters))


@dataclass(frozen=True)
class Migration:
    version: int
    sql: str
    checksum: str


def cjk_short_terms(text: str) -> set[str]:
    """Bounded character/bigram postings for one and two Han-character queries."""
    runs: list[str] = []
    current = ""
    for char in text:
        if "\u3400" <= char <= "\u9fff":
            current += char
        elif current:
            runs.append(current)
            current = ""
    if current:
        runs.append(current)
    return {run[index:index + width] for run in runs
            for width in (1, 2) for index in range(len(run) - width + 1)}


def _legacy_migrations() -> tuple[Migration, ...]:
    source = files("forge").joinpath("legacy_migrations.json").read_text()
    entries: list[dict[str, Any]] = json.loads(source)["migrations"]
    migrations = tuple(Migration(**entry) for entry in entries)
    if [item.version for item in migrations] != list(range(1, 16)):
        raise PersistenceError("DATABASE_MIGRATION_FAILED")
    for item in migrations:
        if hashlib.sha256(item.sql.encode()).hexdigest() != item.checksum:
            raise PersistenceError("DATABASE_MIGRATION_FAILED")
    return migrations


_PYTHON_MIGRATION_SQL = """CREATE TABLE python_host_metadata(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);"""
_REVIEW_MIGRATION_SQL = """CREATE TABLE review_reports(
  review_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  development_run_id TEXT NOT NULL REFERENCES runs(run_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  review_copy_id TEXT NOT NULL,
  review_attempt_id TEXT NOT NULL UNIQUE,
  contract_revision INTEGER NOT NULL CHECK(contract_revision>=1),
  profile_revision INTEGER NOT NULL CHECK(profile_revision>=1),
  outcome TEXT NOT NULL CHECK(outcome IN ('approved','changes_requested','inconclusive')),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  created_at TEXT NOT NULL
);
CREATE INDEX ix_review_reports_task ON review_reports(project_id,task_id,created_at);
CREATE TABLE review_jobs(
  review_run_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  development_run_id TEXT NOT NULL REFERENCES runs(run_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  review_copy_id TEXT NOT NULL,
  review_attempt_id TEXT NOT NULL UNIQUE,
  model_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('running','completed','failed','interrupted')),
  report_id TEXT REFERENCES review_reports(review_id),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_review_jobs_task ON review_jobs(project_id,task_id,created_at);
CREATE TABLE review_issue_threads(
  issue_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
  severity TEXT NOT NULL CHECK(severity IN ('blocking','advisory')),
  status TEXT NOT NULL CHECK(status IN ('open','stale','resolved','waived')),
  revision INTEGER NOT NULL CHECK(revision>=1),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(task_id,fingerprint)
);
CREATE TABLE review_issue_occurrences(
  occurrence_id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES review_issue_threads(issue_id),
  review_id TEXT NOT NULL REFERENCES review_reports(review_id),
  review_attempt_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  finding_json TEXT NOT NULL CHECK(json_valid(finding_json)),
  created_at TEXT NOT NULL,
  UNIQUE(issue_id,review_id)
);
CREATE INDEX ix_review_occurrences_issue ON review_issue_occurrences(issue_id,created_at);
CREATE TABLE review_rework_handoffs(
  handoff_id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL UNIQUE REFERENCES review_reports(review_id),
  development_run_id TEXT NOT NULL REFERENCES runs(run_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  bundle_json TEXT NOT NULL CHECK(json_valid(bundle_json)),
  created_at TEXT NOT NULL
);
CREATE TRIGGER review_report_no_update BEFORE UPDATE ON review_reports
  BEGIN SELECT RAISE(ABORT,'review report is immutable'); END;
CREATE TRIGGER review_report_no_delete BEFORE DELETE ON review_reports
  BEGIN SELECT RAISE(ABORT,'review report is immutable'); END;
CREATE TRIGGER review_occurrence_no_update BEFORE UPDATE ON review_issue_occurrences
  BEGIN SELECT RAISE(ABORT,'review occurrence is immutable'); END;
CREATE TRIGGER review_occurrence_no_delete BEFORE DELETE ON review_issue_occurrences
  BEGIN SELECT RAISE(ABORT,'review occurrence is immutable'); END;
CREATE TRIGGER review_rework_no_update BEFORE UPDATE ON review_rework_handoffs
  BEGIN SELECT RAISE(ABORT,'review handoff is immutable'); END;
CREATE TRIGGER review_rework_no_delete BEFORE DELETE ON review_rework_handoffs
  BEGIN SELECT RAISE(ABORT,'review handoff is immutable'); END;"""
_VERIFIER_MIGRATION_SQL = """CREATE TABLE verifier_jobs(
  verification_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  development_run_id TEXT NOT NULL REFERENCES runs(run_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  kind TEXT NOT NULL CHECK(kind IN ('test','typecheck','build','lint')),
  preset_id TEXT REFERENCES command_presets(preset_id),
  state TEXT NOT NULL CHECK(state IN ('running','completed','failed','interrupted')),
  report_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_verifier_jobs_task ON verifier_jobs(project_id,task_id,created_at);
CREATE TABLE verifier_reports(
  report_id TEXT PRIMARY KEY,
  verification_id TEXT NOT NULL UNIQUE REFERENCES verifier_jobs(verification_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  status TEXT NOT NULL CHECK(status IN ('passed','failed','not_configured','timeout','error')),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  created_at TEXT NOT NULL
);
CREATE TABLE verifier_artifacts(
  artifact_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES verifier_reports(report_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  kind TEXT NOT NULL CHECK(kind IN ('stdout','stderr')),
  mime TEXT NOT NULL CHECK(mime='text/plain'),
  content_text TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  byte_size INTEGER NOT NULL CHECK(byte_size>=0),
  truncated INTEGER NOT NULL CHECK(truncated IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE TRIGGER verifier_report_no_update BEFORE UPDATE ON verifier_reports
  BEGIN SELECT RAISE(ABORT,'verifier report is immutable'); END;
CREATE TRIGGER verifier_report_no_delete BEFORE DELETE ON verifier_reports
  BEGIN SELECT RAISE(ABORT,'verifier report is immutable'); END;
CREATE TRIGGER verifier_artifact_no_update BEFORE UPDATE ON verifier_artifacts
  BEGIN SELECT RAISE(ABORT,'verifier artifact is immutable'); END;
CREATE TRIGGER verifier_artifact_no_delete BEFORE DELETE ON verifier_artifacts
  BEGIN SELECT RAISE(ABORT,'verifier artifact is immutable'); END;"""
_ACCEPTANCE_MIGRATION_SQL = """CREATE TABLE acceptance_decisions(
  decision_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  contract_revision INTEGER NOT NULL CHECK(contract_revision>=1),
  criterion_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('verified','failed','risk_accepted','not_applicable')),
  report_id TEXT REFERENCES verifier_reports(report_id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_acceptance_decisions_task ON acceptance_decisions(project_id,task_id,created_at);
CREATE TRIGGER acceptance_decision_no_update BEFORE UPDATE ON acceptance_decisions
  BEGIN SELECT RAISE(ABORT,'acceptance decision is immutable'); END;
CREATE TRIGGER acceptance_decision_no_delete BEFORE DELETE ON acceptance_decisions
  BEGIN SELECT RAISE(ABORT,'acceptance decision is immutable'); END;"""
_REWORK_MIGRATION_SQL = """CREATE TABLE rework_cycles(
  cycle_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  source_run_id TEXT NOT NULL REFERENCES runs(run_id),
  source_snapshot_id TEXT NOT NULL UNIQUE REFERENCES code_snapshots(snapshot_id),
  trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('review','verify')),
  trigger_report_id TEXT NOT NULL,
  next_run_id TEXT UNIQUE,
  cycle_no INTEGER NOT NULL CHECK(cycle_no>=1),
  total_attempts INTEGER NOT NULL CHECK(total_attempts>=1),
  state TEXT NOT NULL CHECK(state IN ('pending','launching','running','blocked','interrupted')),
  reason_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_rework_cycles_task ON rework_cycles(project_id,task_id,cycle_no);"""
_FINAL_ACCEPTANCE_MIGRATION_SQL = """CREATE TABLE final_acceptance_decisions(
  decision_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  contract_revision INTEGER NOT NULL CHECK(contract_revision>=1),
  basis_hash TEXT NOT NULL CHECK(length(basis_hash)=64),
  decision TEXT NOT NULL CHECK(decision IN ('accept','return')),
  next_run_id TEXT UNIQUE,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_final_acceptance_task ON final_acceptance_decisions(project_id,task_id,created_at);
CREATE TRIGGER final_acceptance_no_update BEFORE UPDATE ON final_acceptance_decisions
  BEGIN SELECT RAISE(ABORT,'final acceptance is immutable'); END;
CREATE TRIGGER final_acceptance_no_delete BEFORE DELETE ON final_acceptance_decisions
  BEGIN SELECT RAISE(ABORT,'final acceptance is immutable'); END;
CREATE TABLE review_advisory_waivers(
  waiver_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  issue_id TEXT NOT NULL REFERENCES review_issue_threads(issue_id),
  review_id TEXT NOT NULL REFERENCES review_reports(review_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  issue_revision INTEGER NOT NULL CHECK(issue_revision>=1),
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(issue_id,review_id,snapshot_id)
);
CREATE TRIGGER review_advisory_waiver_no_update BEFORE UPDATE ON review_advisory_waivers
  BEGIN SELECT RAISE(ABORT,'advisory waiver is immutable'); END;
CREATE TRIGGER review_advisory_waiver_no_delete BEFORE DELETE ON review_advisory_waivers
  BEGIN SELECT RAISE(ABORT,'advisory waiver is immutable'); END;"""
_DELIVERY_MIGRATION_SQL = """CREATE TABLE delivery_records(
  delivery_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  acceptance_decision_id TEXT NOT NULL UNIQUE REFERENCES final_acceptance_decisions(decision_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  summary_json TEXT NOT NULL CHECK(json_valid(summary_json)),
  created_at TEXT NOT NULL
);
CREATE TRIGGER delivery_record_no_update BEFORE UPDATE ON delivery_records
  BEGIN SELECT RAISE(ABORT,'delivery record is immutable'); END;
CREATE TRIGGER delivery_record_no_delete BEFORE DELETE ON delivery_records
  BEGIN SELECT RAISE(ABORT,'delivery record is immutable'); END;
CREATE TABLE merge_operations(
  operation_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  delivery_id TEXT NOT NULL REFERENCES delivery_records(delivery_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  target_branch TEXT NOT NULL,
  expected_target_head TEXT NOT NULL,
  snapshot_commit TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('intent','merged','conflict','unknown')),
  result_commit TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(delivery_id,target_branch)
);
CREATE INDEX ix_merge_operation_task ON merge_operations(project_id,task_id,created_at);"""
_TASK_CHANGE_MIGRATION_SQL = """CREATE TABLE task_change_requests(
  change_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  base_revision INTEGER NOT NULL CHECK(base_revision>=1),
  proposed_revision INTEGER NOT NULL CHECK(proposed_revision=base_revision+1),
  contract_json TEXT NOT NULL CHECK(json_valid(contract_json)),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  scope_hash TEXT NOT NULL CHECK(length(scope_hash)=64),
  decision_id TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN (
    'proposed','awaiting_safe_point','applied','rejected','stale')),
  approval_reason TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  applied_at TEXT
);
CREATE UNIQUE INDEX ux_task_change_open ON task_change_requests(task_id)
  WHERE state IN ('proposed','awaiting_safe_point');
CREATE INDEX ix_task_change_task ON task_change_requests(project_id,task_id,created_at);"""
_STORAGE_BOUNDARY_MIGRATION_SQL = """CREATE TABLE imported_artifacts(
  artifact_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  verification_id TEXT NOT NULL REFERENCES verifier_jobs(verification_id),
  kind TEXT NOT NULL,
  mime TEXT NOT NULL CHECK(mime IN ('text/plain','application/json')),
  content_blob BLOB NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size>=0 AND byte_size<=1048576),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  created_at TEXT NOT NULL
);
CREATE INDEX ix_imported_artifacts_project ON imported_artifacts(project_id,created_at);
CREATE TRIGGER imported_artifact_no_update BEFORE UPDATE ON imported_artifacts
  BEGIN SELECT RAISE(ABORT,'imported artifact is immutable'); END;
CREATE TRIGGER imported_artifact_no_delete BEFORE DELETE ON imported_artifacts
  BEGIN SELECT RAISE(ABORT,'imported artifact is immutable'); END;
CREATE TABLE plugin_storage_entries(
  plugin_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(plugin_id,storage_key)
);"""
_ARTIFACT_RETENTION_MIGRATION_SQL = """CREATE TABLE imported_artifact_tombstones(
  artifact_id TEXT PRIMARY KEY REFERENCES imported_artifacts(artifact_id),
  purged_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason='expired-user-confirmed')
);
DROP TRIGGER imported_artifact_no_update;
CREATE TRIGGER imported_artifact_no_update BEFORE UPDATE ON imported_artifacts
WHEN NOT (
  NEW.artifact_id=OLD.artifact_id AND NEW.project_id=OLD.project_id
  AND NEW.verification_id=OLD.verification_id AND NEW.kind=OLD.kind
  AND NEW.mime=OLD.mime AND NEW.byte_size=OLD.byte_size
  AND NEW.content_hash=OLD.content_hash AND NEW.created_at=OLD.created_at
  AND NEW.content_blob=X'' AND
  EXISTS(SELECT 1 FROM imported_artifact_tombstones WHERE artifact_id=OLD.artifact_id)
)
  BEGIN SELECT RAISE(ABORT,'imported artifact is immutable'); END;"""
_AGENT_PROFILE_MIGRATION_SQL = """CREATE TABLE agent_profiles(
  profile_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>=1),
  profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  created_at TEXT NOT NULL,
  PRIMARY KEY(profile_id,revision)
);
CREATE TRIGGER agent_profile_no_update BEFORE UPDATE ON agent_profiles
  BEGIN SELECT RAISE(ABORT,'agent profile revision is immutable'); END;
CREATE TRIGGER agent_profile_no_delete BEFORE DELETE ON agent_profiles
  BEGIN SELECT RAISE(ABORT,'agent profile revision is immutable'); END;
ALTER TABLE review_jobs ADD COLUMN profile_id TEXT;
ALTER TABLE review_jobs ADD COLUMN profile_revision INTEGER;
ALTER TABLE review_jobs ADD COLUMN profile_hash TEXT;"""
_WORKFLOW_DRAFT_MIGRATION_SQL = """CREATE TABLE workflow_drafts(
  workflow_id TEXT PRIMARY KEY,
  draft_revision INTEGER NOT NULL CHECK(draft_revision>=1),
  draft_json TEXT NOT NULL CHECK(json_valid(draft_json)),
  draft_hash TEXT NOT NULL CHECK(length(draft_hash)=64),
  published_revision INTEGER,
  updated_at TEXT NOT NULL
);
CREATE TABLE workflow_revisions(
  id TEXT NOT NULL REFERENCES workflow_drafts(workflow_id),
  revision INTEGER NOT NULL CHECK(revision>=1),
  name TEXT NOT NULL,
  definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  state TEXT NOT NULL CHECK(state IN ('draft','published','deprecated')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(id,revision)
);
CREATE TRIGGER workflow_revision_no_update BEFORE UPDATE ON workflow_revisions
  BEGIN SELECT RAISE(ABORT,'published workflow is immutable'); END;
CREATE TRIGGER workflow_revision_no_delete BEFORE DELETE ON workflow_revisions
  BEGIN SELECT RAISE(ABORT,'published workflow is immutable'); END;"""
_KNOWLEDGE_INGESTION_MIGRATION_SQL = """CREATE TABLE knowledge_sources(
  source_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  relative_path TEXT NOT NULL,
  current_version INTEGER NOT NULL CHECK(current_version>=1),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  byte_size INTEGER NOT NULL CHECK(byte_size>=0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id,relative_path)
);
CREATE TABLE knowledge_chunks(
  source_id TEXT NOT NULL REFERENCES knowledge_sources(source_id),
  version INTEGER NOT NULL CHECK(version>=1),
  ordinal INTEGER NOT NULL CHECK(ordinal>=0),
  start_line INTEGER NOT NULL CHECK(start_line>=1),
  end_line INTEGER NOT NULL CHECK(end_line>=start_line),
  heading TEXT,
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  PRIMARY KEY(source_id,version,ordinal)
);
CREATE INDEX knowledge_sources_project_status ON knowledge_sources(project_id,status);
CREATE INDEX knowledge_chunks_source_version ON knowledge_chunks(source_id,version);"""
_KNOWLEDGE_SEARCH_MIGRATION_SQL = """ALTER TABLE knowledge_sources ADD COLUMN environment_id TEXT;
UPDATE knowledge_sources SET environment_id=(
  SELECT environment_id FROM projects WHERE projects.project_id=knowledge_sources.project_id
);
CREATE INDEX knowledge_sources_scope ON knowledge_sources(project_id,environment_id,status);
CREATE VIRTUAL TABLE knowledge_fts USING fts5(text, tokenize='trigram');
CREATE TABLE knowledge_short_terms(
  chunk_rowid INTEGER NOT NULL,
  term TEXT NOT NULL,
  PRIMARY KEY(chunk_rowid,term)
);
CREATE INDEX knowledge_short_terms_term ON knowledge_short_terms(term);
INSERT INTO knowledge_fts(rowid,text)
  SELECT c.rowid,c.text FROM knowledge_chunks c JOIN knowledge_sources s
  ON s.source_id=c.source_id WHERE s.status='active'
  AND c.version=s.current_version AND length(c.text)>0;"""
_PROJECT_MEMORY_MIGRATION_SQL = """CREATE TABLE project_memory(
  memory_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  environment_id TEXT,
  scope TEXT NOT NULL CHECK(scope IN ('project','environment')),
  kind TEXT NOT NULL CHECK(kind IN ('environment_fact','project_convention',
    'confirmed_decision','workflow_hint')),
  subject_key TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('candidate','validated','stale','revoked')),
  revision INTEGER NOT NULL CHECK(revision>=1),
  source_json TEXT NOT NULL CHECK(json_valid(source_json)),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  expires_at TEXT,
  last_verified_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((scope='project' AND environment_id IS NULL) OR
        (scope='environment' AND environment_id IS NOT NULL))
);
CREATE INDEX project_memory_scope ON project_memory(project_id,environment_id,status,subject_key);
CREATE TABLE memory_events(
  event_id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES project_memory(memory_id),
  action TEXT NOT NULL CHECK(action IN ('proposed','validated','stale','revoked')),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX memory_events_memory ON memory_events(memory_id,created_at);
CREATE TRIGGER memory_events_no_update BEFORE UPDATE ON memory_events
  BEGIN SELECT RAISE(ABORT,'memory event is immutable'); END;
CREATE TRIGGER memory_events_no_delete BEFORE DELETE ON memory_events
  BEGIN SELECT RAISE(ABORT,'memory event is immutable'); END;
CREATE VIRTUAL TABLE memory_fts USING fts5(text,tokenize='trigram');"""
_PAIRING_MIGRATION_SQL = """CREATE TABLE pairing_requests(
  pairing_id TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL UNIQUE CHECK(length(nonce_hash)=64),
  claim_secret_hash TEXT UNIQUE CHECK(claim_secret_hash IS NULL OR length(claim_secret_hash)=64),
  status TEXT NOT NULL CHECK(status IN ('pending','claimed','approved','rejected','expired')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 5),
  device_name TEXT,
  address_summary TEXT,
  fingerprint_summary TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  decided_at TEXT,
  consumed_at TEXT,
  granted_project_ids_json TEXT CHECK(granted_project_ids_json IS NULL OR
    json_valid(granted_project_ids_json))
);
CREATE INDEX pairing_requests_status_expiry ON pairing_requests(status,expires_at);
CREATE TABLE paired_devices(
  device_id TEXT PRIMARY KEY,
  pairing_id TEXT NOT NULL UNIQUE REFERENCES pairing_requests(pairing_id),
  name TEXT NOT NULL,
  address_summary TEXT NOT NULL,
  fingerprint_summary TEXT NOT NULL,
  project_ids_json TEXT NOT NULL CHECK(json_valid(project_ids_json)),
  status TEXT NOT NULL CHECK(status IN ('approved','revoked')),
  approved_at TEXT NOT NULL,
  revoked_at TEXT
);"""
_REMOTE_SESSION_MIGRATION_SQL = """ALTER TABLE pairing_requests
  ADD COLUMN session_delivered_at TEXT;
CREATE TABLE device_sessions(
  session_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES paired_devices(device_id),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  csrf_hash TEXT NOT NULL CHECK(length(csrf_hash)=64),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  refresh_expires_at TEXT NOT NULL,
  rotated_from TEXT REFERENCES device_sessions(session_id),
  revoked_at TEXT
);
CREATE INDEX device_sessions_device ON device_sessions(device_id,revoked_at,expires_at);"""
_REMOTE_EVENT_MIGRATION_SQL = """CREATE TABLE remote_event_log(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN (
    'board.changed','run.changed','approval.changed','review.changed',
    'verify.changed','acceptance.changed','conversation.changed','draft.changed')),
  entity_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE INDEX ix_remote_event_project_seq ON remote_event_log(project_id,seq);
CREATE TRIGGER remote_board_insert AFTER INSERT ON board_events BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    VALUES(NEW.project_id,NEW.task_id,'board.changed',NEW.event_id,NEW.created_at);
END;
CREATE TRIGGER remote_run_insert AFTER INSERT ON runs BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    VALUES(NEW.project_id,NEW.task_id,'run.changed',NEW.run_id,NEW.created_at);
END;
CREATE TRIGGER remote_run_update AFTER UPDATE OF state,revision ON runs
WHEN NEW.state!=OLD.state OR NEW.revision!=OLD.revision BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    VALUES(NEW.project_id,NEW.task_id,'run.changed',NEW.run_id,
           COALESCE(NEW.finished_at,datetime('now')));
END;
CREATE TRIGGER remote_run_event_insert AFTER INSERT ON run_events BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    SELECT r.project_id,r.task_id,'run.changed',NEW.run_id,NEW.created_at
    FROM runs r WHERE r.run_id=NEW.run_id;
END;
CREATE TRIGGER remote_run_observation_insert AFTER INSERT ON run_observations BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    SELECT r.project_id,r.task_id,'run.changed',NEW.run_id,NEW.created_at
    FROM runs r WHERE r.run_id=NEW.run_id;
END;
CREATE TRIGGER remote_task_approval_insert AFTER INSERT ON task_approvals BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    VALUES(NEW.project_id,NEW.task_id,'approval.changed',NEW.approval_id,NEW.created_at);
END;
CREATE TRIGGER remote_task_approval_update AFTER UPDATE OF status ON task_approvals
WHEN NEW.status!=OLD.status BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    VALUES(NEW.project_id,NEW.task_id,'approval.changed',NEW.approval_id,
           COALESCE(NEW.decided_at,datetime('now')));
END;
CREATE TRIGGER remote_review_insert AFTER INSERT ON review_reports BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    VALUES(NEW.project_id,NEW.task_id,'review.changed',NEW.review_id,NEW.created_at);
END;
CREATE TRIGGER remote_verify_insert AFTER INSERT ON verifier_reports BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    SELECT NEW.project_id,j.task_id,'verify.changed',NEW.report_id,NEW.created_at
    FROM verifier_jobs j WHERE j.verification_id=NEW.verification_id;
END;
CREATE TRIGGER remote_acceptance_insert AFTER INSERT ON final_acceptance_decisions BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    VALUES(NEW.project_id,NEW.task_id,'acceptance.changed',NEW.decision_id,NEW.created_at);
END;
CREATE TRIGGER remote_conversation_insert AFTER INSERT ON conversations BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    VALUES(NEW.project_id,NULL,'conversation.changed',NEW.conversation_id,NEW.created_at);
END;
CREATE TRIGGER remote_message_insert AFTER INSERT ON messages BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    SELECT c.project_id,NULL,'conversation.changed',NEW.message_id,NEW.created_at
    FROM conversations c WHERE c.conversation_id=NEW.conversation_id;
END;
CREATE TRIGGER remote_draft_insert AFTER INSERT ON task_drafts BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    VALUES(NEW.project_id,NULL,'draft.changed',NEW.draft_id,NEW.created_at);
END;
CREATE TRIGGER remote_draft_update AFTER UPDATE OF revision,status ON task_drafts
WHEN NEW.revision!=OLD.revision OR NEW.status!=OLD.status BEGIN
  INSERT INTO remote_event_log(project_id,task_id,kind,entity_id,occurred_at)
    VALUES(NEW.project_id,NULL,'draft.changed',NEW.draft_id,NEW.updated_at);
END;"""
_REMOTE_POLICY_MIGRATION_SQL = """ALTER TABLE paired_devices
  ADD COLUMN operation_scopes_json TEXT NOT NULL DEFAULT '[]'
  CHECK(json_valid(operation_scopes_json));
ALTER TABLE paired_devices
  ADD COLUMN policy_revision INTEGER NOT NULL DEFAULT 1 CHECK(policy_revision>=1);
CREATE TABLE device_policy_events(
  event_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES paired_devices(device_id),
  old_revision INTEGER NOT NULL CHECK(old_revision>=1),
  new_revision INTEGER NOT NULL CHECK(new_revision=old_revision+1),
  old_project_ids_json TEXT NOT NULL CHECK(json_valid(old_project_ids_json)),
  new_project_ids_json TEXT NOT NULL CHECK(json_valid(new_project_ids_json)),
  old_scopes_json TEXT NOT NULL CHECK(json_valid(old_scopes_json)),
  new_scopes_json TEXT NOT NULL CHECK(json_valid(new_scopes_json)),
  kind TEXT NOT NULL CHECK(kind IN ('narrow','revoke')),
  decided_at TEXT NOT NULL
);
CREATE INDEX ix_device_policy_device ON device_policy_events(device_id,new_revision);"""
_REMOTE_RECEIPT_MIGRATION_SQL = """CREATE TABLE remote_command_receipts(
  command_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES paired_devices(device_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  method TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json)),
  created_at TEXT NOT NULL,
  UNIQUE(device_id,idempotency_key)
);
CREATE INDEX ix_remote_receipt_project ON remote_command_receipts(project_id,created_at);"""
_RUN_RECOVERY_MIGRATION_SQL = """CREATE TABLE run_recovery_observations(
  run_id TEXT PRIMARY KEY REFERENCES runs(run_id),
  attempt_id TEXT NOT NULL REFERENCES run_attempts(attempt_id),
  lease_id TEXT NOT NULL REFERENCES run_workspace_leases(lease_id),
  workspace_id TEXT NOT NULL,
  observed_boot_id TEXT NOT NULL CHECK(length(observed_boot_id)=36),
  observed_at TEXT NOT NULL,
  resolved_boot_id TEXT CHECK(resolved_boot_id IS NULL OR length(resolved_boot_id)=36),
  resolved_at TEXT,
  CHECK((resolved_boot_id IS NULL)=(resolved_at IS NULL))
);
ALTER TABLE runs ADD COLUMN recovery_resolved_at TEXT;
DROP INDEX ux_runs_project_active;
CREATE UNIQUE INDEX ux_runs_project_active ON runs(project_id)
  WHERE state IN ('queued','running','waiting_input','pausing','paused','canceling')
     OR (state='interrupted' AND recovery_resolved_at IS NULL);
CREATE TRIGGER run_recovery_resolution_guard
BEFORE UPDATE OF recovery_resolved_at ON runs
WHEN NEW.recovery_resolved_at IS NOT NULL AND OLD.recovery_resolved_at IS NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM run_recovery_observations o
    WHERE o.run_id=NEW.run_id AND o.resolved_at=NEW.recovery_resolved_at
  ) THEN RAISE(ABORT,'recovery evidence required') END;
END;"""
_PLAN_ARTIFACT_MIGRATION_SQL = """CREATE TABLE plan_artifacts(
  artifact_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(run_id),
  attempt_id TEXT NOT NULL UNIQUE REFERENCES run_attempts(attempt_id),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  artifact_json TEXT NOT NULL CHECK(json_valid(artifact_json)),
  created_at TEXT NOT NULL
);
CREATE INDEX ix_plan_artifacts_task ON plan_artifacts(project_id,task_id,created_at);
CREATE TABLE plan_continuations(
  plan_run_id TEXT PRIMARY KEY REFERENCES plan_artifacts(run_id),
  development_run_id TEXT UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('automatic','approved','rejected')),
  artifact_hash TEXT NOT NULL CHECK(length(artifact_hash)=64),
  decided_at TEXT NOT NULL,
  decided_by TEXT NOT NULL CHECK(decided_by IN ('host','local-user')),
  reason TEXT,
  CHECK((state='rejected')=(development_run_id IS NULL))
);"""
_REFINER_PRESENTATION_SQL = """ALTER TABLE task_drafts ADD COLUMN model_id TEXT;
ALTER TABLE task_drafts ADD COLUMN assistant_reply TEXT;"""
MIGRATIONS = (
    *_legacy_migrations(),
    Migration(
        16, _PYTHON_MIGRATION_SQL, hashlib.sha256(_PYTHON_MIGRATION_SQL.encode()).hexdigest()
    ),
    Migration(
        17, _REVIEW_MIGRATION_SQL, hashlib.sha256(_REVIEW_MIGRATION_SQL.encode()).hexdigest()
    ),
    Migration(
        18, _VERIFIER_MIGRATION_SQL,
        hashlib.sha256(_VERIFIER_MIGRATION_SQL.encode()).hexdigest()
    ),
    Migration(19, _ACCEPTANCE_MIGRATION_SQL,
              hashlib.sha256(_ACCEPTANCE_MIGRATION_SQL.encode()).hexdigest()),
    Migration(20, _REWORK_MIGRATION_SQL,
              hashlib.sha256(_REWORK_MIGRATION_SQL.encode()).hexdigest()),
    Migration(21, _FINAL_ACCEPTANCE_MIGRATION_SQL,
              hashlib.sha256(_FINAL_ACCEPTANCE_MIGRATION_SQL.encode()).hexdigest()),
    Migration(22, _DELIVERY_MIGRATION_SQL,
              hashlib.sha256(_DELIVERY_MIGRATION_SQL.encode()).hexdigest()),
    Migration(23, _TASK_CHANGE_MIGRATION_SQL,
              hashlib.sha256(_TASK_CHANGE_MIGRATION_SQL.encode()).hexdigest()),
    Migration(24, _STORAGE_BOUNDARY_MIGRATION_SQL,
              hashlib.sha256(_STORAGE_BOUNDARY_MIGRATION_SQL.encode()).hexdigest()),
    Migration(25, _AGENT_PROFILE_MIGRATION_SQL,
              hashlib.sha256(_AGENT_PROFILE_MIGRATION_SQL.encode()).hexdigest()),
    Migration(26, _WORKFLOW_DRAFT_MIGRATION_SQL,
              hashlib.sha256(_WORKFLOW_DRAFT_MIGRATION_SQL.encode()).hexdigest()),
    Migration(27, _KNOWLEDGE_INGESTION_MIGRATION_SQL,
              hashlib.sha256(_KNOWLEDGE_INGESTION_MIGRATION_SQL.encode()).hexdigest()),
    Migration(28, _KNOWLEDGE_SEARCH_MIGRATION_SQL,
              hashlib.sha256(_KNOWLEDGE_SEARCH_MIGRATION_SQL.encode()).hexdigest()),
    Migration(29, _PROJECT_MEMORY_MIGRATION_SQL,
              hashlib.sha256(_PROJECT_MEMORY_MIGRATION_SQL.encode()).hexdigest()),
    Migration(30, _ARTIFACT_RETENTION_MIGRATION_SQL,
              hashlib.sha256(_ARTIFACT_RETENTION_MIGRATION_SQL.encode()).hexdigest()),
    Migration(31, _PAIRING_MIGRATION_SQL,
              hashlib.sha256(_PAIRING_MIGRATION_SQL.encode()).hexdigest()),
    Migration(32, _REMOTE_SESSION_MIGRATION_SQL,
              hashlib.sha256(_REMOTE_SESSION_MIGRATION_SQL.encode()).hexdigest()),
    Migration(33, _REMOTE_EVENT_MIGRATION_SQL,
              hashlib.sha256(_REMOTE_EVENT_MIGRATION_SQL.encode()).hexdigest()),
    Migration(34, _REMOTE_POLICY_MIGRATION_SQL,
              hashlib.sha256(_REMOTE_POLICY_MIGRATION_SQL.encode()).hexdigest()),
    Migration(35, _REMOTE_RECEIPT_MIGRATION_SQL,
              hashlib.sha256(_REMOTE_RECEIPT_MIGRATION_SQL.encode()).hexdigest()),
    Migration(36, _RUN_RECOVERY_MIGRATION_SQL,
              hashlib.sha256(_RUN_RECOVERY_MIGRATION_SQL.encode()).hexdigest()),
    Migration(37, _PLAN_ARTIFACT_MIGRATION_SQL,
              hashlib.sha256(_PLAN_ARTIFACT_MIGRATION_SQL.encode()).hexdigest()),
    Migration(38, _REFINER_PRESENTATION_SQL,
              hashlib.sha256(_REFINER_PRESENTATION_SQL.encode()).hexdigest()),
)
CURRENT_COMPATIBLE_SCHEMA = 15
LATEST_SCHEMA = MIGRATIONS[-1].version


def resolve_data_dir(
    *, environment: Literal["development", "test", "production"], override: str | None = None
) -> Path:
    if override is not None:
        path = Path(override)
        if not path.is_absolute():
            raise ValueError("Forge data directory override must be absolute")
        return path.resolve()
    home = Path.home()
    if sys.platform == "darwin":
        base = home / "Library" / "Application Support"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", str(home / "AppData" / "Roaming")))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", str(home / ".local" / "share")))
    return base / "Forge" / environment


def _statements(sql: str) -> Iterator[str]:
    statement = ""
    for line in sql.splitlines(keepends=True):
        statement += line
        if sqlite3.complete_statement(statement):
            yield statement.strip()
            statement = ""
    if statement.strip():
        raise PersistenceError("DATABASE_MIGRATION_FAILED")


def _map_error(error: Exception, fallback: str) -> PersistenceError:
    if isinstance(error, PersistenceError):
        return error
    if isinstance(error, sqlite3.DatabaseError):
        extended = getattr(error, "sqlite_errorcode", None)
        code = extended & 0xFF if isinstance(extended, int) else None
        if code in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED):
            return PersistenceError("DATABASE_BUSY")
        if code in (sqlite3.SQLITE_NOTADB, sqlite3.SQLITE_CORRUPT):
            return PersistenceError("DATABASE_CORRUPT")
        if code == sqlite3.SQLITE_FULL:
            return PersistenceError("DATABASE_DISK_FULL")
        if code in (sqlite3.SQLITE_READONLY, sqlite3.SQLITE_IOERR):
            return PersistenceError("DATABASE_IO_ERROR")
    return PersistenceError(fallback)


class ForgePersistence:
    def __init__(self, data_dir: Path, *, read_only: bool = False) -> None:
        if not data_dir.is_absolute():
            raise ValueError("Forge data directory must be absolute")
        self.data_dir = data_dir.resolve()
        self.db_path = self.data_dir / "forge.sqlite"
        self.read_only = read_only
        self._connection: sqlite3.Connection | None = None
        self._write_fault: str | None = None
        self.last_backup: Path | None = None

    @property
    def is_open(self) -> bool:
        return self._connection is not None

    def session(self) -> PersistenceSession:
        return PersistenceSession(self._db())

    def open(self) -> None:
        if self._connection is not None:
            return
        try:
            if self.read_only:
                if not self.db_path.is_file():
                    raise PersistenceError("DATABASE_OPEN_FAILED")
                connection = sqlite3.connect(
                    self.db_path.as_uri() + "?mode=ro", uri=True, timeout=5
                )
            else:
                self.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
                connection = sqlite3.connect(self.db_path, timeout=5, isolation_level=None)
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("PRAGMA busy_timeout = 5000")
            if not self.read_only:
                connection.execute("PRAGMA journal_mode = WAL")
            if connection.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise PersistenceError("DATABASE_CORRUPT")
            self._connection = connection
            self._write_fault = None
        except (OSError, sqlite3.DatabaseError, PersistenceError) as error:
            if "connection" in locals():
                connection.close()
            raise _map_error(error, "DATABASE_OPEN_FAILED") from error

    def close(self) -> None:
        if self._connection is not None:
            self._connection.close()
        self._connection = None
        self._write_fault = None

    def _writable(self) -> None:
        if self.read_only:
            raise PersistenceError("DATABASE_IO_ERROR")
        if self._write_fault is not None:
            raise PersistenceError(self._write_fault)

    def _latch(self, error: Exception, fallback: str) -> PersistenceError:
        mapped = _map_error(error, fallback)
        if mapped.code in ("DATABASE_DISK_FULL", "DATABASE_IO_ERROR",
                           "DATABASE_CORRUPT", "DATABASE_MIGRATION_FAILED",
                           "DATABASE_BACKUP_FAILED"):
            self._write_fault = mapped.code
        return mapped

    def backup(self) -> Path:
        """Copy committed WAL state through SQLite's online backup API, never file-copy DB."""
        source = self._db()
        version = self.schema_version()
        backup_dir = self.data_dir / "backups"
        temporary: Path | None = None
        try:
            if backup_dir.is_symlink():
                raise PersistenceError("DATABASE_BACKUP_FAILED")
            backup_dir.mkdir(mode=0o700, exist_ok=True)
            if os.name != "nt":
                os.chmod(backup_dir, 0o700)
            if backup_dir.parent.resolve() != self.data_dir:
                raise PersistenceError("DATABASE_BACKUP_FAILED")
            label = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
            target = backup_dir / f"forge-v{version}-{label}-{uuid4()}.sqlite"
            temporary = backup_dir / f".{target.name}.partial"
            copy = sqlite3.connect(temporary)
            try:
                if os.name != "nt":
                    os.chmod(temporary, 0o600)
                source.backup(copy)
                if copy.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                    raise PersistenceError("DATABASE_BACKUP_FAILED")
                if copy.execute("PRAGMA foreign_key_check").fetchone() is not None:
                    raise PersistenceError("DATABASE_BACKUP_FAILED")
            finally:
                copy.close()
            with temporary.open("rb") as handle:
                os.fsync(handle.fileno())
            os.replace(temporary, target)
            self.last_backup = target
            return target
        except (OSError, sqlite3.DatabaseError, PersistenceError) as error:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
            raise self._latch(error, "DATABASE_BACKUP_FAILED") from error

    def _preflight_upgrade(self, current: int, target: int) -> None:
        if current == 0 or target <= current:
            return
        try:
            size = self.db_path.stat().st_size
            wal = self.db_path.with_name(self.db_path.name + "-wal")
            if wal.exists():
                size += wal.stat().st_size
            if shutil.disk_usage(self.data_dir).free < max(16 * 1024 * 1024, size * 2):
                raise PersistenceError("DATABASE_DISK_FULL")
            self.backup()
        except (OSError, PersistenceError) as error:
            raise self._latch(error, "DATABASE_BACKUP_FAILED") from error

    def _db(self) -> sqlite3.Connection:
        if self._connection is None:
            raise PersistenceError("DATABASE_OPEN_FAILED")
        return self._connection

    def schema_version(self) -> int:
        try:
            db = self._db()
            user_version = int(db.execute("PRAGMA user_version").fetchone()[0])
            if user_version > LATEST_SCHEMA:
                raise PersistenceError("DATABASE_VERSION_UNSUPPORTED")
            exists = db.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
            ).fetchone()
            if not exists:
                if user_version != 0:
                    raise PersistenceError("DATABASE_MIGRATION_FAILED")
                return 0
            rows = db.execute("SELECT version, checksum FROM schema_migrations ORDER BY version")
            versions = list(rows)
            for index, row in enumerate(versions):
                if row["version"] > LATEST_SCHEMA:
                    raise PersistenceError("DATABASE_VERSION_UNSUPPORTED")
                expected = MIGRATIONS[index] if index < len(MIGRATIONS) else None
                if (
                    expected is None
                    or row["version"] != index + 1
                    or row["checksum"] != expected.checksum
                ):
                    raise PersistenceError("DATABASE_MIGRATION_FAILED")
            if user_version != (versions[-1]["version"] if versions else 0):
                raise PersistenceError("DATABASE_MIGRATION_FAILED")
            return user_version
        except (sqlite3.DatabaseError, PersistenceError) as error:
            raise _map_error(error, "DATABASE_MIGRATION_FAILED") from error

    def migrate(self, target_version: int = CURRENT_COMPATIBLE_SCHEMA) -> int:
        self._writable()
        if target_version < 0 or target_version > LATEST_SCHEMA:
            raise PersistenceError("DATABASE_VERSION_UNSUPPORTED")
        db = self._db()
        current = self.schema_version()
        if current > target_version:
            raise PersistenceError("DATABASE_VERSION_UNSUPPORTED")
        self._preflight_upgrade(current, target_version)
        for migration in MIGRATIONS[current:target_version]:
            try:
                db.execute("BEGIN IMMEDIATE")
                for statement in _statements(migration.sql):
                    db.execute(statement)
                if migration.version == 28:
                    rows = db.execute(
                        "SELECT c.rowid,c.text FROM knowledge_chunks c JOIN knowledge_sources s "
                        "ON s.source_id=c.source_id WHERE s.status='active' "
                        "AND c.version=s.current_version AND length(c.text)>0"
                    )
                    for row in rows:
                        db.executemany(
                            "INSERT INTO knowledge_short_terms(chunk_rowid,term) VALUES(?,?)",
                            ((row["rowid"], term) for term in cjk_short_terms(row["text"])),
                        )
                db.execute(
                    "INSERT INTO schema_migrations(version,applied_at,checksum) "
                    "VALUES (?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?)",
                    (migration.version, migration.checksum),
                )
                db.execute(f"PRAGMA user_version = {migration.version}")
                db.execute("COMMIT")
            except (sqlite3.DatabaseError, PersistenceError) as error:
                if db.in_transaction:
                    db.execute("ROLLBACK")
                raise self._latch(error, "DATABASE_MIGRATION_FAILED") from error
        return self.schema_version()

    @contextmanager
    def transaction(self) -> Iterator[PersistenceSession]:
        self._writable()
        db = self._db()
        try:
            db.execute("BEGIN IMMEDIATE")
            yield PersistenceSession(db)
            db.execute("COMMIT")
        except Exception as error:
            if db.in_transaction:
                db.execute("ROLLBACK")
            if isinstance(error, sqlite3.DatabaseError):
                extended = getattr(error, "sqlite_errorcode", None)
                code = extended & 0xFF if isinstance(extended, int) else None
                if code in (sqlite3.SQLITE_FULL, sqlite3.SQLITE_IOERR,
                            sqlite3.SQLITE_READONLY, sqlite3.SQLITE_CORRUPT,
                            sqlite3.SQLITE_NOTADB):
                    raise self._latch(error, "DATABASE_IO_ERROR") from error
                if code in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED):
                    raise _map_error(error, "DATABASE_BUSY") from error
            raise

    def get_metadata(self, key: str) -> str | None:
        if not key or len(key) > 128:
            raise ValueError("Invalid metadata key")
        row = (
            self._db().execute("SELECT value FROM runtime_metadata WHERE key=?", (key,)).fetchone()
        )
        return str(row["value"]) if row else None

    def set_metadata(self, key: str, value: str) -> None:
        if not key or len(key) > 128:
            raise ValueError("Invalid metadata key")
        with self.transaction() as db:
            db.execute(
                "INSERT INTO runtime_metadata(key,value,updated_at) "
                "VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) "
                "ON CONFLICT(key) DO UPDATE SET "
                "value=excluded.value,updated_at=excluded.updated_at",
                (key, value),
            )

    def health(self) -> dict[str, Any]:
        try:
            if self._write_fault is not None:
                raise PersistenceError(self._write_fault)
            db = self._db()
            version = self.schema_version()
            if version < CURRENT_COMPATIBLE_SCHEMA:
                raise PersistenceError("DATABASE_MIGRATION_FAILED")
            journal = str(db.execute("PRAGMA journal_mode").fetchone()[0])
            return {
                "status": "ready",
                "readOnly": self.read_only,
                "schemaVersion": version,
                "sqliteVersion": str(db.execute("SELECT sqlite_version()").fetchone()[0]),
                "journalMode": "wal" if journal == "wal" else "unknown",
                "error": None,
            }
        except (sqlite3.DatabaseError, PersistenceError) as error:
            mapped = _map_error(error, "DATABASE_OPEN_FAILED")
            return {
                "status": "unavailable",
                "readOnly": self.read_only,
                "schemaVersion": None,
                "sqliteVersion": None,
                "journalMode": "unknown",
                "error": {
                    "code": mapped.code,
                    "message": "Forge storage unavailable",
                    "retryable": mapped.code == "DATABASE_BUSY",
                    "correlationId": "python-storage",
                },
            }

    def row(self, table: Literal["projects", "tasks", "runs"], key: str) -> dict[str, Any] | None:
        columns = {"projects": "project_id", "tasks": "task_id", "runs": "run_id"}
        if table not in columns:
            raise ValueError("Unknown persistence table")
        record = (
            self._db().execute(f"SELECT * FROM {table} WHERE {columns[table]}=?", (key,)).fetchone()
        )
        return dict(record) if record else None

    @staticmethod
    def _project(row: sqlite3.Row) -> Project:
        from forge.projects import Project

        return Project.model_validate_json(
            json.dumps(
                {
                    "projectId": row["project_id"],
                    "environmentId": row["environment_id"],
                    "name": row["name"],
                    "rootPath": row["canonical_path"],
                    "repositoryType": row["repository_type"],
                    "gitRoot": row["git_root"],
                    "defaultBranch": row["default_branch"],
                    "trusted": row["trust_version"] == "project-trust/v1",
                    "trustVersion": row["trust_version"],
                    "trustApprovedAt": row["trust_approved_at"],
                    "environmentSummaryHash": row["environment_summary_hash"],
                    "createdAt": row["created_at"],
                    "updatedAt": row["updated_at"],
                    "lastOpenedAt": row["last_opened_at"],
                    "revision": row["revision"],
                    "archivedAt": row["archived_at"],
                    "probe": json.loads(row["probe_json"]),
                }
            )
        )

    def get_project(self, project_id: str, *, include_archived: bool = False) -> Project | None:
        sql = "SELECT * FROM projects WHERE project_id=?"
        if not include_archived:
            sql += " AND archived_at IS NULL"
        row = self._db().execute(sql, (project_id,)).fetchone()
        return self._project(row) if row else None

    def get_project_by_path(self, canonical_path: str) -> Project | None:
        row = (
            self._db()
            .execute("SELECT * FROM projects WHERE canonical_path=?", (canonical_path,))
            .fetchone()
        )
        return self._project(row) if row else None

    def list_projects(self) -> list[Project]:
        rows = self._db().execute(
            "SELECT * FROM projects WHERE archived_at IS NULL "
            "ORDER BY last_opened_at DESC, created_at DESC"
        )
        return [self._project(row) for row in rows]

    @staticmethod
    def _set_metadata(db: PersistenceSession, key: str, value: str) -> None:
        db.execute(
            "INSERT INTO runtime_metadata(key,value,updated_at) "
            "VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) "
            "ON CONFLICT(key) DO UPDATE SET "
            "value=excluded.value,updated_at=excluded.updated_at",
            (key, value),
        )

    def create_project(self, project: Project) -> Project:
        value = project.model_dump(mode="json")
        with self.transaction() as db:
            db.execute(
                "INSERT INTO projects(project_id,environment_id,name,canonical_path,"
                "repository_type,git_root,default_branch,trust_version,trust_approved_at,"
                "environment_summary_hash,probe_json,created_at,updated_at,last_opened_at,"
                "revision,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    value["projectId"],
                    value["environmentId"],
                    value["name"],
                    value["rootPath"],
                    value["repositoryType"],
                    value["gitRoot"],
                    value["defaultBranch"],
                    value["trustVersion"],
                    value["trustApprovedAt"],
                    value["environmentSummaryHash"],
                    json.dumps(value["probe"], ensure_ascii=False),
                    value["createdAt"],
                    value["updatedAt"],
                    value["lastOpenedAt"],
                    1,
                    None,
                ),
            )
            db.execute(
                "INSERT INTO project_trust_decisions(project_id,trust_version,approved_at,"
                "environment_summary_hash,actor) VALUES(?,?,?,?,'local-user')",
                (
                    value["projectId"],
                    value["trustVersion"],
                    value["trustApprovedAt"],
                    value["environmentSummaryHash"],
                ),
            )
            db.execute(
                "INSERT INTO environments(environment_id,project_id,name,config_json,revision,"
                "created_at,updated_at) VALUES(?,?,?, ?,1,?,?)",
                (
                    value["environmentId"],
                    value["projectId"],
                    "Default",
                    '{"commandPresetIds":[],"envRefs":[],"networkMode":"trusted-local"}',
                    value["createdAt"],
                    value["updatedAt"],
                ),
            )
            db.execute(
                "INSERT INTO board_state(project_id,revision) VALUES (?,0)", (value["projectId"],)
            )
            self._set_metadata(db, "project.active_id", value["projectId"])
        return project

    def active_project(self) -> Project | None:
        project_id = self.get_metadata("project.active_id")
        return self.get_project(project_id) if project_id else None

    def set_active_project(
        self, project_id: str, expected_revision: int, now: str
    ) -> Project | None:
        with self.transaction() as db:
            changed = db.execute(
                "UPDATE projects SET last_opened_at=?, updated_at=?, "
                "revision=revision+1 WHERE project_id=? AND revision=? AND archived_at IS NULL",
                (now, now, project_id, expected_revision),
            ).rowcount
            if not changed:
                if self.get_project(project_id) is None:
                    return None
                raise PersistenceError("REVISION_CONFLICT")
            self._set_metadata(db, "project.active_id", project_id)
        return self.get_project(project_id)

    def update_project(
        self,
        project_id: str,
        expected_revision: int,
        name: str | None,
        default_branch: str | None,
        now: str,
    ) -> Project | None:
        before = self.get_project(project_id)
        if before is None:
            return None
        if before.revision != expected_revision:
            raise PersistenceError("REVISION_CONFLICT")
        with self.transaction() as db:
            changed = db.execute(
                "UPDATE projects SET name=?,default_branch=?,updated_at=?,"
                "revision=revision+1 WHERE project_id=? AND revision=? AND archived_at IS NULL",
                (
                    name if name is not None else before.name,
                    default_branch,
                    now,
                    project_id,
                    expected_revision,
                ),
            ).rowcount
            if not changed:
                raise PersistenceError("REVISION_CONFLICT")
        return self.get_project(project_id)

    def remove_project(self, project_id: str, expected_revision: int, now: str) -> bool:
        with self.transaction() as db:
            changed = db.execute(
                "UPDATE projects SET archived_at=?,updated_at=?,revision=revision+1 "
                "WHERE project_id=? AND revision=? AND archived_at IS NULL",
                (now, now, project_id, expected_revision),
            ).rowcount
            if not changed:
                if self.get_project(project_id) is None:
                    return False
                raise PersistenceError("REVISION_CONFLICT")
            # Keep project trust and the active context in place until every
            # owned writer reaches a known terminal state. These checks share
            # the archive transaction, so a concurrent Host writer cannot race
            # a successful metadata removal on the single SQLite owner.
            version = self.schema_version()
            resolved = (
                "AND r.recovery_resolved_at IS NULL "
                if version >= 36 else ""
            )
            uncertain_queries = [
                "SELECT 1 FROM runs r WHERE r.project_id=? AND r.state='interrupted' "
                + resolved + "LIMIT 1",
                "SELECT 1 FROM run_workspace_leases AS lease "
                "JOIN runs AS run ON run.run_id=lease.run_id "
                "WHERE run.project_id=? AND lease.state='quarantined' LIMIT 1",
            ]
            if version >= 17:
                uncertain_queries.append(
                    "SELECT 1 FROM review_jobs WHERE project_id=? "
                    "AND state='interrupted' LIMIT 1"
                )
            if version >= 18:
                uncertain_queries.append(
                    "SELECT 1 FROM verifier_jobs WHERE project_id=? "
                    "AND state='interrupted' LIMIT 1"
                )
            if any(db.execute(query, (project_id,)).fetchone() is not None
                   for query in uncertain_queries):
                raise PersistenceError("RUN_RECOVERY_REQUIRED")
            active_queries = [
                ("SELECT 1 FROM runs WHERE project_id=? AND state IN "
                 "('queued','running','waiting_input','pausing','paused','canceling') LIMIT 1"),
                "SELECT 1 FROM run_workspace_leases AS lease "
                "JOIN runs AS run ON run.run_id=lease.run_id "
                "WHERE run.project_id=? AND lease.state='active' LIMIT 1",
            ]
            if version >= 17:
                active_queries.append(
                    "SELECT 1 FROM review_jobs WHERE project_id=? AND state='running' LIMIT 1"
                )
            if version >= 18:
                active_queries.append(
                    "SELECT 1 FROM verifier_jobs WHERE project_id=? AND state='running' LIMIT 1"
                )
            if version >= 20:
                active_queries.append(
                    "SELECT 1 FROM rework_cycles WHERE project_id=? "
                    "AND state IN ('pending','launching','running') LIMIT 1"
                )
            if version >= 22:
                active_queries.append(
                    "SELECT 1 FROM merge_operations WHERE project_id=? "
                    "AND state IN ('intent','unknown') LIMIT 1"
                )
            if any(db.execute(query, (project_id,)).fetchone() is not None
                   for query in active_queries):
                raise PersistenceError("PROJECT_BUSY")
            db.execute(
                "DELETE FROM runtime_metadata WHERE key='project.active_id' AND value=?",
                (project_id,),
            )
        return True

    def restore_project(
        self, project_id: str, expected_revision: int, probe: ProjectProbe
    ) -> Project:
        from forge.projects import timestamp

        now = timestamp()
        with self.transaction() as db:
            changed = db.execute(
                "UPDATE projects SET archived_at=NULL,revision=revision+1,"
                "trust_version='project-trust/v1',trust_approved_at=?,"
                "environment_summary_hash=?,probe_json=?,"
                "updated_at=?,last_opened_at=? "
                "WHERE project_id=? AND revision=? AND archived_at IS NOT NULL",
                (
                    now,
                    probe.fingerprint,
                    probe.model_dump_json(),
                    now,
                    now,
                    project_id,
                    expected_revision,
                ),
            ).rowcount
            if not changed:
                raise PersistenceError("REVISION_CONFLICT")
            db.execute(
                "UPDATE project_trust_decisions SET trust_version='project-trust/v1',"
                "approved_at=?,environment_summary_hash=? "
                "WHERE project_id=?",
                (now, probe.fingerprint, project_id),
            )
            self._set_metadata(db, "project.active_id", project_id)
        saved = self.get_project(project_id)
        if saved is None:
            raise PersistenceError("PROJECT_NOT_FOUND")
        return saved

    def renew_project_trust(
        self, project_id: str, expected_revision: int, probe: ProjectProbe
    ) -> Project:
        """After backup import, require an explicit fresh picker/probe/trust decision."""
        from forge.projects import timestamp

        now = timestamp()
        with self.transaction() as db:
            changed = db.execute(
                "UPDATE projects SET trust_version='project-trust/v1',"
                "trust_approved_at=?,environment_summary_hash=?,probe_json=?,"
                "updated_at=?,revision=revision+1 "
                "WHERE project_id=? AND revision=? AND archived_at IS NULL "
                "AND trust_version='project-trust/restored-pending'",
                (now, probe.fingerprint, probe.model_dump_json(), now,
                 project_id, expected_revision),
            ).rowcount
            if not changed:
                raise PersistenceError("REVISION_CONFLICT")
            db.execute(
                "UPDATE project_trust_decisions SET trust_version='project-trust/v1',"
                "approved_at=?,environment_summary_hash=? WHERE project_id=?",
                (now, probe.fingerprint, project_id),
            )
        saved = self.get_project(project_id)
        if saved is None:
            raise PersistenceError("PROJECT_NOT_FOUND")
        return saved
