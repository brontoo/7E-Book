# Publishing the unchanged Full HD game imagery

Use **Actions → Publish Seven Emirates media → Run workflow**, branch **main**.
The workflow has no push/PR trigger and does not deploy or activate the Expo site.

Before running, configure the protected GitHub environment
`seven-emirates-publishing` with required reviewers where supported, prevent
self-review where supported, and permit only `main`. Add environment secrets:

- `SUPABASE_SECRET_KEY`: the preferred `sb_secret_…` key for the intended project.
- `SUPABASE_POLICY_DATABASE_URL`: a verified-TLS, read-only PostgreSQL connection
  to the same Supabase project's policy catalogs, preferably the IPv4-compatible
  Session Pooler URL from the dashboard.
- `SUPABASE_SERVICE_ROLE_KEY`: only as a legacy service-role JWT alternative.
- `EXPO_REPOSITORY_READ_TOKEN`: only if Expo is private; fine-grained Contents:
  read access to that repository only. It must not have write/admin access.

Never paste credentials in an issue, commit, workflow input, chat or artifact.
The publishing job's normal GitHub token has only `contents: read`. Secret API
keys use `apikey` only; legacy JWTs retain their documented Bearer handling.
An authenticated Storage GET verifies actual compatibility before uploading.

The existing dedicated `seven-emirates-game` bucket must be public for reads.
The job does not create buckets or change storage policies. Its read-only audit
must prove client INSERT/UPDATE/DELETE are denied. The full setup and conservative
policy-audit contract, along with the Windows alternative, are documented here:

[Pinned Expo publishing guide](https://github.com/brontoo/tomorrows-earth-expo/blob/cc02f5deb4072561ecaf771e6ff7471f42371d90/docs/github-actions-media-publishing.md)

Reviewed immutable inputs:

- Source frames: commit `1bc718ef5e770033a3f00f398223abce01052fb1`.
- Expo integration publisher: commit `cc02f5deb4072561ecaf771e6ff7471f42371d90`.
- Media version: `7e-1bc718ef5e77`.
- Exact manifest SHA-256:
  `96e7635ce959133c36268b0028474f0737932af5dd498977e7a5d1b69a34d11f`.

The workflow checks out the Expo integration branch and refuses a different
head. If that branch advances, review and update its pinned commit before
running again. It always checks out source imagery at the original provenance
commit, independent of this repository's newer workflow/documentation commits.

All 1,673 native 1920×1080 WebPs must match the manifest exactly. No files are
recompressed, resized, interpolated or re-exported. The existing publisher
resumes by verifying public bytes, refuses immutable mismatches and uploads the
manifest last. Acceptance requires 1,674 remotely verified objects, public CORS,
native image dimensions and the actual client resolver/browser decoder check.
Only credential-free reports/checkpoints are retained for seven days.

Creating or pushing this workflow is not a publication. Do not claim upload
success until the manual run and every verification step succeeds. In particular,
local-fixture canary reports explicitly say `remoteVerified:false` and cannot
constitute acceptance. No storage credentials have been configured by adding
these files; environment protection and secret configuration require repository
administrator access.
