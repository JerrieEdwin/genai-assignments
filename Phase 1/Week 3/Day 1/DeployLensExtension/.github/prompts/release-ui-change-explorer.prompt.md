---
mode: agent
description: Build a standalone, privacy-first browser extension for comparing UI snapshots across deployments.
---

# ICEPOT prompt: Release UI Change Explorer

## Product identity

- **Name:** DeployLens
- **Tagline:** *See what changed. Know where to look.*

## Instructions

You are to implement a working browser extension that helps testers and developers see which parts of a web application's UI changed between a previous deployment and a new deployment.

- [MANDATORY] Create this as a new, self-contained browser extension under `release-ui-change-explorer/`. Design and implement its architecture, UI, and features specifically for this product; do not base the implementation on or refer to another extension.
- [MANDATORY] Build the MVP for Chromium browsers using Manifest V3 and the simplest maintainable stack that fits the workspace. Avoid unnecessary dependencies and frameworks.
- [MANDATORY] Implement the product; do not stop after producing a plan or mockup. Start with a brief implementation plan, then make the changes, run the focused tests, and report what works and any limitations.
- [CRITICAL] The extension compares captured UI states; it cannot determine which source-code files were deployed or reliably infer which code caused a visual change. Never present a visual change as a proven code change.
- [MANDATORY] Let users create a baseline release and a current release, capture pages they explicitly choose, and compare matching routes. Support different deployment origins (for example, staging and production) while matching routes by normalized path and query according to user settings.
- [MANDATORY] Capture only the active tab after an explicit user action. The MVP must not crawl a site, capture tabs in the background, or collect data from pages without the user's action.
- [MANDATORY] Show per-route visual comparisons, including a before/after view and an overlay or heatmap that makes changed regions easy to locate. Show a clear “no significant visual change” state when appropriate.
- [MANDATORY] Include route-level release context: release labels, capture time, viewport dimensions, optional commit SHA, release notes, and an optional user-supplied list of changed files. Make it clear that commit/file metadata is user-provided and is not automatically attributed to visual regions.
- [MANDATORY] Keep snapshots and reports local to the browser. Do not send screenshots, page text, DOM data, URLs, release metadata, or credentials to a server or AI service. Do not add analytics or telemetry.
- [CRITICAL] Request only the browser permissions required for the implemented workflow. Prefer user-granted active-tab access; do not request broad host permissions unless necessary and justified in the UI and documentation.
- [STRICT] Do not read passwords, browser autofill data, cookies, or authentication tokens. Do not capture browser-internal pages or claim support for pages the extension cannot access.
- [MANDATORY] Account for common comparison noise such as timestamps, rotating banners, animations, and user-selected masked regions. Provide a way to exclude selected page regions from comparison, and explain when a capture cannot be compared fairly (for example, different viewport sizes).
- [MANDATORY] Make the UI usable with keyboard navigation and accessible labels. Surface capture, storage, and comparison failures clearly; do not silently report success.
- [MANDATORY] Add focused tests for route matching/normalization and the visual-diff result classification. Test the “no change” case, a changed case, and incompatible snapshots such as different dimensions. Use appropriate tooling and scripts within the new project.

## Context

The user wants an extension that helps manual testers and developers understand what changed in the UI after deploying a new code set. They want to identify affected pages and visible areas so they can focus regression testing.

The extension runs in a browser and does not inherently have access to a deployment pipeline, source repository, complete route inventory, or the user's test accounts. The user must provide or visit the routes and capture both deployment states. The first version should work without a backend, GitHub token, or external service.

Use this MVP workflow:

1. The user creates or selects a baseline release and enters its label and origin.
2. The user opens a page in that deployment, selects the active tab in the extension, and captures the visible viewport for a route.
3. The user creates or selects the current release and captures the corresponding route from the new deployment.
4. The extension matches the snapshots by normalized route, checks that their viewport dimensions are comparable, computes a visual difference, and lists routes with changed regions.
5. The user reviews a route in a side panel or extension page, switches between baseline/current images, examines a difference overlay/heatmap, and exports a local report.

Keep the MVP honest and bounded:

- Compare the captured viewport, not an entire page or an entire application. A tester can capture multiple scroll positions as separate snapshots if supported.
- The extension can identify visual differences and, where feasible, show nearby DOM element context such as a visible label or selector. Such context is a candidate for investigation, not proof of the responsible component or source file.
- It cannot know all impacted routes unless the user supplies/captures them. Display coverage as captured routes, not as complete application coverage.
- Let the user enter or paste commit/release metadata and a changed-file list. Do not add GitHub authentication or claim source-to-UI mapping in the MVP.
- Store larger screenshot data locally using an appropriate browser-local store (for example, IndexedDB); avoid syncing page content to a cloud service.

The target output is a usable development/testing tool, not a production deployment dashboard. Prefer a small, understandable feature set and an honest limitations panel over speculative automation.

## Examples

Use this example row as the shape and level of certainty for a comparison report:

| Release | Route | Result | Visual change | Nearby UI context | Source metadata |
|---|---|---|---|---|---|
| `2.4.0` vs `2.4.1` | `/checkout` | Changed | `3.8%` of comparable pixels; highlighted near the primary action | “Pay now” button (candidate context) | `src/components/CheckoutButton.tsx` (user-supplied; not inferred) |

If there is no material difference, use a result such as:

| Release | Route | Result | Visual change | Nearby UI context | Source metadata |
|---|---|---|---|---|---|
| `2.4.0` vs `2.4.1` | `/account` | No significant visual change | Below the configured threshold | — | No file-level attribution |

Do not copy the example values into the implementation as fixed data. They illustrate the report format and the distinction between observed visual evidence and user-provided source metadata.

## Persona

Act as a senior browser-extension engineer collaborating with:

- a **manual tester** who needs to capture known routes in two deployments and quickly find visible changes;
- an **automation engineer** who cares about repeatable viewport, route, and masking settings;
- a **developer** who wants release context and optional changed-file metadata, but does not want unsupported guesses about code-to-UI attribution.

Balance usability for testers with maintainable, testable implementation. Explain browser API constraints in concise product copy rather than hiding them.

## Output format

Create the implementation under `release-ui-change-explorer/` with, at minimum:

- a valid Manifest V3 extension manifest;
- the extension UI and scripts needed for the capture, release management, comparison, and report workflow;
- local persistence for release metadata and captured snapshots;
- a focused test setup for the required comparison and route-matching behavior;
- a concise `README.md` in the new project explaining setup, loading the unpacked extension, the capture workflow, permissions, privacy, and known limitations.

The extension UI should include:

- release creation/selection for baseline and current deployments;
- capture of the explicitly selected active tab and route;
- a route comparison list with clear changed / unchanged / not comparable states;
- before/after and difference views with changed regions highlighted;
- configurable difference threshold and region masking, if feasible without making the MVP fragile;
- optional commit SHA, release notes, and pasted changed-file metadata;
- local JSON report export, with image export only if it can be done without exposing data externally.

After implementation, return:

1. a concise summary of the files/features created;
2. exact commands used and the result of focused tests;
3. how to load and use the extension;
4. permissions requested and why;
5. known limitations, especially route coverage and the lack of automatic source-code attribution.

Do not claim a test, feature, or browser compatibility result that was not actually verified.

## Tone

Be practical, precise, and transparent. Use plain language suitable for testers and developers. Prefer explicit limitations and actionable errors over optimistic claims. Keep explanations concise and do not call a visual comparison a code diff.
