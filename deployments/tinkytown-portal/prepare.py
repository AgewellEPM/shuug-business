"""Prepare a portable installed release and a separate private SQLite restore set."""
import argparse
import hashlib
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import tarfile
from tempfile import TemporaryDirectory


def add_file(archive, path, name, private=False):
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Expected a regular file at {path}")
    info = archive.gettarinfo(str(path), arcname=name)
    info.uid = info.gid = 0
    info.uname = info.gname = ""
    info.mode = 0o600 if private else 0o644
    with path.open("rb") as data:
        archive.addfile(info, data)


def runtime_files(root):
    for name in ("package.json", "workspace.json", "business-directory.json", "LICENSE"):
        yield root / name
    for name in ("site", "public", "sales", "scripts/rideshare-site", "scripts/sdr-export"):
        directory = root / name
        if directory.is_symlink() or not directory.is_dir():
            raise ValueError(f"Missing installed directory {directory}")
        for base, dirs, files in os.walk(directory):
            dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d != "node_modules")
            if any((Path(base) / d).is_symlink() for d in dirs):
                raise ValueError(f"Unexpected linked directory in {base}")
            for file in sorted(files):
                if file.startswith(".") or file.endswith((".test.mjs", ".log", "~")):
                    continue
                path = Path(base) / file
                if path.suffix.lower() in {".pem", ".key", ".env", ".sqlite", ".sqlite3", ".p12"}:
                    raise ValueError(f"Unexpected private file in app release: {path}")
                yield path


def prepare(root, state, out):
    os.umask(0o077)
    if root in out.parents or state in out.parents:
        raise ValueError("Use an output directory outside the live workspace")
    out.mkdir(mode=0o700, parents=False, exist_ok=False)
    with tarfile.open(out / "application.tar.gz", "w:gz") as archive:
        for path in runtime_files(root):
            add_file(archive, path, str(path.relative_to(root)))
    private_files = {}
    for path in state.iterdir():
        if path.name in {"workspace.sqlite", "workspace.sqlite-shm", "workspace.sqlite-wal", "workspace.sqlite-journal"}:
            continue
        if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
            raise ValueError(f"Unrecognized private state entry: {path.name}")
        private_files[path.name] = hashlib.sha256(path.read_bytes()).digest()
    if not {"session-key", "owner-code"} <= private_files.keys():
        raise ValueError("Missing workspace credentials")
    with TemporaryDirectory(dir=out) as scratch:
        database = Path(scratch) / "snapshot.sqlite"
        with closing(sqlite3.connect((state / "workspace.sqlite").as_uri() + "?mode=ro", uri=True)) as source:
            with closing(sqlite3.connect(database)) as copy:
                source.backup(copy)
                copy.execute("PRAGMA journal_mode=DELETE").fetchone()
                if copy.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                    raise ValueError("The database copy failed SQLite integrity_check")
        with tarfile.open(out / "private-state.tar.gz", "w:gz") as archive:
            add_file(archive, database, "workspace.sqlite", private=True)
            for name, digest in private_files.items():
                add_file(archive, state / name, name, private=True)
                if hashlib.sha256((state / name).read_bytes()).digest() != digest:
                    raise ValueError("A credential changed during the copy. Take a fresh snapshot.")
    archives = ["application.tar.gz", "private-state.tar.gz"]
    (out / "SHA256SUMS").write_text("".join(
        f"{hashlib.sha256((out / name).read_bytes()).hexdigest()}  {name}\n" for name in archives))
    print(f"Prepared {out}; database integrity verified.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("installed", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--state", type=Path)
    args = parser.parse_args()
    root = args.installed.resolve()
    prepare(root, (args.state or root / "workspace-data").resolve(), args.output.resolve())
