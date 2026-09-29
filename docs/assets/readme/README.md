# README diagrams

This directory contains the diagrams embedded in the Chinese and English project READMEs.

| Files | Purpose |
| --- | --- |
| `architecture.{zh-CN,en}.json` | Authored component topology and source labels. |
| `architecture.{zh-CN,en}.{light,dark}.svg` | Static system architecture diagrams. |
| `task-flow.{zh-CN,en}.json` | Authored task and evidence workflow. |
| `task-flow.{zh-CN,en}.{light,dark}.svg` | Static task and evidence flow diagrams. |

The diagrams were authored with Archify 2.17. The static exports increase typography for README display and retain the authored topology. Rendering styles from Archify retain the [MIT notice](ARCHIFY-LICENSE). The illustrations describe Forge source and architecture decisions; they are not screenshots or evidence of completed product acceptance.

When updating them, keep both languages and themes in sync. Preserve the distinction between the existing Python Core path and the current derivative desktop's pending integration. Task approval, explicit Start, snapshot-bound evidence, and final human acceptance must remain distinct.

Architecture references: [ADR 0029](../../decisions/0029-python-core-runtime-architecture.md), [ADR 0087](../../decisions/0087-aperant-derived-desktop-base.md). Workflow references: [ADR 0040](../../decisions/0040-snapshot-bound-acceptance-matrix.md), [ADR 0041](../../decisions/0041-bounded-python-rework-loop.md), [ADR 0067](../../decisions/0067-published-linear-workflow-runtime-and-retrieval-freeze.md).
