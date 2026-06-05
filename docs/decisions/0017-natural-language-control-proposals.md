# ADR 0017: Source-bound natural-language control proposals

Status: Accepted for P1-09 · 2026-09-24

## Decision

- `intent.propose` accepts only a project, conversation and persisted user message ID through the existing fixed conversation command channel. Host re-reads that message under the same project. The Renderer cannot supply proposal text, an approval identity or an executable command.
- The initial interpreter is deliberately bounded and deterministic: lower priority, pause Run, revise draft and restricted merge/push/deploy/delete or approval-bypass language. Restricted language wins if mixed with a benign request. Unrecognized wording stays unsupported. This is a narrow product capability, not a claim of general model understanding.
- A `ControlProposal` is a source-bound read model with a stable message-derived ID. Its schema literally requires `executionAllowed:false`; there is no proposal execute command. The stored user message is its durable source, so repeated queries and Host restart reconstruct the same proposal without a new proposal table or an extra migration.
- The UI opens a confirmation/diagnostic Dialog. Restricted proposals explain that independent authorization is still required; acknowledging the warning does not execute anything. Lowering priority of an approved Task requires a future revision and approval, so no P1-09 priority mutation bypasses the frozen Contract. A pause proposal is unavailable until Run control exists. A revise-draft proposal may navigate to the existing draft editor, which retains revision CAS, user decision and later approval gates.

## Safety and follow-up

- Direct `intent.execute`, arbitrary shell, forged approval and Task state commands remain outside the command schema. Model text, retrieved content and user-provided instruction strings never become an authorized principal.
- The already existing P1-04 model refiner may classify a message as `control` and leave a non-contract draft record. The UI labels it as a control intent and does not offer the Task editor for it. `intent.propose` is the actionable explanation path. This does not change the immutable approval semantics.
- Future Run, Task revision and Delivery commands need their own policies, target identity, expected revision and explicit human approval. P1-09 does not implement those domains.
