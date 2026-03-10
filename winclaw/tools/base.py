"""
Base class for agent tools.
tool call format reference:
https://developers.openai.com/api/docs/guides/function-calling

tool call json schema format example:
```json
{
  "type": "function",
  "name": "get_weather",
  "description": "Retrieves current weather for the given location.",
  "parameters": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City and country e.g. Bogotá, Colombia"
      },
      "units": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"],
        "description": "Units the temperature will be returned in."
      }
    },
    "required": ["location", "units"],
    "additionalProperties": false
  },
  "strict": true
}
```
"""

from abc import ABC, abstractmethod
from typing import Any


class Tool(ABC):
    """
    Abstract base class for agent tools.

    Tools are capabilities that the agent can use to interact with
    the environment, such as reading files, executing commands, etc.
    """

    _TYPE_MAP = {
        "string": str,
        "integer": int,
        "number": (int, float),
        "boolean": bool,
        "array": list,
        "object": dict,
    }

    @property
    @abstractmethod
    def name(self) -> str:
        """Tool name used in function calls."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Description of what the tool does."""
        pass

    @property
    @abstractmethod
    def parameters(self) -> dict[str, Any]:
        """JSON Schema for tool parameters."""
        pass

    @abstractmethod
    async def execute(self, **kwargs: Any) -> str:
        """
        Execute the tool with given parameters.

        Args:
            **kwargs: Tool-specific parameters.

        Returns:
            String result of the tool execution.
        """
        pass

    def cast_params(self, params: dict[str, Any]) -> dict[str, Any]:
        """Apply safe schema-driven casts before validation."""
        schema = self.parameters or {}
        if schema.get("type", "object") != "object":
            return params

        return self._cast_object(params, schema)

    def _cast_object(self, obj: Any, schema: dict[str, Any]) -> dict[str, Any]:
        """Cast an object (dict) according to schema."""
        if not isinstance(obj, dict):
            return obj

        props = schema.get("properties", {})
        result = {}

        for key, value in obj.items():
            if key in props:
                result[key] = self._cast_value(value, props[key])
            else:
                result[key] = value

        return result

    def _cast_value(self, val: Any, schema: dict[str, Any]) -> Any:
        """Cast a single value according to schema."""
        target_type = schema.get("type")

        if target_type == "boolean" and isinstance(val, bool):
            return val
        if target_type == "integer" and isinstance(val, int) and not isinstance(val, bool):
            return val
        if target_type in self._TYPE_MAP and target_type not in (
            "boolean",
            "integer",
            "array",
            "object",
        ):
            expected = self._TYPE_MAP[target_type]
            if isinstance(val, expected):
                return val

        if target_type == "integer" and isinstance(val, str):
            try:
                return int(val)
            except ValueError:
                return val

        if target_type == "number" and isinstance(val, str):
            try:
                return float(val)
            except ValueError:
                return val

        if target_type == "string":
            return val if val is None else str(val)

        if target_type == "boolean" and isinstance(val, str):
            val_lower = val.lower()
            if val_lower in ("true", "1", "yes"):
                return True
            if val_lower in ("false", "0", "no"):
                return False
            return val

        if target_type == "array" and isinstance(val, list):
            item_schema = schema.get("items")
            return [self._cast_value(item, item_schema) for item in val] if item_schema else val

        if target_type == "object" and isinstance(val, dict):
            return self._cast_object(val, schema)

        return val

    def validate_params(self, params: dict[str, Any]) -> list[str]:
        """Validate tool parameters against JSON schema. Returns error list (empty if valid)."""
        if not isinstance(params, dict):
            return [f"parameters must be an object, got {type(params).__name__}"]
        schema = self.parameters or {}
        if schema.get("type", "object") != "object":
            raise ValueError(f"Schema must be object type, got {schema.get('type')!r}")
        return self._validate(params, {**schema, "type": "object"}, "")

    @staticmethod
    def _describe_value(val: Any) -> str:
        """Return a compact value description for validation errors."""
        return f"{type(val).__name__} ({val!r})"

    def _validate(self, val: Any, schema: dict[str, Any], path: str) -> list[str]:
        t = schema.get("type")
        label = path or "parameter"
        value_desc = self._describe_value(val)

        if t == "integer":
            if not isinstance(val, int) or isinstance(val, bool):
                return [f"{label} should be integer, got {value_desc}"]
        elif t == "number":
            if not isinstance(val, self._TYPE_MAP[t]) or isinstance(val, bool):
                return [f"{label} should be number, got {value_desc}"]
        elif t in self._TYPE_MAP and not isinstance(val, self._TYPE_MAP[t]):
            return [f"{label} should be {t}, got {value_desc}"]

        errors: list[str] = []
        if "enum" in schema and val not in schema["enum"]:
            errors.append(
                f"{label} must be one of {schema['enum']}, got {value_desc}"
            )
        if t in ("integer", "number"):
            if "minimum" in schema and val < schema["minimum"]:
                errors.append(
                    f"{label} must be >= {schema['minimum']}, got {val!r}"
                )
            if "maximum" in schema and val > schema["maximum"]:
                errors.append(
                    f"{label} must be <= {schema['maximum']}, got {val!r}"
                )
        if t == "string":
            if "minLength" in schema and len(val) < schema["minLength"]:
                errors.append(
                    f"{label} must be at least {schema['minLength']} chars, got {len(val)}"
                )
            if "maxLength" in schema and len(val) > schema["maxLength"]:
                errors.append(
                    f"{label} must be at most {schema['maxLength']} chars, got {len(val)}"
                )
        if t == "object":
            props = schema.get("properties", {})
            additional_props = schema.get("additionalProperties", True)
            strict = schema.get("strict", False)
            for k in schema.get("required", []):
                if k not in val:
                    errors.append(f"missing required {path + '.' + k if path else k}")
            for k, v in val.items():
                if k in props:
                    errors.extend(self._validate(v, props[k], path + "." + k if path else k))
                elif additional_props is False or strict:
                    errors.append(f"unexpected parameter {path + '.' + k if path else k}")
                elif isinstance(additional_props, dict):
                    errors.extend(
                        self._validate(
                            v,
                            additional_props,
                            path + "." + k if path else k,
                        )
                    )
        if t == "array" and "items" in schema:
            if "minItems" in schema and len(val) < schema["minItems"]:
                errors.append(
                    f"{label} must contain at least {schema['minItems']} items, got {len(val)}"
                )
            if "maxItems" in schema and len(val) > schema["maxItems"]:
                errors.append(
                    f"{label} must contain at most {schema['maxItems']} items, got {len(val)}"
                )
            for i, item in enumerate(val):
                errors.extend(
                    self._validate(item, schema["items"], f"{path}[{i}]" if path else f"[{i}]")
                )
        return errors

    def to_schema(self) -> dict[str, Any]:
        """Convert tool to OpenAI function schema format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }
