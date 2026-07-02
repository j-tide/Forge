# ADR 0069 · Keyboard overlays and DPI evidence boundary

Status: Accepted for P6-02 (2026-09-25).

Forge keeps keyboard navigation in the shared Vue shell. Ctrl/Cmd+K opens a local navigation dialog listing only implemented views; it cannot invoke Host commands. `@forge/ui` owns the overlay focus stack and reference-counted background `inert` state. The top overlay alone handles Escape and Tab. It restores focus when closed normally **and when its parent unmounts it in the same Vue update**; the latter was found by a real Electron Task Drawer smoke and has a unit regression.

Long Chinese Task titles remain intact in the accessible title and detail drawer, while the board may truncate visually. Long Project names retain the complete value in the picker title. The real Electron offline fixture checks a 120-character title and a long Unicode path after Desktop restart without running project scripts.

CSS zoom at 100/125/150% on 1280×800 and 1600×1000 is a layout stress test, not a physical OS DPI test. Browser media emulation verifies the reduced-motion CSS path, not a physical system setting or a live Run transition. T108 stays deferred to P6-07 for Windows 150%/Mac Retina evidence; T110's live Run/Workflow transition stays deferred to P6-09. No platform or test result is inferred from screenshots alone.
