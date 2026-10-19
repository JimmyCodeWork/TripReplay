# Security Policy

English | [繁體中文](docs/zh-TW/SECURITY.md)

## Supported Versions

TripReplay has not yet published a release. Once releases begin, security fixes will be provided for the latest release only.

## Reporting a Vulnerability

Do **not** report vulnerabilities through public issues, pull requests or discussions.

Report them privately through GitHub: open the repository's **Security** tab and select **Report a vulnerability**. Reports may be written in English or Traditional Chinese.

Please include:

- a description of the issue and its impact;
- steps to reproduce, or a proof of concept;
- the affected platform, version or commit;
- any suggested mitigation.

Do not include your own private photos, videos or travel data in a report. Use sample files instead.

## Scope

Because TripReplay promises that private data stays on the device ([Specification §1.3](docs/specification.md#13-definition-of-private-data-stays-on-the-device)), the following are treated as security vulnerabilities in addition to conventional issues:

- any remote request that contains media, EXIF data, project contents or local paths;
- any remote request made while offline mode is enabled;
- logs that record full local paths, EXIF data or itinerary contents;
- project package handling that allows path traversal, oversized extraction or overwriting files outside the application's storage;
- offline package or project data that is readable by other applications where the platform provides isolation.

## Response

Maintainers aim to acknowledge reports within 7 days and to agree on a disclosure timeline with the reporter. Fixed vulnerabilities are disclosed through GitHub Security Advisories, crediting the reporter unless they prefer otherwise.
