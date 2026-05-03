#!/usr/bin/env python3
"""Validate the Forge specification pack, not the Forge application.
Dependencies: jsonschema, PyYAML. No network or user repository modifications.
"""
from __future__ import annotations
from pathlib import Path
import copy, json, sqlite3, tempfile, datetime, sys
import yaml
from jsonschema import Draft202012Validator, FormatChecker, ValidationError
ROOT=Path(__file__).resolve().parents[1]
results=[]
def check(name, fn):
    try:
        detail=fn()
        results.append({'name':name,'passed':True,'detail':detail or 'ok'})
    except Exception as exc:
        results.append({'name':name,'passed':False,'detail':str(exc)})
def load(path):return json.loads((ROOT/path).read_text())
def must_fail(fn):
    try:fn()
    except (ValidationError, ValueError, sqlite3.IntegrityError):return 'invalid input rejected'
    raise AssertionError('Expected rejection, but input accepted')
SCHEMAS={p.name.removesuffix('.schema.json'):json.loads(p.read_text()) for p in (ROOT/'contracts').glob('*.schema.json')}
def validate(name,data):Draft202012Validator(SCHEMAS[name],format_checker=FormatChecker()).validate(data)
for name,schema in SCHEMAS.items():check('schema valid: '+name,lambda s=schema:Draft202012Validator.check_schema(s))
example=load('contracts/task-contract.example.json')
check('task contract example',lambda:validate('task-contract',example))
check('plugin manifest example',lambda:validate('plugin-manifest',load('contracts/plugin-manifest.example.json')))
for p in (ROOT/'presets').glob('*.profile.json'):check('profile: '+p.stem,lambda p=p:validate('agent-profile',json.loads(p.read_text())))
workflow=yaml.safe_load((ROOT/'presets/standard.workflow.yaml').read_text())
def workflow_semantics(w):
    validate('workflow',w)
    nodes={n['id']:n for n in w['nodes']}
    if len(nodes)!=len(w['nodes']):raise ValueError('duplicate nodes')
    if w['start'] not in nodes:raise ValueError('missing start')
    graph={k:[] for k in nodes};routes=set()
    for e in w['edges']:
        if e['from'] not in nodes or e['to'] not in nodes:raise ValueError('dangling edge')
        key=(e['from'],e['on'])
        if key in routes:raise ValueError('ambiguous outcome')
        routes.add(key);graph[e['from']].append(e['to'])
    seen=set();stack=set()
    def visit(n):
        if n in stack:raise ValueError('normal path cycle')
        if n in seen:return
        stack.add(n)
        for x in graph[n]:visit(x)
        stack.remove(n);seen.add(n)
    visit(w['start'])
    if len(seen)!=len(nodes):raise ValueError('unreachable node')
    if not any(n['kind']=='approval' for n in nodes.values()):raise ValueError('missing final approval')
    for r in w['rework']:
        if r['from'] not in nodes or r['to'] not in nodes:raise ValueError('dangling rework')
        if r['maxCycles']<1:raise ValueError('unbounded rework')
    for n in nodes.values():
        if n['outputSchema'] not in SCHEMAS:raise ValueError('unresolved output schema '+n['outputSchema'])
    return f"{len(nodes)} nodes, {len(w['edges'])} normal edges, {len(w['rework'])} bounded rework routes"
check('default workflow schema + semantic',lambda:workflow_semantics(workflow))
def invalid_ac():
    x=copy.deepcopy(example);x['acceptance']=[];return must_fail(lambda:validate('task-contract',x))
check('reject empty acceptance',invalid_ac)
def invalid_field():
    x=copy.deepcopy(example);x['admin']=True;return must_fail(lambda:validate('task-contract',x))
check('reject unknown task fields',invalid_field)
def invalid_cycle():
    x=copy.deepcopy(workflow);x['edges'].append({'from':'accept','on':'approved','to':'plan'});return must_fail(lambda:workflow_semantics(x))
check('reject normal graph cycle',invalid_cycle)
def task_integrity():
    tasks=load('planning/tasks.json');tests=load('tests/acceptance-cases.json');mods=load('planning/modules.json');phases=load('planning/phases.json')
    ti={x['id'] for x in tasks};te={x['id'] for x in tests};mi={x['id'] for x in mods}
    assert len(ti)==len(tasks)==100
    assert len(te)==len(tests)==120
    assert len(mi)==24
    done=set()
    for t in tasks:
        assert set(t['dependsOn'])<=done,(t['id'],'forward or missing dependency')
        assert t['module'] in mi
        assert set(t['testIds'])<=te
        assert t['status']=='not_started'
        done.add(t['id'])
    assert set(x for p in phases for x in p['taskIds'])==ti
    assert all(x['status']=='specified_not_executed' for x in tests)
    return '100 tasks / 120 specified cases / 24 modules; dependencies and references valid'
check('planning and test references',task_integrity)
api=yaml.safe_load((ROOT/'contracts/openapi.yaml').read_text())
def api_refs():
    n=0
    def walk(x):
        nonlocal n
        if isinstance(x,dict):
            if '$ref' in x:
                ref=x['$ref'];assert ref.startswith('#/'),ref
                cur=api
                for key in ref[2:].split('/'):cur=cur[key.replace('~1','/').replace('~0','~')]
                n+=1
            for v in x.values():walk(v)
        elif isinstance(x,list):
            for v in x:walk(v)
    walk(api)
    cmds=load('planning/commands.json');methods=[x['properties']['method']['const'] for x in api['components']['schemas']['Command']['oneOf']]
    assert len(methods)==len(set(methods))
    assert set(methods)=={x['method'] for x in cmds}
    assert not next(x for x in cmds if x['method']=='credentials.set')['remoteAllowed']
    assert not next(x for x in cmds if x['method']=='approvals.decide')['remoteAllowed']
    return f"{len(api['paths'])} paths / {len(methods)} command variants / {n} resolved local refs"
