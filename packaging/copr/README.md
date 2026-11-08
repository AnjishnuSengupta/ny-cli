# Fedora COPR Packaging Guide for ny-cli

This directory contains the RPM specification file for building and maintaining `ny-cli` on Fedora, RHEL, CentOS Stream, and compatible distributions using [Fedora Copr](https://copr.fedorainfracloud.org/).

## Prerequisites

- A Fedora Account (FAS) at [src.fedoraproject.org](https://src.fedoraproject.org/)
- The `copr-cli` tool installed:
  ```bash
  sudo dnf install copr-cli
  ```
- Configured API token at `~/.config/copr` (obtained from `https://copr.fedorainfracloud.org/api/`).

## Local Mock Build Testing

Before submitting to COPR, test the RPM build locally using `mock`:

```bash
# 1. Install mock and rpm-build tools
sudo dnf install mock rpm-build

# 2. Add your user to the mock group
sudo usermod -aG mock $USER
# (Log out and log back in to apply group membership)

# 3. Create a source tarball
git archive --format=tar.gz --prefix=ny-cli-7.1.0/ -o ny-cli-7.1.0.tar.gz HEAD

# 4. Build SRPM
rpmbuild -bs --define "_sourcedir $(pwd)" --define "_srcrpmdir $(pwd)" packaging/copr/ny-cli.spec

# 5. Build in mock for Fedora 41 x86_64
mock -r fedora-41-x86_64 ny-cli-7.1.0-1.fc41.src.rpm
```

## Submitting to Fedora COPR

1. Create a new COPR project named `ny-cli` under your FAS account:
   ```bash
   copr-cli create ny-cli \
     --chroot fedora-40-x86_64 \
     --chroot fedora-41-x86_64 \
     --chroot fedora-rawhide-x86_64 \
     --description "Beautiful terminal anime streaming client with artwork display and cloud sync" \
     --instructions "Enable repo: dnf copr enable <username>/ny-cli && dnf install ny-cli"
   ```

2. Submit the SRPM build:
   ```bash
   copr-cli build ny-cli ny-cli-7.1.0-1.fc41.src.rpm
   ```

3. User installation:
   ```bash
   sudo dnf copr enable <username>/ny-cli
   sudo dnf install ny-cli
   ```

