from __future__ import annotations

import argparse
import shutil
import stat
import zipfile
from pathlib import Path


def resolve_release_root(root: Path, target: str | None) -> Path:
    candidates = []
    if target:
        candidates.append(root / "src-tauri" / "target" / target / "release")
    candidates.append(root / "src-tauri" / "target" / "release")

    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise FileNotFoundError(f"Unable to find a Tauri release directory for target={target!r}")


def resolve_binary_path(release_root: Path, platform: str, app_name: str) -> Path:
    if platform == "windows":
        candidates = [release_root / "moex_emulator.exe"]
    elif platform == "linux":
        candidates = [release_root / "moex_emulator"]
    elif platform == "macos":
        candidates = [
            release_root / "bundle" / "macos" / f"{app_name}.app",
            release_root / f"{app_name}.app",
            release_root / "moex_emulator.app",
            release_root / "moex_emulator",
        ]
    else:
        raise ValueError(f"Unsupported platform: {platform}")

    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise FileNotFoundError(f"Unable to find a built application for platform={platform!r}")


def copy_payload(source: Path, destination_root: Path) -> None:
    destination = destination_root / source.name
    if source.is_dir():
        shutil.copytree(source, destination, dirs_exist_ok=True, symlinks=True)
    else:
        shutil.copy2(source, destination)


def embed_database(root: Path, platform: str, app_name: str) -> None:
    if platform == "macos":
        app_bundle = root / f"{app_name}.app"
        if not app_bundle.exists():
            app_bundle = root / "moex_emulator.app"

        if app_bundle.exists():
            database_root = app_bundle / "Contents" / "Resources" / "database"
            database_root.mkdir(parents=True, exist_ok=True)
            return copy_database_payload(database_root)

    database_root = root / "database"
    database_root.mkdir(parents=True, exist_ok=True)
    copy_database_payload(database_root)


def copy_database_payload(database_root: Path) -> None:
    root = Path(__file__).resolve().parent.parent
    shutil.copy2(root / "database" / "moex_clean.sqlite", database_root / "moex_clean.sqlite")
    shutil.copytree(root / "database" / "images", database_root / "images", dirs_exist_ok=True)


def write_zip(archive_path: Path, source_dir: Path) -> None:
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(source_dir.rglob("*")):
            relative_path = path.relative_to(source_dir)
            zip_info = zipfile.ZipInfo.from_file(path, arcname=str(relative_path))
            permissions = stat.S_IMODE(path.stat().st_mode)
            zip_info.external_attr = permissions << 16

            if path.is_dir():
                archive.writestr(zip_info, b"")
            else:
                with path.open("rb") as handle:
                    archive.writestr(zip_info, handle.read())


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Create a portable MOEX Emulator bundle zip.")
    parser.add_argument("--platform", required=True, choices=["windows", "linux", "macos"])
    parser.add_argument("--target", default="")
    parser.add_argument("--app-name", default="MOEX Emulator")
    parser.add_argument("--output-dir", default=str(root / "dist-portable"))
    args = parser.parse_args()

    release_root = resolve_release_root(root, args.target or None)
    binary_path = resolve_binary_path(release_root, args.platform, args.app_name)
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    suffix = args.target or args.platform
    bundle_root = output_dir / f"moex-emulator-portable-{args.platform}-{suffix}"
    archive_path = output_dir / f"{bundle_root.name}.zip"

    if bundle_root.exists():
        shutil.rmtree(bundle_root)
    if archive_path.exists():
        archive_path.unlink()

    bundle_root.mkdir(parents=True, exist_ok=True)
    copy_payload(binary_path, bundle_root)
    embed_database(bundle_root, args.platform, args.app_name)

    write_zip(archive_path, bundle_root)
    shutil.rmtree(bundle_root)
    print(f"[create_portable_bundle] created: {archive_path}")


if __name__ == "__main__":
    main()
