Name:           ny-cli
Version:        7.0.1
Release:        1%{?dist}
Summary:        Beautiful terminal anime streaming client with artwork display and cloud sync

License:        MIT
URL:            https://github.com/AnjishnuSengupta/ny-cli
Source0:        %{name}-%{version}.tar.gz

BuildArch:      noarch
BuildRequires:  nodejs >= 20.18.0
BuildRequires:  npm
Requires:       nodejs >= 20.18.0
Recommends:     mpv chafa
Suggests:       vlc
AutoReqProv:    no

%description
NY-CLI is a beautiful terminal anime streaming client with React/Ink UI.
Features anime artwork display via Jikan API, watch progress tracking with
mpv IPC, 97%% auto-advance, cloud sync to nyanime.qzz.io, animated gradients,
ripple effects, and support for mpv and VLC players.

%prep
%autosetup

%build
[ -f anjishnusengupta-ny-cli-*.tgz ] || npm pack

%install
mkdir -p %{buildroot}%{_prefix}
tarball=$(ls -1 anjishnusengupta-ny-cli-*.tgz | head -n 1)
npm install -g --prefix %{buildroot}%{_prefix} "$tarball"

install -Dm644 LICENSE %{buildroot}%{_licensedir}/%{name}/LICENSE
install -Dm644 README.md %{buildroot}%{_docdir}/%{name}/README.md

%files
%license LICENSE
%doc README.md
%{_bindir}/ny-cli
%{_prefix}/lib/node_modules/@anjishnusengupta/ny-cli

%changelog
* Sun Apr 05 2026 Anjishnu Sengupta <itsaemail@duck.com> - 5.1.2-1
- React/Ink terminal UI with animated gradients and ripple effects
- Anime artwork display via Jikan API + chafa
- Watch progress tracking via mpv IPC
- 97%% auto-advance feature for completed episodes
- Enhanced cloud sync with watch time
- Production-ready universal installer

* Tue Feb 17 2026 Anjishnu Sengupta <itsaemail@duck.com> - 3.0.0-1
- Self-hosted scraping via AllAnime adapter backend
- Parallel server racing with Promise.any() for faster streaming
- Reduced timeouts for faster responsiveness
- Published as scoped npm package @anjishnusengupta/ny-cli

* Sat Jan 03 2026 Anjishnu Sengupta <itsaemail@duck.com> - 2.5.0-1
- Unified Continue Watching: CLI and website share the same history
- Cloud sync uses main Firestore history field for bidirectional sync
- Server fetches malId from API for proper website compatibility

* Sun Dec 28 2025 Anjishnu Sengupta <itsaemail@duck.com> - 2.0.0-1
- Cloud sync: Fetch watch history from nyanime.qzz.io website
- Cloud sync: Push watch history from ny-cli to website
- Fixed duplicate entries in continue watching list
- Improved history deduplication

* Sat Dec 20 2025 Anjishnu Sengupta <itsaemail@duck.com> - 1.0.0-1
- Initial package release
- Terminal-based anime streaming client
- Search, trending, watch history features
- Support for mpv, vlc, iina players
- Cloud sync via nyanime.qzz.io
