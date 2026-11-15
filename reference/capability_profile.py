"""Fail-closed proposed capability profile validator (host metadata only)."""
import re

_NAME = re.compile("[a-z][a-z0-9_]{0,63}", re.ASCII)
_SHA40 = re.compile("[0-9a-f]{40}", re.ASCII)
_SHA64 = re.compile("[0-9a-f]{64}", re.ASCII)
_STATUS = {"unsupported", "unverified", "verified"}


class ProfileError(ValueError):
    pass


def _name(value):
    return type(value) is str and _NAME.fullmatch(value) is not None


def validate_profile(profile):
    """Validate a proposed report; does not independently verify a digest."""
    if type(profile) is not dict or set(profile) != {
        "schema_version", "backend", "target", "capabilities"
    }:
        raise ProfileError("unexpected profile fields")
    if type(profile["schema_version"]) is not int or profile["schema_version"] != 1:
        raise ProfileError("unsupported profile version")
    if not _name(profile["backend"]) or not _name(profile["target"]):
        raise ProfileError("invalid backend or target name")
    features = profile["capabilities"]
    if type(features) is not dict or not 1 <= len(features) <= 128:
        raise ProfileError("capabilities must be a nonempty bounded map")
    for name, item in features.items():
        if not _name(name) or type(item) is not dict or set(item) != {
            "status", "source_sha", "evidence_sha256", "executed_cases"
        }:
            raise ProfileError("invalid feature record")
        status = item["status"]
        if type(status) is not str or status not in _STATUS:
            raise ProfileError("invalid verification status")
        if status == "verified":
            if (type(item["source_sha"]) is not str
                or not _SHA40.fullmatch(item["source_sha"])
                or type(item["evidence_sha256"]) is not str
                or not _SHA64.fullmatch(item["evidence_sha256"])
                or type(item["executed_cases"]) is not int
                or not 1 <= item["executed_cases"] <= 100000):
                raise ProfileError("verified status needs exact execution metadata")
        elif (item["source_sha"] is not None or
              item["evidence_sha256"] is not None or
              item["executed_cases"] != 0 or
              type(item["executed_cases"]) is not int):
            raise ProfileError("unverified/unsupported cannot carry success metadata")
    return profile
