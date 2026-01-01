import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { commandPresetSchema, environmentConfigSchema, projectEnvironmentSchema,
  type CommandPreset, type ProjectEnvironment } from '@forge/contracts';

export class ProjectStorageError extends Error {
  constructor(readonly code: 'REVISION_CONFLICT' | 'PROJECT_NOT_FOUND' | 'PROJECT_ARCHIVED' |
    'ENVIRONMENT_NOT_FOUND' | 'ENVIRONMENT_IN_USE' | 'COMMAND_PRESET_NOT_FOUND' |
    'COMMAND_PRESET_REFERENCED') { super(code); }
}

interface EnvironmentRow {
  environment_id: string; project_id: string; name: string; config_json: string;
  revision: number; created_at: string; updated_at: string; archived_at: string | null;
}
interface PresetRow {
  preset_id: string; project_id: string; environment_id: string; name: string;
  executable: string; argv_json: string; cwd_relative: string; env_refs_json: string;
  timeout_seconds: number; scripts_hash: string; approval_hash: string;
  revision: number; created_at: string; updated_at: string; archived_at: string | null;
}

function environment(row: EnvironmentRow): ProjectEnvironment {
  return projectEnvironmentSchema.parse({ environmentId: row.environment_id, projectId: row.project_id,
    name: row.name, config: JSON.parse(row.config_json), revision: row.revision,
    createdAt: row.created_at, updatedAt: row.updated_at, archivedAt: row.archived_at });
}

function preset(row: PresetRow): CommandPreset {
  return commandPresetSchema.parse({ presetId: row.preset_id, projectId: row.project_id,
    environmentId: row.environment_id, name: row.name, executable: row.executable,
    argv: JSON.parse(row.argv_json), cwdRelative: row.cwd_relative,
    envRefs: JSON.parse(row.env_refs_json), timeoutSeconds: row.timeout_seconds,
    scriptsHash: row.scripts_hash, approvalHash: row.approval_hash || null,
    revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
    archivedAt: row.archived_at });
}

export interface EnvironmentInput {
  projectId: string; environmentId?: string | undefined; expectedRevision: number;
  name: string; config: ProjectEnvironment['config'];
}
export interface PresetInput {
  projectId: string; presetId?: string | undefined; expectedRevision: number;
  environmentId: string; name: string; executable: string; argv: string[];
  cwdRelative: string; envRefs: string[]; timeoutSeconds: number; scriptsHash: string;
}

export class ProjectDataStore {
  constructor(private readonly db: Database.Database) {}

  ensureProject(projectId: string): void {
    const row = this.db.prepare('SELECT archived_at FROM projects WHERE project_id = ?')
      .get(projectId) as { archived_at: string | null } | undefined;
    if (!row) throw new ProjectStorageError('PROJECT_NOT_FOUND');
    if (row.archived_at) throw new ProjectStorageError('PROJECT_ARCHIVED');
  }

  getEnvironment(projectId: string, environmentId: string): ProjectEnvironment | null {
    this.ensureProject(projectId);
    const row = this.db.prepare(`SELECT * FROM environments WHERE environment_id = ? AND project_id = ?
      AND archived_at IS NULL`).get(environmentId, projectId) as EnvironmentRow | undefined;
    return row ? environment(row) : null;
  }

  listEnvironments(projectId: string): ProjectEnvironment[] {
    this.ensureProject(projectId);
    return (this.db.prepare(`SELECT * FROM environments WHERE project_id = ? AND archived_at IS NULL
      ORDER BY created_at, environment_id`).all(projectId) as EnvironmentRow[]).map(environment);
  }

  private validatePresetReferences(projectId: string, environmentId: string,
    ids: string[]): void {
    if (new Set(ids).size !== ids.length) throw new ProjectStorageError('ENVIRONMENT_IN_USE');
    for (const id of ids) {
      const row = this.db.prepare(`SELECT 1 FROM command_presets WHERE preset_id = ? AND project_id = ?
        AND environment_id = ? AND archived_at IS NULL`).get(id, projectId, environmentId);
      if (!row) throw new ProjectStorageError('COMMAND_PRESET_NOT_FOUND');
    }
  }

