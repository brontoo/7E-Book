# Phase 5 — real Seven Emirates acceptance

This is a separate **read-only** acceptance system. It does not publish imagery,
deploy Expo, merge application branches, alter production flags or change any
missions, rewards, authentication, databases or policies. The game/controller
remain exactly at reviewed Expo commit:

`07f4e1fe9ade229efdaf3bfc4b026cba917801b6`

## 1. Run independent GitHub Actions QA

Open [Accept Seven Emirates real media](https://github.com/brontoo/7E-Book/actions/workflows/accept-seven-emirates.yml).
Select **Run workflow → main → Run workflow**. This starts a new run with the
current workflow, rather than rerunning an old job definition.

The job has only `contents: read` permissions and runs only by manual dispatch.
It checks out the exact reviewed Expo commit using nonrecursive Git and cone
sparse checkout, avoiding the orphaned root gitlink and checkout-action cleanup.
It checks out only these QA tools at the workflow's own commit. No source frames
are downloaded into the application source tree. Dependencies use the frozen
pnpm lockfile, Python 3.12 and Playwright 1.62.0.

The dedicated environment is `seven-emirates-qa`. **No Supabase secret is needed.**
If Expo is private, configure only `EXPO_REPOSITORY_READ_TOKEN` in that environment:
a fine-grained token granting Contents: read to Expo. If public, the normal
read-only job token is enough. Do not copy Supabase credentials into this job.
Configure environment review protections if desired; the workflow declaration
alone does not establish them. API access from the cloud authoring environment
may prevent automatic dispatch, but the owner can start it using the link above.

Flags exist only in the temporary localhost preview process:

```
VITE_BOOK_ENGINE=frames
VITE_BOOK_GESTURES=true
VITE_BOOK_ASSET_BASE_URL=https://hjqyhybgitdizfhwpdcv.supabase.co/storage/v1/object/public/seven-emirates-game/
VITE_BOOK_MEDIA_VERSION=7e-1bc718ef5e77
```

The workflow reuses **the unchanged `scripts/qa-real-book.py` from Expo 07f4e1f**.
No media, model, SDK or WASM responses are intercepted or substituted. Only test
account/progress GET responses use explicit read-only fixtures; API mutations
are blocked. Owner/performance tools also abort non-read requests to any host;
asset/model GETs continue to their actual servers without replacing responses. The workflow performs:

- Actual public manifest SHA verification against the reviewed immutable SHA,
  plus validation of **every one of 1,673 frame records**, dimensions, integrity
  metadata, relative keys and seven contiguous ordered chapter ranges.
- Actual original/pinned model downloads and exact size/SHA-256 comparison,
  independently of browser CORS. Nothing is substituted if either download fails.
- A fresh-browser, cache-disabled cold first-frame measurement; warm navigation
  and eight warm keyboard scrubs. Limited CDP JS heap/DOM snapshots are collected
  before game, after first frame/scrubbing, and after route cleanup.
- Browser CORS/MIME/size/SHA/1920x1080 decoding of all **14 boundary samples**,
  all seven deep links, and **both directions of all six transitions**.
- Actual SDK 1.2.2/matching WASM/pinned model initialization and close twice,
  after explicit QA opt-in, with zero camera requests. Actual fetched WASM/model
  hashes and initialization timings are recorded.

The Actions artifact contains `manifest.json`, `models.json`, `performance.json`,
`browser.json` and `summary.json` for 14 days. The summary is deliberately short;
read the individual reports for actual failures and measurements. Only JSON is
uploaded, never preview logs, environment dumps, credentials or camera images.
Failures fail the job; no TLS verification is disabled. A known model mismatch
or unverified comparison cannot produce a passing automated summary.

An automated pass **does not approve physical gestures or production**. Production
remains NO-GO until the manual camera and genuine educational checks below have
been reviewed. A failed initialization duration is not a successful benchmark.

## 2. Understand model compatibility

Prototype URL:
`https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task`

Pinned version-1 URL:
`https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task`

`models.json` reports both actual SHA-256 values/lengths, failures and `sameBytes`.
The browser report additionally verifies actual pinned runtime initialization.
If the bytes differ, do not interpret matching SDK version as matching behavior:
classification/confidence distributions can change, affecting the existing fist
0.58, pointing 0.51 and pinch interaction behavior. Pinch geometry itself is
scale-independent landmark math but can also be affected by landmark differences.
Keep SDK/WASM 1.2.2 and the current model unchanged; compare the original tested
prototype and integrated app physically under the same lighting/camera before
approving any model difference. If an original URL is unavailable, comparison is
**unverified**, never assumed equal. Same-origin hosting, if later justified,
requires the same reviewed bytes, checksums and upstream model/license review;
this acceptance task does not deploy or substitute resources.

## 3. Windows owner setup — once

Install [Git for Windows](https://git-scm.com/download/win), Node.js 22 with
Corepack, [Python 3.12+](https://www.python.org/downloads/windows/) including the
Python launcher, and current Chrome and Edge. These tools are prerequisites;
the launcher installs only locked app dependencies and its external Python test
environment. No database password or Supabase service key is needed.

Open **PowerShell** in a new empty folder. Copy these commands. They create two
separate QA checkouts and do not reset or overwrite your existing project:

```powershell
git clone --filter=blob:none --sparse https://github.com/brontoo/7E-Book.git 7E-Book-QA
git -C 7E-Book-QA sparse-checkout set --cone acceptance
git clone --filter=blob:none --no-checkout https://github.com/brontoo/tomorrows-earth-expo.git tomorrows-earth-expo-QA
git -C tomorrows-earth-expo-QA sparse-checkout set --cone api client docs drizzle media patches scripts server shared
git -C tomorrows-earth-expo-QA fetch --no-recurse-submodules --depth=1 origin 07f4e1fe9ade229efdaf3bfc4b026cba917801b6
git -C tomorrows-earth-expo-QA checkout --no-recurse-submodules --detach 07f4e1fe9ade229efdaf3bfc4b026cba917801b6
```

Check every command succeeded before proceeding. If either repository is private,
use Git's normal sign-in prompt; never paste a token in a command or report.
The QA tools track main; for reproducible review, use the exact 7E-Book workflow
commit supplied in the task's final report with `git -C 7E-Book-QA checkout <SHA>`.
The app must remain at the exact Expo commit above; the launcher refuses a
mismatching HEAD or tracked changes. It also refuses an already occupied port 4174.

Run Chrome acceptance:

```powershell
powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\7E-Book-QA\acceptance\start-windows.ps1 -AppPath .\tomorrows-earth-expo-QA -Browser chrome
```

Then repeat with Edge:

```powershell
powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\7E-Book-QA\acceptance\start-windows.ps1 -AppPath .\tomorrows-earth-expo-QA -Browser msedge
```

`RemoteSigned` applies only to this launched PowerShell process; no machine-wide
execution policy is changed. Follow your organization's normal script policy
if it prevents execution; do not disable transport/certificate verification.
The launcher uses process-only public preview flags, creates a Python environment
under TEMP, starts localhost preview, runs real network checks, opens the owner
browser, and stops its preview process tree/restores flags when finished.

Reports are saved automatically under:
**`C:\Users\YOUR-NAME\Seven-Emirates-QA-Reports\<timestamp>-<browser>`**.
If networking fails, inspect `browser.json`, `models.json` and `performance.json`.
Check that Supabase, jsDelivr and both Google Storage model URLs open without a
certificate warning in your normal browser. For enterprise/proxy problems ask
your administrator to restore trusted HTTPS; do not use ignore-certificate flags.
If media or model initialization fails, the launcher stops before camera testing.
If only compatibility/another acceptance check fails after media/model success,
it allows evidence collection but clearly keeps production approval blocked.

## 4. Physical camera checklist

No camera starts automatically. In the opened browser, click **Enable Hand
Controls**, then **Allow** in Chrome/Edge. If denied, use the browser's site
permission controls beside the localhost address to allow Camera and retry.
Use a real webcam; do not select a virtual-camera application for physical sign-off.
Nothing records or uploads camera images.

An **Owner camera QA** panel appears outside the game. Collapse it while testing.
Use the physical mouse on that panel; game gestures cannot activate its controls.
Account/progress values in this session are explicitly **simulated read-only
fixtures**. All actual imagery, SDK, WASM, model and camera data paths are real.
Do not use this session to submit missions or verify real rewards.

1. In **Locked mode**, only Abu Dhabi is available. Try fist scrubbing past 238,
   locked chapter tabs and pinch on disabled controls: all must remain locked.
2. Hold a fist briefly: no initial jump. Move left to advance/right to reverse,
   smoothly and proportionally. Release: immediate stop, no autoplay or inertia.
3. Point: cursor mirrors correctly, follows smoothly and targets intended book
   controls. Hide the hand: no stale pointer. Pinch/release selects once; hold
   pinch for several seconds and repeat quickly: no extra activations. Account,
   audio, camera and unrelated site controls must not activate by pinch.
4. Disable Camera before switching to **All chapters**. The panel changes only
   fixture progress. Verify every chapter and these boundary pairs forward/back:
   **238/239, 477/478, 716/717, 955/956, 1194/1195, 1433/1434**.
   Educational names must match actual displayed imagery. No gesture directly
   creates completion, points or stamps.
5. Deny/retry permission, enable/disable repeatedly, hide the tab, use **Visit
   Projects**, then **Return to book**. The browser camera indicator must stop on
   disable/navigation and never restart automatically. Confirm no duplicate stream
   or continuing recognition. Check mouse/touch/keyboard/slider with camera off
   and during hand-input takeover; test reduced-motion preference too.
6. Where model hashes differ, compare against the original locally tested 7E-Book
   prototype on the same camera/browser/lighting. Record any fist/point/pinch
   accuracy or sensitivity difference before accepting the model change.
7. Reopen the panel, mark each item **Yes / No / Not tested**, disable Camera and
   press **Save and finish**. The tool autosaves every two seconds and on normal
   exit; closing early leaves partial evidence, not a pass.

`owner-camera.json` includes explicit self-reported answers, real getUserMedia
request/track-start/stop events, frame-request/display samples, camera status and
limited JS-heap measurements. It contains no video, snapshots, landmarks, camera
label/device ID or credentials. It never automatically marks physical acceptance
verified. A real browser stream can originate from a virtual device, so the
owner's physical-device attestation and reviewer observation still matter.

## 5. Genuine nonproduction educational acceptance — separate session

This cannot be signed off using the fixture account. Use genuine NONPRODUCTION
student and teacher test accounts in a normal app preview with its normal test
backend; do not use production data or real students. No such URL/accounts were
provided to the cloud agent, so these tests remain **NOT PERFORMED** here.

| Test | Expected result |
| --- | --- |
| Fresh student | Only the first allowed chapter; future missions locked |
| Submit first mission | Existing submission state saved; no premature verified stamp |
| Teacher rejects | Existing rejected/retry behavior; next chapter remains locked |
| Student resubmits / teacher verifies | Server awards points/stamp exactly once and unlocks the next chapter |
| Repeat verification/refresh | No duplicate rewards; authoritative state restored |
| Completed chapter revisit | Earlier chapters reopen without losing current progress |
| All seven missions | Exact sequence preserved; all stamps reflect server completion |
| Logout/login and refresh | Correct profile-specific chapter restoration and passport |
| Second student | No progress leakage across profiles |
| Projects smoke test | Existing submissions, dashboards, roles and voting unchanged; no camera or game media |

Record only test role aliases, result/status, browser/version and timing; never
passwords, tokens, names of real students or camera images. Store this separately
as `educational-acceptance.json` with each result `pass/fail/not-tested`, the
nonproduction environment identifier and reviewer/date. The read-only tools do
not automate educational writes and cannot approve this checklist.

## 6. Performance interpretation and production gate

- `performance.json`: cache-disabled cold first-frame, warmed navigation, eight
  keyboard scrub timings, JS heap/DOM counters and route cleanup. These are
  automation observations with polling overhead, not physical motion latency.
  Playwright routing can disable HTTP cache; repeated-navigation results include
  observed disk-cache hits and do not assume a cache hit. Use a normal browser
  network-cache run for a strict fully cached HTTP baseline when hits are zero.
- `browser.json`: 12 forward/reverse boundary timings and model initialization/
  close results. Boundary cache can be warm after explicit sample reads.
- `owner-camera.json`: renderer request-to-displayed samples while camera is
  active, lifecycle and JS heap observations. These exclude camera capture and
  inference-to-input delay; a rapid cached React update can measure nearly zero.
  This is not total gesture-to-frame latency or total process memory.
- For physical motion responsiveness and total memory, record owner observations,
  Chrome/Edge Task Manager process memory before/during/after camera, and (if
  needed) a Performance trace with screenshots disabled. Do not record the webcam.
  Inference loop counts/native GPU/WASM memory are not fully measured by CDP heap.

Known issues must be separated from unavailable evidence. A model hash mismatch
requires behavior comparison; blocked URLs/TLS failures require trusted network
repair; any boundary/locking/reward regression is a release blocker. Current
baseline application status at 07f4e1f is build passing, 141 tests passing with
three pre-existing failures and five baseline type-check errors. None are silently
fixed or waived by this workflow.

**NO-GO for production until** an actual passing independent workflow report,
physical Chrome AND Edge acceptance, model compatibility review, genuine
nonproduction educational acceptance and review of known baseline failures exist.
No UI checkbox or automated fixture test overrides these gates.
