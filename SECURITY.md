# Security policy

## Supported versions

Only the current GitHub Release is supported. The application version, Git tag
and Release tag must match exactly.

## Release integrity

Release assets are built only by GitHub Actions from the tagged commit. Every
release contains a SHA-256 checksum and an SPDX SBOM, and the main ZIP artifact
has GitHub build provenance.

```bash
gh attestation verify liangjian-v0.1.0.zip -R OWNER/REPOSITORY
gh release verify v0.1.0
gh release verify-asset v0.1.0 liangjian-v0.1.0.zip
```

## Data minimisation

The Drive scanner uses read-only access. It counts image and video metadata and
does not download, copy, edit or delete media content. Secrets and real Drive
links must never be committed to this repository.

## Vulnerability policy

High and critical dependency vulnerabilities block CI and release. Report
security issues privately through GitHub Security Advisories.
