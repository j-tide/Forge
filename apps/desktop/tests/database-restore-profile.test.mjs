import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { realpath } from 'node:fs/promises';
import { profileDataDir, readProfileSelection, requireSafeDataProfileSwitch,
  writeProfileSelection } from
  '../dist/main/database-restore-profile.js';

test('profile switch refuses live work and prior-runtime recovery uncertainty', () => {
  const idle = { activityCount:0, counts:{ startingRuns:0, developmentRuns:0,
    scheduledRuns:0, reviewJobs:0, verifyJobs:0, refinerJobs:0, ownedProcesses:0 },
  timestamp:'2026-09-27T00:00:00.000Z' };
  const safe = { safe:true, fences:{ unresolvedRuns:0, quarantinedLeases:0,
    interruptedReviewJobs:0, interruptedVerifyJobs:0, orphanProcessRecords:0,
    uncertainProcessJournalEntries:0 },
  timestamp:'2026-09-27T00:00:00.000Z' };
  assert.doesNotThrow(() => requireSafeDataProfileSwitch(idle,safe));
  assert.throws(() => requireSafeDataProfileSwitch({ ...idle, activityCount:1 },safe),
    /RUN_CONFLICT/);
  assert.throws(() => requireSafeDataProfileSwitch(idle,{ ...safe, safe:false,
    fences:{...safe.fences,orphanProcessRecords:1} }), /RUN_RECOVERY_REQUIRED/);
});

test('restored profile pointer switches only to an owned UUID directory', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'forge-restore-pointer-')));
  const id = 'caa70d81-5af0-4a2b-8a2e-0a37bca566f9';
  try {
    assert.equal(await readProfileSelection(root),null);
    await mkdir(profileDataDir(root,id),{recursive:true});
    await writeFile(join(profileDataDir(root,id),'forge.sqlite'),'fixture');
    await writeProfileSelection(root,id);
    assert.equal(await readProfileSelection(root),id);
    assert.equal(JSON.parse(await readFile(join(root,'active-profile.json'),'utf8')).profileId,id);
    await writeProfileSelection(root,null);
    assert.equal(await readProfileSelection(root),null);
    assert.equal(await readFile(join(profileDataDir(root,id),'forge.sqlite'),'utf8'),'fixture');
    assert.throws(() => profileDataDir(root,'../../escape'),/DATABASE_PROFILE_INVALID/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('tampered or linked selection refuses startup rather than escaping data root', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'forge-restore-invalid-')));
  try {
    await writeFile(join(root,'active-profile.json'),JSON.stringify({
      format:'forge-database-profile/v1',profileId:'../../other',
    }));
    await assert.rejects(readProfileSelection(root),/DATABASE_PROFILE_INVALID/);
    await rm(join(root,'active-profile.json'));
    const outside = await realpath(await mkdtemp(join(tmpdir(),'forge-restore-outside-')));
    try {
      await symlink(outside,join(root,'active-profile.json'));
      await assert.rejects(readProfileSelection(root),/DATABASE_PROFILE_INVALID/);
    } finally { await rm(outside,{recursive:true,force:true}); }
  } finally { await rm(root,{recursive:true,force:true}); }
});
