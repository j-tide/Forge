# ADR 0057 · Bundled workflow template source

Date: 2026-09-24
Status: Accepted for P5-01 development scope

## Decision

The read-only `forge_spec_v1.0/contracts/workflow.schema.json` and standard
reference preset remain product/spec authority. Production presets live as
versioned JSON data in `python/src/forge/workflow_presets/`, packaged with
the Python Host. `workflow_templates.py` is their closed Pydantic loader and
minimal static admission step. The Host never imports the reference folder at
runtime. Tests validate every production preset against the authoritative
reference Schema and check the bundled wheel contains the JSON data.

`standard@1` follows Plan → Develop → Review → Verify → human acceptance.
`quick@1` omits Plan but retains Review, Verify and final human acceptance.
`strict@1` adds an explicit human Plan gate before Develop while retaining
the same final Owner gate. Normal edges cannot cycle, all nodes must be
reachable, every normal terminal must be human approval, and rework/total
attempt limits are finite. A missing binding fails static admission.

These are **definitions**, not three currently executable workflow modes.
The existing P2/P3 Python development entry remains the verified
single-Develop path. `profile.planner` and generic Verifier plugin
replacement are not currently installed; P5-02 owns full compiler, capability
resolution, production activation and pre-start rejection. No template
selection is exposed in Desktop and no RunConfig/SQLite record is rewritten.
P5-05 owns published version freezing. A template's human gate does not
weaken Project Trust, tool Approval, final Owner acceptance or Done/merge
separation.

The user's precise `P4-10 → P5-01` development exception permits this work
using the real Codex path. It does not mark P4-05/P4-10 DONE or pass the P4
Phase Gate. Windows x64, macOS Intel and packaged runtime selection remain
unverified.