  saveEnvironment(input: EnvironmentInput): ProjectEnvironment {
    const config = environmentConfigSchema.parse(input.config);
    return this.db.transaction(() => {
      this.ensureProject(input.projectId);
      const id = input.environmentId ?? randomUUID();
      this.validatePresetReferences(input.projectId, id, config.commandPresetIds);
      const now = new Date().toISOString();
      if (!input.environmentId) {
        if (input.expectedRevision !== 0) throw new ProjectStorageError('REVISION_CONFLICT');
        const duplicate = this.db.prepare(`SELECT 1 FROM environments WHERE project_id = ? AND name = ?
          AND archived_at IS NULL`).get(input.projectId, input.name);
        if (duplicate) throw new ProjectStorageError('REVISION_CONFLICT');
        this.db.prepare(`INSERT INTO environments(environment_id,project_id,name,config_json,revision,created_at,updated_at)
          VALUES (?,?,?,?,1,?,?)`).run(id, input.projectId, input.name, JSON.stringify(config), now, now);
      } else {
        const before = this.getEnvironment(input.projectId, id);
        if (!before) throw new ProjectStorageError('ENVIRONMENT_NOT_FOUND');
        const changed = this.db.prepare(`UPDATE environments SET name = ?, config_json = ?, revision = revision + 1,
          updated_at = ? WHERE environment_id = ? AND project_id = ? AND revision = ? AND archived_at IS NULL`)
          .run(input.name, JSON.stringify(config), now, id, input.projectId, input.expectedRevision).changes;
        if (!changed) throw new ProjectStorageError('REVISION_CONFLICT');
      }
      const saved = this.getEnvironment(input.projectId, id);
      if (!saved) throw new ProjectStorageError('ENVIRONMENT_NOT_FOUND');
      return saved;
    })();
  }

  archiveEnvironment(projectId: string, environmentId: string, expectedRevision: number): ProjectEnvironment {
    return this.db.transaction(() => {
      const before = this.getEnvironment(projectId, environmentId);
      if (!before) throw new ProjectStorageError('ENVIRONMENT_NOT_FOUND');
      const selected = this.db.prepare(`SELECT 1 FROM projects WHERE project_id = ?
        AND environment_id = ? AND archived_at IS NULL`).get(projectId, environmentId);
      if (selected) throw new ProjectStorageError('ENVIRONMENT_IN_USE');
      const activePresets = this.db.prepare(`SELECT 1 FROM command_presets WHERE project_id = ?
        AND environment_id = ? AND archived_at IS NULL LIMIT 1`).get(projectId, environmentId);
      if (activePresets) throw new ProjectStorageError('ENVIRONMENT_IN_USE');
      const now = new Date().toISOString();
      const changed = this.db.prepare(`UPDATE environments SET archived_at = ?, updated_at = ?, revision = revision + 1
        WHERE environment_id = ? AND project_id = ? AND revision = ? AND archived_at IS NULL`)
        .run(now, now, environmentId, projectId, expectedRevision).changes;
      if (!changed) throw new ProjectStorageError('REVISION_CONFLICT');
      return { ...before, archivedAt: now, updatedAt: now, revision: before.revision + 1 };
    })();
  }

  getPreset(projectId: string, presetId: string): CommandPreset | null {
    this.ensureProject(projectId);
    const row = this.db.prepare(`SELECT * FROM command_presets WHERE preset_id = ? AND project_id = ?
      AND archived_at IS NULL`).get(presetId, projectId) as PresetRow | undefined;
    return row ? preset(row) : null;
  }

  listPresets(projectId: string, environmentId: string): CommandPreset[] {
    if (!this.getEnvironment(projectId, environmentId)) throw new ProjectStorageError('ENVIRONMENT_NOT_FOUND');
    return (this.db.prepare(`SELECT * FROM command_presets WHERE project_id = ? AND environment_id = ?
      AND archived_at IS NULL ORDER BY created_at, preset_id`).all(projectId, environmentId) as PresetRow[]).map(preset);
  }

