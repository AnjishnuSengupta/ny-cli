Name:           ny-cli
Version:        3.0.0
Release:        1%{?dist}
Summary:        Terminal-based anime streaming client with self-hosted scraping

License:        MIT
URL:            https://github.com/AnjishnuSengupta/ny-cli
Source0:        %{name}-%{version}.tar.gz

BuildArch:      noarch
BuildRequires:  nodejs >= 18
BuildRequires:  npm
Requires:       nodejs >= 18
Requires:       grep sed
Recommends:     mpv
Suggests:       fzf vlc
AutoReqProv:    no

%description
NY-CLI is a terminal-based anime streaming client with self-hosted
scraping via the aniwatch npm package. Zero external API dependency.
Features include anime search, trending, watch history, cloud sync,
and support for multiple video players including mpv, vlc, and iina.

%prep
%autosetup

%build
npm install --omit=dev --ignore-scripts 2>/dev/null || npm install --production --ignore-scripts 2>/dev/null

%install
# Install application to /usr/lib/ny-cli
mkdir -p %{buildroot}/usr/lib/%{name}
cp -a ny-cli backend.mjs package.json node_modules %{buildroot}/usr/lib/%{name}/
chmod 755 %{buildroot}/usr/lib/%{name}/ny-cli

# Symlink to /usr/bin
mkdir -p %{buildroot}%{_bindir}
ln -sf /usr/lib/%{name}/ny-cli %{buildroot}%{_bindir}/ny-cli

install -Dm644 LICENSE %{buildroot}%{_licensedir}/%{name}/LICENSE
install -Dm644 README.md %{buildroot}%{_docdir}/%{name}/README.md

%files
%license LICENSE
%doc README.md
%{_bindir}/ny-cli
/usr/lib/%{name}/

%changelog
* Tue Feb 17 2026 Anjishnu Sengupta <itsaemail@duck.com> - 3.0.0-1
- Self-hosted scraping via aniwatch npm package (no external API dependency)
- Parallel server racing with Promise.any() for faster streaming
- Reduced timeouts for faster responsiveness
- Published as scoped npm package @anjishnusengupta/ny-cli

* Sat Jan 03 2026 Anjishnu Sengupta <itsaemail@duck.com> - 2.5.0-1
- Unified Continue Watching: CLI and website share the same history
- Cloud sync uses main Firestore history field for bidirectional sync
- Server fetches malId from API for proper website compatibility

* Sun Dec 28 2025 Anjishnu Sengupta <itsaemail@duck.com> - 2.0.0-1
- Cloud sync: Fetch watch history from nyanime.tech website
- Cloud sync: Push watch history from ny-cli to website
- Fixed duplicate entries in continue watching list
- Improved history deduplication

* Sat Dec 20 2025 Anjishnu Sengupta <itsaemail@duck.com> - 1.1.1-1
- Default to English subtitles
- Changed Sayonara to Sayounara

* Sat Dec 20 2025 Anjishnu Sengupta <itsaemail@duck.com> - 1.1.0-1
- Multi-language subtitle support (all available subtitles loaded, English default)
- Improved random function uses full anime database
- Fixed install.sh colored output
- UI improvements and bug fixes

* Sat Dec 20 2025 Anjishnu Sengupta <itsaemail@duck.com> - 1.0.0-1
- Initial package release
- Terminal-based anime streaming client
- Search, trending, watch history features
- Support for mpv, vlc, iina players
- Cloud sync via nyanime.tech
