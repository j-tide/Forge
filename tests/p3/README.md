# P3 delivery acceptance

`pnpm test:p3-acceptance` reruns six real isolated Git/SQLite/Python Host
scenarios: normal delivery and explicit local merge; mixed Done/TODO board ordering; Reviewer change request;
failed test and bounded repair; human advisory waiver and final acceptance; and
Host crash after Git side effect with startup reconciliation.

`pnpm test:p3-live` also runs the actual Electron → fixed bridge → Python Host →
Codex app-server → snapshot → approved test → Review → Owner acceptance →
explicit local merge chain on a newly created disposable repository. A separate
Electron/Python Host probe uses real mixed-status SQLite records to exercise
cross-column denial, filters and keyboard ordering without invoking a model.
The Codex chain requires an already authenticated installation and may consume model usage.

Each scenario exits nonzero on a real assertion failure. The runner does not
manufacture reports or mark T116–T120 passed; those are M24 evaluation cases
owned by later phases. The isolated Reviewer-return fixture deliberately has
no second live Reviewer and must fail closed at that gate. See
`docs/demo/p3-delivery.md` for the execution record and limitations.