  savePreset(input: PresetInput): CommandPreset {
    return this.db.transaction(() => {
      if (!this.getEnvironment(input.projectId, input.environmentId)) throw new ProjectStorageError('ENVIRONMENT_NOT_FOUND');
      const id = input.presetId ?? randomUUID();
      const now = new Date().toISOString();
      if (!input.presetId) {
        if (input.expectedRevision !== 0) throw new ProjectStorageError('REVISION_CONFLICT');
        const duplicate = this.db.prepare(`SELECT 1 FROM command_presets WHERE project_id = ? AND environment_id = ?
          AND name = ? AND archived_at IS NULL`).get(input.projectId, input.environmentId, input.name);
        if (duplicate) throw new ProjectStorageError('REVISION_CONFLICT');
        this.db.prepare(`INSERT INTO command_presets(preset_id,project_id,environment_id,name,executable,
          argv_json,cwd_relative,env_refs_json,timeout_seconds,scripts_hash,approval_hash,revision,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,'',1,?,?)`).run(id, input.projectId, input.environmentId, input.name,
          input.executable, JSON.stringify(input.argv), input.cwdRelative, JSON.stringify(input.envRefs),
          input.timeoutSeconds, input.scriptsHash, now, now);
      } else {
        const before = this.getPreset(input.projectId, id);
        if (!before || before.environmentId !== input.environmentId) throw new ProjectStorageError('COMMAND_PRESET_NOT_FOUND');
        const changed = this.db.prepare(`UPDATE command_presets SET name = ?, executable = ?, argv_json = ?,
          cwd_relative = ?, env_refs_json = ?, timeout_seconds = ?, scripts_hash = ?, approval_hash = '',
          updated_at = ?, revision = revision + 1 WHERE preset_id = ? AND project_id = ? AND revision = ?
          AND archived_at IS NULL`).run(input.name, input.executable, JSON.stringify(input.argv), input.cwdRelative,
          JSON.stringify(input.envRefs), input.timeoutSeconds, input.scriptsHash, now, id,
          input.projectId, input.expectedRevision).changes;
        if (!changed) throw new ProjectStorageError('REVISION_CONFLICT');
      }
      const saved = this.getPreset(input.projectId, id);
      if (!saved) throw new ProjectStorageError('COMMAND_PRESET_NOT_FOUND');
      return saved;
    })();
  }

  approvePreset(projectId: string, presetId: string, expectedRevision: number,
    scriptsHash: string, approvalHash: string): CommandPreset {
    return this.db.transaction(() => {
      const before = this.getPreset(projectId, presetId);
      if (!before) throw new ProjectStorageError('COMMAND_PRESET_NOT_FOUND');
      if (before.scriptsHash !== scriptsHash) throw new ProjectStorageError('REVISION_CONFLICT');
      const changed = this.db.prepare(`UPDATE command_presets SET approval_hash = ?, revision = revision + 1,
        updated_at = ? WHERE preset_id = ? AND project_id = ? AND revision = ? AND archived_at IS NULL`)
        .run(approvalHash, new Date().toISOString(), presetId, projectId, expectedRevision).changes;
      if (!changed) throw new ProjectStorageError('REVISION_CONFLICT');
      const approved = this.getPreset(projectId, presetId);
      if (!approved) throw new ProjectStorageError('COMMAND_PRESET_NOT_FOUND');
      return approved;
    })();
  }

  archivePreset(projectId: string, presetId: string, expectedRevision: number): CommandPreset {
    return this.db.transaction(() => {
      const before = this.getPreset(projectId, presetId);
      if (!before) throw new ProjectStorageError('COMMAND_PRESET_NOT_FOUND');
      const refs = this.db.prepare(`SELECT config_json FROM environments WHERE project_id = ? AND archived_at IS NULL`)
        .all(projectId) as { config_json: string }[];
      if (refs.some((row) => environmentConfigSchema.parse(JSON.parse(row.config_json)).commandPresetIds.includes(presetId))) {
        throw new ProjectStorageError('COMMAND_PRESET_REFERENCED');
      }
      const now = new Date().toISOString();
      const changed = this.db.prepare(`UPDATE command_presets SET archived_at = ?, updated_at = ?, revision = revision + 1
        WHERE preset_id = ? AND project_id = ? AND revision = ? AND archived_at IS NULL`)
        .run(now, now, presetId, projectId, expectedRevision).changes;
      if (!changed) throw new ProjectStorageError('REVISION_CONFLICT');
      return { ...before, archivedAt: now, updatedAt: now, revision: before.revision + 1 };
    })();
  }
}
