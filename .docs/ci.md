# Release workflow

- There is no general-purpose GitHub Actions CI workflow in this fork.
- `.github/workflows/release.yml` builds macOS (`arm64` and `x64`), Linux (`x64`), and Windows (`x64`) desktop artifacts from a single `v*.*.*` tag and publishes one GitHub release.
- The release workflow auto-enables signing only when secrets are present: Apple credentials for macOS and Azure Trusted Signing credentials for Windows. Without secrets, it still releases unsigned artifacts.
- See `docs/release.md` for the full release and signing checklist.
