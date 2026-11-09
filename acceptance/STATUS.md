# Phase 5 status at preparation

The new read-only workflow and owner tools are prepared. This file records the
cloud preparation evidence, **not** a passing independent Actions run.

- Application stays exactly at `07f4e1fe9ade229efdaf3bfc4b026cba917801b6`.
- Exact remote checkout without submodule traversal: passed; root orphan stub
  excluded without modifying the committed gitlink.
- Actionlint, workflow permissions/trigger/pin checks: passed.
- Eight new Python guard tests and all thirteen original source gesture tests:
  passed. Python/browser-JS syntax checks passed. PowerShell parsing passed on
  Linux using the official SHA-verified PowerShell 7.5.4 portable release;
  Windows execution and physical hardware operation are **not claimed**.
- Cloud real preflight: failed closed. Supabase manifest and both Google model
  URLs returned proxy CONNECT 403 errors. Browser model initialization encountered
  the previously observed cloud proxy certificate error. TLS was not weakened.
- See `cloud-preflight.json` for the actual failures. Zero live manifest records,
  boundary samples or transitions were newly verified by this attempt. Models
  are not byte-compared; physical camera/real student-teacher writes are untested.
- Initial real-game loading, warm scrub, model/inference performance and total
  camera memory are unmeasured. A Projects JS-heap baseline in a failed preflight
  is not a successful game/camera benchmark.
- GitHub REST API access from the authoring environment returns Forbidden; the
  owner must use the manual workflow page if dispatch is unavailable. A workflow
  being committed is not proof of an Actions run or its result.

No Expo source, production flag, media, model, mission, reward, auth, Projects,
schema or storage-policy changes were made. The existing publishing workflow is
unchanged. No media upload or deployment occurred.

**Production recommendation: NO-GO.** Required outstanding evidence: an actual
independent read-only workflow pass, model compatibility review, owner-operated
physical-camera Chrome AND Edge reports, genuine nonproduction educational
acceptance, and disposition of the existing application baseline failures.

Use [the owner guide](README.md) for exact run/setup instructions. Do not infer
that the user's previously verified publication failed: this is a cloud access
blocker and this task has not reverified that publication independently.
