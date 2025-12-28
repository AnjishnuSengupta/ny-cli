Name:           ny-cli
Version:        1.2.0
Release:        1%{?dist}
Summary:        Terminal-based anime streaming client

License:        MIT
URL:            https://github.com/AnjishnuSengupta/ny-cli
Source0:        %{name}-%{version}.tar.gz

BuildArch:      noarch
Requires:       curl grep sed
Recommends:     mpv
Suggests:       fzf vlc

%description
NY-CLI is a beautiful terminal-based anime streaming client
powered by nyanime.tech. Features include anime search, trending,
watch history, cloud sync, and support for multiple video players
including mpv, vlc, and iina.

%prep
%autosetup

%install
install -Dm755 ny-cli %{buildroot}%{_bindir}/ny-cli
install -Dm644 LICENSE %{buildroot}%{_licensedir}/%{name}/LICENSE
install -Dm644 README.md %{buildroot}%{_docdir}/%{name}/README.md

%files
%license LICENSE
%doc README.md
%{_bindir}/ny-cli

%changelog
* Sat Dec 28 2025 Anjishnu Sengupta <itsaemail@duck.com> - 1.2.0-1
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