check('OpenAPI references + command allowlist',api_refs)
cmd={'schemaVersion':'1.0','commandId':'cmd-01','method':'runs.pause','projectId':'project-demo','resourceId':'run-01','expectedRevision':1,'idempotencyKey':'example-idempotency-0001','payload':{'reason':'owner request'}}
root_schema={'$ref':'#/components/schemas/Command','components':api['components']}
check('command example',lambda:Draft202012Validator(root_schema).validate(cmd))
check('reject client supplied actor',lambda:must_fail(lambda:Draft202012Validator(root_schema).validate({**cmd,'actor':'owner'})))
check('reject unknown command',lambda:must_fail(lambda:Draft202012Validator(root_schema).validate({**cmd,'method':'shell.any'})))
def ddl_check():
    with tempfile.TemporaryDirectory() as td:
        conn=sqlite3.connect(str(Path(td)/'check.db'));conn.executescript((ROOT/'contracts/schema.sql').read_text())
        conn.execute("INSERT INTO principals VALUES('owner','owner','Owner',NULL)")
        conn.execute("INSERT INTO projects VALUES('p','h','Demo','/tmp/forge-spec-test','main','trusted-local',1,NULL,'2026-09-23T00:00:00Z')")
        conn.execute("INSERT INTO tasks VALUES('t','p','Demo','todo',1,1,'normal',0,1,'2026-09-23','2026-09-23')")
        conn.execute("INSERT INTO task_revisions VALUES('t',1,?,'hash','owner','2026-09-23')",(json.dumps(example),))
        conn.execute("INSERT INTO workflow_revisions VALUES('standard',1,'Standard',?,'hash','published','2026-09-23')",(json.dumps(workflow),))
        conn.execute("INSERT INTO runs VALUES('r','t',1,'standard',1,'queued','{}','hash',1,'2026-09-23',NULL)")
        conn.execute("INSERT INTO workspaces VALUES('w','p','t','/tmp/forge-spec-work','task/t','abcdef','ready')")
        conn.execute("INSERT INTO workspace_leases VALUES('l1','w',NULL,1,'write','active','now',NULL)")
        must_fail(lambda:conn.execute("INSERT INTO workspace_leases VALUES('l2','w',NULL,2,'write','active','now',NULL)"))
        conn.execute("UPDATE workspace_leases SET state='quarantined' WHERE id='l1'")
        must_fail(lambda:conn.execute("INSERT INTO workspace_leases VALUES('l3','w',NULL,2,'write','active','now',NULL)"))
        conn.execute("UPDATE workspace_leases SET state='released' WHERE id='l1'")
        conn.execute("INSERT INTO workspace_leases VALUES('l4','w',NULL,2,'write','active','now',NULL)")
        must_fail(lambda:conn.execute("UPDATE runs SET state='pretend-done' WHERE id='r'"))
        conn.execute("UPDATE runs SET state='canceling' WHERE id='r'")
        conn.execute("INSERT INTO command_receipts VALUES('c1','owner','idem1','hash','runs.pause','accepted',NULL,'now')")
        must_fail(lambda:conn.execute("INSERT INTO command_receipts VALUES('c2','owner','idem1','hash','runs.pause','accepted',NULL,'now')"))
        must_fail(lambda:conn.execute("INSERT INTO conversations VALUES('bad','missing-project','bad','now')"))
        conn.execute("INSERT INTO knowledge_fts VALUES('chunk','p','日期 筛选 start_date')")
        assert conn.execute("SELECT count(*) FROM knowledge_fts WHERE knowledge_fts MATCH 'start_date'").fetchone()[0]==1
        assert not conn.execute('PRAGMA foreign_key_check').fetchall()
        tables=[x[0] for x in conn.execute("SELECT name FROM sqlite_master WHERE type='table'") if not x[0].startswith(('sqlite_','knowledge_fts_'))]
        assert conn.execute('PRAGMA journal_mode').fetchone()[0]=='wal'
        conn.close()
        return {'tableAndVirtualTableCount':len(tables),'checks':['WAL','foreign keys','JSON valid','single writer','quarantine prevents new writer','idempotency unique','state constraint','FTS5 query']}
check('SQLite DDL + negative constraints',ddl_check)
def page_check():
    pages=load('design/page-specs.json');assert len(pages)==18
    for p in pages:assert (ROOT/'design/screens'/f"{p['route']}.png").is_file(),p['route']
    assert len({x['route'] for x in pages})==18
    assert 'script src=' not in (ROOT/'design/index.html').read_text().lower()
    return '18 page specs + local screenshots + self-contained prototype'
check('design asset links',page_check)
report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Specification pack validation only. NOT actual Forge application/SDK/OS/security test results.','passed':all(x['passed'] for x in results),'checks':results,'counts':{'schemas':len(SCHEMAS),'modules':24,'engineeringTasks':100,'specifiedProductTests':120,'designedPages':18,'apiPaths':len(api['paths']),'commands':len(load('planning/commands.json'))}}
(ROOT/'tests/pack-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(0 if report['passed'] else 1)
