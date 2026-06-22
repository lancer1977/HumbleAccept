# HumbleAccept
A browser extension set for Humble Bundle and Steam key handling.

## Tags

- humble-accept
- docs
- humble
- accept
- ui
- mod

## Overview
This repository contains two related browser extensions:
- Steam redemption automation for accepting keys, checking the agreement box, dismissing transient dialogs, and closing successful redemption tabs.
- Steam duplicate-key detection with webhook or relay notification so owned or already-consumed keys are preserved, copied, and queued with a resend UI.
- Humble Bundle key extraction and export to a configurable `channel-cheevos` endpoint.

## 🚀 Key Features
- Humble Bundle key extraction and export
- Steam key redemption automation
- Automatic popup dismissal and tab close handling
- Configurable publish endpoint and API key

## 🛠 Technology Stack
- Chrome Extension Manifest V3, vanilla JavaScript, DOM APIs

## 📖 Documentation
Detailed documentation can be found in the following sections:
- [Docs README](./docs/README.md)
- [ChannelCheevos Import Contract](./docs/integrations/channel-cheevos-import.md)
- [Feature Index](./docs/features/README.md)
- [Core Capabilities](./docs/features/core-capabilities.md)
- [Roadmap Index](./docs/roadmaps/README.md)

## CI/CD

GitHub Actions validates the browser-extension manifests and required source files with `bash scripts/validate.sh` on pushes and pull requests. The workflow packages the `Humble/` and `Steam/` extension folders as zip files and uploads them as the `humbleaccept-browser-extensions` workflow artifact.

No repository secrets are required for the current validation or artifact upload path.

## 🚦 Getting Started
Run `bash scripts/validate.sh` before packaging the extensions.

For the Humble extension, configure the ChannelCheevos import endpoint and bearer token from the options page. The Humble key popup can send revealed keys directly to that endpoint. Retryable delivery failures are kept in the extension-local import queue until the options-page retry action delivers them.
