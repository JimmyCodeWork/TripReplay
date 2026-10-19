# Contributing to TripReplay

English | [繁體中文](docs/zh-TW/CONTRIBUTING.md)

Thank you for your interest in TripReplay. The project is in its design phase, so the most valuable contributions right now are reviews of the [specification](docs/specification.md), findings from technical spikes, and license research.

Issues and pull requests may be written in English or Traditional Chinese.

## Before You Start

- Read the [Product Specification](docs/specification.md), the [Roadmap](docs/roadmap.md) and the [Dependency License Policy](docs/license-policy.md).
- Set up your environment as described in the [Development Guide](docs/development.md).
- For anything beyond a small fix, open an issue first so the approach can be agreed before you invest time.
- Significant architecture or policy changes require an [Architecture Decision Record](docs/adr/README.md).
- All participants are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licensing of Contributions

Contributions are licensed under the project's [MIT License](LICENSE), as provided by section D.6 of the [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#6-contributions-under-repository-license). By submitting a contribution, you confirm that you have the right to submit it under that license.

Signing off commits (`git commit -s`) is welcome but not required.

Do not submit code, data or assets that you did not write unless their license is permitted by the [Dependency License Policy](docs/license-policy.md) and the source is identified in the pull request.

## Adding a Dependency

Every new dependency, including transitive dependencies introduced by an upgrade, must be permitted by the [Dependency License Policy](docs/license-policy.md).

1. Open a **Dependency request** issue stating the package, version, SPDX license expression, purpose and alternatives considered.
2. Review the package's transitive dependencies and any embedded third-party code.
3. Once approved, add the dependency in a dedicated pull request with the lockfile change and the corresponding entries in `licenses/inventory.json`.

The CI license check rejects unreviewed components and prohibited or unknown licenses. See the [Development Guide](docs/development.md#license-check) for details.

## Privacy Requirements

TripReplay keeps all private data on the device ([Specification §1.3](docs/specification.md#13-definition-of-private-data-stays-on-the-device)). Contributions must not:

- send media, metadata, project contents or local paths to any remote service;
- add analytics, telemetry or crash reporting that transmits data automatically;
- write full local paths, EXIF data or itinerary contents to logs.

Any new network request must be documented in the pull request, together with what it sends and why.

## Documentation and UI Text

- English is the source language. Changes to user-facing documentation or UI strings must update both English and Traditional Chinese.
- If you cannot provide the translation, say so in the pull request; it will be labeled as needing translation and is not released until completed.
- Follow the terminology and typography conventions in [Localization](docs/localization.md).
- Traditional Chinese documents live under `docs/zh-TW/` and mirror the English file structure.

## Pull Requests

- Keep each pull request focused on a single change.
- Use a descriptive title in the imperative mood, for example "Add timeline compiler for photo segments".
- Write commit messages in English, with a short summary line (72 characters or fewer) followed by a body explaining what and why.
- Run `pnpm run verify` before opening the pull request, and complete the checklist in the pull request template.
- At least one maintainer approval is required before merging.

## Reporting Bugs and Requesting Features

Use the issue templates. For security or privacy vulnerabilities, do **not** open a public issue; follow the [Security Policy](SECURITY.md).
