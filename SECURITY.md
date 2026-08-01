# Security policy

## Supported versions

Only the current GitHub Release is supported. The application version, Git tag
and Release tag must match exactly.

## Release integrity

Release assets are built only by GitHub Actions from the tagged commit. Every
release contains a SHA-256 checksum and an SPDX SBOM. The main ZIP artifact is
signed keylessly with the GitHub Actions OIDC identity and recorded in Sigstore's
transparency log. GitHub Artifact Attestation is not available for user-owned
private repositories, so this repository uses a Cosign bundle instead.

```powershell
cosign verify-blob LiangJian-v0.1.1-windows-x64.zip `
  --bundle LiangJian-v0.1.1-windows-x64.sigstore.json `
  --certificate-identity "https://github.com/zoehate123-ux/liangjian-team-output/.github/workflows/release.yml@refs/tags/v0.1.1" `
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
gh release verify v0.1.1
gh release verify-asset v0.1.1 LiangJian-v0.1.1-windows-x64.zip
```

## Data minimisation

The Drive scanner uses read-only access. It counts image and video metadata and
does not download, copy, edit or delete media content. Secrets and real Drive
links must never be committed to this repository.

## Vulnerability policy

High and critical dependency vulnerabilities block CI and release. Report
security issues privately through GitHub Security Advisories.
