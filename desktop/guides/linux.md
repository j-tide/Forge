# Linux Installation & Building Guide

This guide covers potential Linux packaging commands. Linux packages and installation are **UNVERIFIED** for the current Forge preview; the current published artifact is macOS arm64. Check the actual package configuration and output before using any example below.

## Flatpak Installation

The imported build supports preparing Flatpak packages; this does not mean a tested Forge Flatpak has been published.

### Download Flatpak

Check the [main README](../README.md) and repository Releases for actual available artifacts. Do not download a different project’s package to substitute for Forge.

### Building Flatpak from Source

To build the Flatpak package yourself, you need additional dependencies:

```bash
# Fedora/RHEL
sudo dnf install flatpak-builder

# Ubuntu/Debian
sudo apt install flatpak-builder

# Install required Flatpak runtimes
flatpak install flathub org.freedesktop.Platform//25.08 org.freedesktop.Sdk//25.08
flatpak install flathub org.electronjs.Electron2.BaseApp//25.08

# Build the Flatpak
cd apps/desktop
npm run package:flatpak
```

The Flatpak will be created in `apps/desktop/dist/`.

### Installing the Built Flatpak

After verifying the actual output filename and application ID in the package metadata, install the Flatpak locally:

```bash
flatpak install --user apps/desktop/dist/Forge-*.flatpak
```

### Running from Flatpak

```bash
flatpak run dev.iamzjt.forgeglasspreview
```

## Other Linux Packages

### AppImage

AppImage files are portable and don't require installation:

```bash
# Make executable
chmod +x Forge-*-linux-x86_64.AppImage

# Run
./Forge-*-linux-x86_64.AppImage
```

### Debian Package (.deb)

For Ubuntu/Debian systems:

```bash
sudo dpkg -i Forge-*-linux-amd64.deb
```

## Troubleshooting

### Flatpak Runtime Issues

If you encounter runtime issues with Flatpak:

```bash
# Update runtimes
flatpak update

# Check for missing runtimes
flatpak list --runtime
```

### AppImage Not Starting

If the AppImage doesn't start:

```bash
# Check for missing libraries
ldd ./Forge-*-linux-x86_64.AppImage

# Try running with debug output
./Forge-*-linux-x86_64.AppImage --verbose
```
