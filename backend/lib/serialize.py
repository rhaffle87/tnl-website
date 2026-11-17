"""Convert Mongo docs to JSON-safe dicts: datetimes → ISO strings, ObjectIds → str,
drop underscore-prefixed internal keys."""

import datetime

from bson import ObjectId


def jsonable(node):
    if isinstance(node, dict):
        return {str(k): jsonable(v) for k, v in node.items() if not str(k).startswith("_")}
    if isinstance(node, (list, tuple)):
        return [jsonable(v) for v in node]
    if isinstance(node, datetime.datetime):
        return node.isoformat()
    if isinstance(node, ObjectId):
        return str(node)
    return node
