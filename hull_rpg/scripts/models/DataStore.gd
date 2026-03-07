extends Node
class_name DataStore

static func load_json(path: String, root_key: String) -> Array:
	if not FileAccess.file_exists(path):
		push_error("Missing data file: %s" % path)
		return []
	var txt := FileAccess.get_file_as_string(path)
	var parsed = JSON.parse_string(txt)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("JSON root is not object: %s" % path)
		return []
	var dict: Dictionary = parsed
	if not dict.has(root_key):
		push_error("Missing root key %s in %s" % [root_key, path])
		return []
	return dict[root_key]
