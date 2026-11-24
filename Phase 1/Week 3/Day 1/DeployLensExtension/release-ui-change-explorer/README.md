# DeployLens

DeployLens is a standalone, privacy-first Manifest V3 browser extension for manually comparing visible UI snapshots from two deployments.

## Setup

No package installation is required for the extension itself.

1. Open a Chromium browser.
2. Visit `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select this `release-ui-change-explorer/` folder.

The extension does not send data to a backend or AI service.

## Use

1. Open the DeployLens popup and create a release. Enter its label and deployment origin.
2. Optional fields include a commit SHA, release notes, changed files, and a page route/URL inventory. These values are user-provided and never inferred.
3. Before deployment, open each route you need to test and press **Capture active tab as baseline**. The release shows how many unique routes are captured.
4. Deploy the new release, create/select the current release, and capture the same route set as current.
5. Open **Comparison review**. Select both releases and press **Compare all routes** to see the complete captured-route result in one view.
6. Select an individual route when needed to switch among baseline, current, and difference views. The difference view combines a red heatmap with red box outlines around detected changed regions. Adjust threshold, pixel tolerance, query matching, and ignored query parameters in the review toolbar.
7. Export an all-route JSON report, or a PNG of the selected route's difference view.

Mask regions by entering viewport-pixel coordinates in the popup and adding the mask. Masks are stored with the snapshot and excluded by the comparison.

## Tests

Run focused Node.js tests:

```powershell
cd "release-ui-change-explorer"
npm test
```

## Permissions

- `activeTab`: explicitly grants access only to the currently selected tab when the user invokes capture.
- `scripting`: obtains the active tab's viewport dimensions and nearby visible element labels for the capture.
- `storage`: stores settings and release metadata locally in browser storage.

No broad host permission is requested. The extension only supports HTTP and HTTPS pages; Chrome-internal pages and unsupported schemes are rejected. Snapshot images and metadata are stored locally in IndexedDB. Browser `storage.local` is used only for matching and display settings.

## Known limitations

- It compares the captured viewport only, not the complete page.
- Multiple scroll positions are separate snapshots; route matching does not automatically align scroll position.
- Coverage is limited to routes the user explicitly captures.
- Different viewport widths/heights are reported as not comparable.
- Captures may contain animation, timestamps, rotating banners, or dynamic content; use masking and pixel tolerance to reduce noise.
- Browser capture and scripting availability vary by page and browser policy.
- Nearby element text and selectors are candidate context, not source-code attribution.
- Commit SHAs and changed-file lists are pasted by the user. The extension never discovers deployment files or proves a code-to-visual relationship.
