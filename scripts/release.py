"""Discover, validate and independently release plugins/<slug>/plugin.json."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import quote
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
REPO = "https://github.com/BaSui01/snow-plugins"
SLUG = r"[a-z0-9]+(?:-[a-z0-9]+)*"
VERSION = r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
TAG = re.compile(rf"(?P<plugin>{SLUG})/v(?P<version>{VERSION})(?P<preview>-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?")
EXCLUDED = {".git", "node_modules", "__pycache__"}


def discover():
    plugins = {}
    ids = set()
    for path in sorted((ROOT / "plugins").glob("*/plugin.json")):
        name = path.parent.name
        if not re.fullmatch(SLUG, name) or path.parent.is_symlink() or path.is_symlink():
            raise ValueError(f"Unsafe plugin directory: {name}")
        manifest = json.loads(path.read_text(encoding="utf-8"))
        if not re.fullmatch(r"[A-Za-z0-9_-][A-Za-z0-9._-]{0,95}", manifest["id"]):
            raise ValueError(f"Invalid plugin id: {name}")
        if manifest["id"] in ids:
            raise ValueError(f"Duplicate plugin id: {manifest['id']}")
        ids.add(manifest["id"])
        if not re.fullmatch(VERSION, manifest["version"]):
            raise ValueError(f"Invalid plugin version: {name}")
        plugins[name] = (path.parent, manifest)
    if not plugins:
        raise ValueError("No plugin manifests found")
    return plugins


def files(directory):
    for path in sorted(directory.rglob("*")):
        if set(path.relative_to(directory).parts).intersection(EXCLUDED):
            continue
        if path.is_symlink():
            raise ValueError(f"Symlinks are not allowed: {path}")
        if path.is_file():
            yield path


def validate(directory, manifest):
    resources = [manifest["entry"], *manifest.get("styles", []), *manifest.get("locales", {}).values()]
    resources += [item["entry"] for item in manifest.get("contributions", {}).get("messageFooters", [])]
    icon = manifest.get("icon", "")
    if icon and not icon.startswith(("lucide:", "https://", "http://", "data:")):
        resources.append(icon)
    for resource in resources:
        path = (directory / resource).resolve()
        if not path.is_relative_to(directory.resolve()) or not path.is_file():
            raise ValueError(f"Missing or unsafe resource: {directory.name}/{resource}")
    for path in files(directory):
        if path.suffix == ".json":
            json.loads(path.read_text(encoding="utf-8"))
        if path.suffix in {".js", ".mjs"}:
            subprocess.run(["node", "--input-type=module", "--check"], input=path.read_bytes(), check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("validate", "resolve", "package", "market"))
    parser.add_argument("--tag")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--market", type=Path)
    parser.add_argument("--github-output", type=Path)
    args = parser.parse_args()
    plugins = discover()
    if args.command == "validate":
        for directory, manifest in plugins.values():
            validate(directory, manifest)
        print(f"Validated {len(plugins)} plugins: manifests, declared resources, JSON and JavaScript syntax.")
        return
    match = TAG.fullmatch(args.tag or "")
    if not match or match["plugin"] not in plugins:
        parser.error("Expected <existing-plugin-directory>/v<major.minor.patch>[-prerelease]")
    name, version = match["plugin"], match["version"]
    directory, manifest = plugins[name]
    if manifest["version"] != version:
        parser.error(f"{name}/plugin.json version must match tag base version {version}")
    asset = f"{name}-{version}.zip"
    if args.command == "resolve":
        metadata = dict(tag=args.tag, plugin=name, version=version, asset=asset,
                        id=manifest["id"], stable=str(not bool(match["preview"])).lower())
        if args.github_output:
            with args.github_output.open("a", encoding="utf-8", newline="\n") as output:
                output.writelines(f"{key}={value}\n" for key, value in metadata.items())
        print(json.dumps(metadata))
        return
    if args.output is None:
        parser.error("--output is required")
    output = args.output.resolve()
    if args.command == "package":
        validate(directory, manifest)
        output.mkdir(parents=True, exist_ok=True)
        archive = output / asset
        if archive.exists():
            raise FileExistsError(archive)
        with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
            for path in files(directory):
                bundle.write(path, path.relative_to(directory).as_posix())
            if not (directory / "LICENSE").exists():
                bundle.write(ROOT / "LICENSE", "LICENSE")
        checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
        (output / "SHA256SUMS.txt").write_text(f"{checksum}  {asset}\n", encoding="utf-8", newline="\n")
        print(f"Packaged only {name}: {archive}")
        return
    if match["preview"]:
        parser.error("Prereleases must not update the market")
    if args.market is None:
        parser.error("--market is required")
    archive = output / asset
    with ZipFile(archive) as bundle:
        published = json.loads(bundle.read("plugin.json"))
        market_metadata = json.loads(bundle.read("market.json")) if "market.json" in bundle.namelist() else {}
    if published["id"] != manifest["id"] or published["version"] != version:
        raise ValueError("Published archive id/version differs from the tagged source")
    entry_path = args.market / "app" / "plugins" / f"{manifest['id']}.json"
    if entry_path.exists():
        entry = json.loads(entry_path.read_text(encoding="utf-8"))
        if entry["id"] != manifest["id"] or entry["repo"] != REPO:
            raise ValueError(f"Unexpected market entry: {entry_path}")
        current = entry["version"]
        if not re.fullmatch(VERSION, current):
            raise ValueError(f"Review non-stable market version manually: {current}")
        if tuple(map(int, current.split("."))) > tuple(map(int, version.split("."))):
            raise ValueError("Refusing to downgrade an existing market version")
        checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
        if current == version and entry["sha256"].lower() != checksum:
            raise ValueError("Same market version has different bytes; publish a new patch version")
    else:
        entry = dict(id=manifest["id"], kind="plugin", name=published["name"],
                     description=published["description"], repo=REPO,
                     homepage=f"{REPO}/tree/main/plugins/{name}")
        if published.get("author"):
            entry["author"] = published["author"]
        if published.get("minAppVersion"):
            entry["minAppVersion"] = published["minAppVersion"]
    if not isinstance(market_metadata, dict):
        raise ValueError("market.json must be an object")
    if set(market_metadata) - {"minAppVersion"}:
        raise ValueError("market.json only accepts an explicit minAppVersion")
    if "minAppVersion" in market_metadata:
        minimum = market_metadata["minAppVersion"]
        if not isinstance(minimum, str) or not re.fullmatch(VERSION, minimum):
            raise ValueError("Invalid minimum host version")
        entry["minAppVersion"] = minimum
    entry.update(version=version, tag=args.tag, asset=asset,
                 downloadUrl=f"{REPO}/releases/download/{quote(args.tag, safe='')}/{asset}",
                 sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
                 privacy=published.get("privacy", {}).get("scopes", []))
    entry_path.parent.mkdir(parents=True, exist_ok=True)
    entry_path.write_text(json.dumps(entry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Prepared only {entry_path.name}; maintainer review required.")


if __name__ == "__main__":
    main()
