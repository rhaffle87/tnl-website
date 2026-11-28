"""Exercise deploy.ps1 archive exclusions locally; never invokes deployment."""
from pathlib import Path
import os
import re
import shutil
import subprocess
import tarfile

import pytest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "deploy" / "deploy.ps1"


def _source_excludes():
    source = SCRIPT.read_text(encoding="utf-8")
    command = next(line for line in source.splitlines() if '"[3/6] Packaging backend source"' in line)
    return re.findall(r'"(--exclude=[^"]+)"', command)


def _snapshot_excludes():
    source = SCRIPT.read_text(encoding="utf-8")
    command = next(line for line in source.splitlines() if "tar -czf '$snapshot/backend/backend-src.tar.gz'" in line)
    return re.findall(r"--exclude='([^']+)'", command)


def _pack(source, archive, excludes):
    subprocess.run(
        ["tar", "-czf", archive.name, "-C", str(source), *excludes, "."],
        cwd=archive.parent, check=True, capture_output=True, text=True,
    )


def _seed(directory, version):
    directory.mkdir()
    for name in ["server.py", "media/shared.jpg", "downloaded_files/file.pdf", "venv/bin/python", ".env", ".upload_signing_secret", ".mailer_key"]:
        target = directory / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f"{version}:{name}", encoding="utf-8")


def test_backend_source_bundle_excludes_mutable_and_private_directories(tmp_path):
    source, archive = tmp_path / "source", tmp_path / "bundle.tgz"
    _seed(source, "local")
    _pack(source, archive, _source_excludes())
    with tarfile.open(archive) as bundle:
        names = {item.name.removeprefix("./") for item in bundle.getmembers()}
    assert "server.py" in names
    for excluded in ["media", "downloaded_files", "venv", ".env", ".upload_signing_secret", ".mailer_key"]:
        assert not any(name == excluded or name.startswith(excluded + "/") for name in names), names


def test_source_update_and_rollback_leave_media_sentinels_untouched(tmp_path):
    local, remote = tmp_path / "local", tmp_path / "server"
    _seed(local, "local")
    _seed(remote, "server")
    snapshot, incoming = tmp_path / "snapshot.tgz", tmp_path / "incoming.tgz"
    _pack(remote, snapshot, [f"--exclude={pattern}" for pattern in _snapshot_excludes()])
    _pack(local, incoming, _source_excludes())
    for archive in [incoming, snapshot]:
        subprocess.run(["tar", "-xzf", archive.name, "--no-same-owner", "--no-same-permissions", "-C", str(remote)], cwd=tmp_path, check=True, capture_output=True)
        for sentinel in ["media/shared.jpg", "downloaded_files/file.pdf", "venv/bin/python", ".env"]:
            assert (remote / sentinel).read_text(encoding="utf-8") == f"server:{sentinel}"
    assert (remote / "server.py").read_text(encoding="utf-8") == "server:server.py"


@pytest.mark.parametrize("restart_fails", [False, True])
def test_rollback_restores_dependencies_removes_added_source_and_checks_services(tmp_path, restart_fails):
    bash = Path("C:/Program Files/Git/bin/bash.exe") if os.name == "nt" else shutil.which("bash")
    if not bash or not Path(bash).is_file():
        pytest.skip("Bash is required to exercise the remote rollback script")
    remote, old, snapshot = tmp_path / "backend", tmp_path / "old", tmp_path / "snapshot"
    _seed(remote, "failed")
    _seed(old, "old")
    (remote / "added.py").write_text("failed release", encoding="utf-8")
    (snapshot / "backend").mkdir(parents=True)
    _pack(old, snapshot / "backend/backend-src.tar.gz", [f"--exclude={p}" for p in _snapshot_excludes()])
    shutil.copytree(old / "venv", snapshot / "backend/venv")
    for directory, value in [(tmp_path / "dist", "failed"), (snapshot / "frontend/dist", "old")]:
        directory.mkdir(parents=True)
        (directory / "index.html").write_text(value, encoding="utf-8")
    config, units = tmp_path / "sites", tmp_path / "units"
    for directory in [config, units, snapshot / "config"]:
        directory.mkdir(parents=True)
    for name in ["tnl-frontend", "tnl-backend.service"]:
        (snapshot / "config" / name).write_text("old", encoding="utf-8")
    (config / "nginx-ct103.conf").write_text("new config", encoding="utf-8")
    log = tmp_path / "services.log"
    stubs = ""
    for command in ["systemctl", "nginx", "curl"]:
        check = '[ "$*" != "restart tnl-backend" ]' if command == "systemctl" and restart_fails else "return 0"
        stubs += f'{command}() {{ printf "%s\\n" "{command} $*" >> "{log.as_posix()}"; {check}; }}\n'
    source = SCRIPT.read_text(encoding="utf-8")
    rollback = re.search(r'\$rollbackCmd = @"\n(.*?)\n"@', source, re.S).group(1)
    for name, replacement in {
        "$snapshot": snapshot,
        "/opt/tnl/backend": remote,
        "/opt/tnl/frontend/dist": tmp_path / "dist",
        "/etc/nginx/sites-available": config,
        "/etc/systemd/system": units,
    }.items():
        path = replacement.as_posix()
        if os.name == "nt":
            path = f"/{path[0].lower()}{path[2:]}"
        rollback = rollback.replace(name, path if name == "$snapshot" else f"'{path}'")
    rollback = stubs + rollback
    result = subprocess.run([str(bash), "-s"], input=rollback, text=True, capture_output=True)
    assert (result.returncode != 0) == restart_fails, result.stderr
    assert not (remote / "added.py").exists()
    assert (snapshot / "failed-source/added.py").read_text(encoding="utf-8") == "failed release"
    assert (remote / "server.py").read_text(encoding="utf-8") == "old:server.py"
    assert (remote / "venv/bin/python").read_text(encoding="utf-8") == "old:venv/bin/python"
    for name in [".env", "media/shared.jpg", "downloaded_files/file.pdf"]:
        assert (remote / name).read_text(encoding="utf-8") == f"failed:{name}"
    assert (tmp_path / "dist/index.html").read_text(encoding="utf-8") == "old"
    assert not (config / "nginx-ct103.conf").exists()
    assert (config / "tnl-frontend").read_text(encoding="utf-8") == "old"
    calls = log.read_text(encoding="utf-8")
    assert ("curl " in calls) != restart_fails
