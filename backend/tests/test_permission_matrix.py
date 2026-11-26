"""Guard: every permission a route demands must be granted to at least one role.

`require("content:write")` guarded the three publication-import endpoints while no
role in PERMS held that string. Super admins reach it through the "*" wildcard, so
the endpoint silently became super-admin-only, and the admin sidebar kept showing
"Import papers" to editors and contributors — a dead end for real operators.
This test makes that class of typo impossible to merge.
"""

from lib.auth import PERMS
from server import app

_ROUTERS_DIR = None


def _walk_routes(routes):
    """Yield every APIRoute, descending into mounted sub-apps."""
    for route in routes:
        sub = getattr(route, "app", None)
        if sub is not None and hasattr(sub, "routes"):
            yield from _walk_routes(sub.routes)
            continue
        # FastAPI >=0.116 keeps `include_router` results in a lazy `_IncludedRouter`.
        original = getattr(route, "original_router", None)
        if original is not None and hasattr(original, "routes"):
            yield from _walk_routes(original.routes)
            continue
        yield route


def _required_permissions():
    found = {}
    pending_guards = []
    for route in _walk_routes(app.routes):
        dependant = getattr(route, "dependant", None)
        if dependant is None:
            continue
        pending_guards.append((route, dependant))
    for route, dependant in pending_guards:
        stack = list(getattr(dependant, "dependencies", None) or [])
        while stack:
            dep = stack.pop()
            perm = getattr(getattr(dep, "call", None), "permission", None)
            if perm:
                found.setdefault(perm, []).append(getattr(route, "path", "?"))
            stack.extend(getattr(dep, "dependencies", None) or [])
    return found


def _explicitly_granted():
    granted = set()
    for perms in PERMS.values():
        granted |= {p for p in perms if p != "*"}
    return granted


def test_route_guard_introspection_reaches_the_api():
    assert _required_permissions(), "no guarded routes discovered - the route walker broke"


# Endpoints only a super admin should ever reach. They are guarded by a permission no other
# role holds, which is deliberate - and the admin sidebar already hides them from everyone
# else. Anything outside this set that no role holds is a typo, not a policy.
SUPER_ADMIN_ONLY = {"users:manage", "outbox:read"}


def test_no_route_requires_an_orphan_permission():
    granted = _explicitly_granted()
    orphans = {p: paths for p, paths in _required_permissions().items() if p not in granted}
    unexpected = {p: paths for p, paths in orphans.items() if p not in SUPER_ADMIN_ONLY}
    assert unexpected == {}, f"permissions required by routes but granted to no role: {sorted(unexpected)}"


def test_super_admin_only_allowlist_entries_are_still_used():
    used = set(_required_permissions())
    stale = SUPER_ADMIN_ONLY - used
    assert stale == set(), f"allowlisted permissions no route uses any more: {sorted(stale)}"


def test_publication_import_is_open_to_editors_and_contributors():
    granted = _required_permissions()
    import_guards = {p for p, paths in granted.items()
                     if any("/publications/import" in path for path in paths)}
    assert import_guards, "publication import route carries no permission guard"
    for perm in import_guards:
        assert "content:create" == perm
    assert "content:create" in PERMS["editor"]
    assert "content:create" in PERMS["contributor"]
    assert "registrations:read" not in PERMS["viewer"]
