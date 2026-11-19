# Сторонние компоненты

Общие компоненты Store являются отдельными upstream-проектами и сохраняют свои лицензии.

| Компонент | Версия/источник | Лицензия и исходники |
|---|---|---|
| mgu-store / mgu-deploy | mgu-deploy 0.8.16 — supplied local source snapshot; upstream base commit `fc79a75f07f364c69165dec830f2fa4553ff20e4` contains deploy 0.8.11 | GPL-3.0; exact 0.8.16 bootstrap sources are in the separate Store dependencies archive |
| mgu-render | 0.6.19; тот же checkout mgu-store | GPL-3.0, MIT-части и собственные notices; архив Store dependencies |
| Canvas/record/font kit | idrive7-apps `f277cc9` | MIT; `recorder/ui/kit/LICENSE` и `SOURCE` |
| Intel Media SDK headers | API1.35 | MIT-уведомления в каждом `recorder/native/intel/*.h` |
| Noto Sans | `NotoSans-Regular.ttf` | SIL OFL1.1; `recorder/runtime/OFL.txt` |
| imageio-ffmpeg | 0.6.0 wheel | MIT wrapper; `recorder/runtime/LICENSE.imageio-ffmpeg` |
| Static FFmpeg | 7.0.2 from imageio-ffmpeg0.6.0 Linux x86_64 wheel | GPLv3 static build; provenance/configuration in `recorder/runtime/FFMPEG-*` |
| SSH.NET | 2026.0.1, commit `eaa52dba9555ca1ce57972557277c46733987dc5` | MIT; `installer/LICENSE-SSH.NET.txt` |
| Bouncy Castle / .NET libraries | versions pinned by build-inputs | MIT and notices in `installer/THIRD-PARTY-LICENSES.txt` |

Upstream locations:

- https://github.com/robertnisipeanu/mgu-store/tree/fc79a75f07f364c69165dec830f2fa4553ff20e4
- https://github.com/cauliflowermossgrape/idrive7-apps/tree/f277cc9
- https://github.com/sshnet/SSH.NET/tree/eaa52dba9555ca1ce57972557277c46733987dc5
- https://github.com/imageio/imageio-ffmpeg/tree/v0.6.0
- https://johnvansickle.com/ffmpeg/release-readme.txt
- https://ffmpeg.org/releases/ffmpeg-7.0.2.tar.xz

The original local offline build used FFmpeg executable SHA256 `e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99`; it is not included in this public source snapshot. Its package URL and wheel checksum are recorded in `FFMPEG-SOURCE.json`. The imageio wrapper license does not replace FFmpeg's GPL license. A full matching corresponding-source bundle for that prebuilt static FFmpeg and its linked libraries is not supplied here; the binary installer is withheld from public release until that source gap is resolved.

No BMW SDK, firmware, vehicle-owned libraries, keys or camera recordings are redistributed.
