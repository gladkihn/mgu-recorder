# Сборка

Исходники рассчитаны на Python 3.12+, Node.js 18+ для локальных тестов и Node 8.7+ на MGU. Windows-установщик собирается компилятором .NET Framework из Windows 10/11; для запуска нужен .NET Framework 4.6.2+.

## Исходники из Git

Git содержит исходники, шрифты и необходимые лицензии. Готовый EXE, FFmpeg и подготовленные установочные пакеты не публикуются. Для сборки получите собственный совместимый Linux x86_64 FFmpeg и общие пакеты из их upstream-источников. Ссылки и минимальные версии приведены в THIRD_PARTY.md. Windows-библиотеки загрузите из официального NuGet по версиям в `installer/THIRD-PARTY-LICENSES.txt`.

```text
python tools/prepare_build.py --ffmpeg PATH_TO_YOUR_FFMPEG --artifacts PATH_TO_STORE_PACKAGES --nuget PATH_TO_NUPKG_FILES
python recorder/build.py
python installer/build.py
```

`prepare_build.py` копирует предоставленные runtime/пакеты и распаковывает NuGet-библиотеки. Он не подключается к автомобилю и не загружает зависимости из сети. `recorder/runtime/FFMPEG-SOURCE.json` фиксирует исходную протестированную сборку; если используете другую сборку, обновите provenance, SHA256 и конфигурацию вместе с необходимыми лицензиями. `recorder/build.py` проверяет SHA256 исполняемого файла по этому документу.

## C-помощники

Для сборки помощников используйте Linux x86_64 и toolchain/sysroot, совместимый с glibc 2.17 целевого MGU:

```sh
cc -O2 -std=gnu11 recorder/native/dvr-io.c -o recorder/native/dvr-io
cc -O2 -std=gnu11 recorder/native/observer.c -o recorder/native/observer -ldl -pthread
cc -O2 -std=gnu11 recorder/native/mfx-codec.c -o recorder/native/mfx-codec -ldl
```

Intel Media SDK загружается динамически из уже установленной системы MGU; бинарники BMW/Intel с автомобиля не распространяются. MIT-заголовки Intel сохранены в `recorder/native/intel`.

## Локальные проверки

```text
node tools/test_recorder.js
node installer/test-remote.js
node installer/test-uninstall.js
installer/dist/MGU-Recorder-Installer.exe --self-test installer/evidence/SELFTEST.json
installer/dist/MGU-Recorder-Installer.exe --preview installer/evidence/GUI.png
```

Генерируемые тестовые архивы/RESULT и снимки не входят в Git. Тесты не используют автомобиль.

Сборка создаёт новые source-пакеты, но не включает BMW SDK. Его связывание происходит на целевом MGU через mgu-deploy. Собранные EXE могут отличаться SHA256 из-за временной метки компилятора; опубликованный EXE проверяется отдельно по релизному SHA256.
