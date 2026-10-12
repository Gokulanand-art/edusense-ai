import re


EMAIL_RE = re.compile(r"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$", re.IGNORECASE)
ROLL_NUMBER_RE = re.compile(r"^[A-Z0-9][A-Z0-9._/-]{2,49}$", re.IGNORECASE)


def sanitize_string(value, *, max_length=255, allow_empty=False):
    cleaned = " ".join(str(value or "").strip().split())
    if not cleaned and not allow_empty:
        raise ValueError("This field is required")
    if len(cleaned) > max_length:
        raise ValueError(f"Value cannot exceed {max_length} characters")
    return cleaned


def validate_required_fields(data, required_fields):
    missing = []

    for field in required_fields:
        value = data.get(field) if isinstance(data, dict) else None
        if value is None or (isinstance(value, str) and value.strip() == ""):
            missing.append(field)

    if missing:
        return False, f"Missing fields: {', '.join(missing)}"

    return True, None


def validate_email(email):
    cleaned = str(email or "").strip().lower()
    if not cleaned or not EMAIL_RE.match(cleaned):
        raise ValueError("Enter a valid email address")
    return cleaned


def validate_password(password):
    value = str(password or "")
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if not re.search(r"[a-z]", value):
        raise ValueError("Password must include at least one lowercase letter")
    if not re.search(r"[A-Z]", value):
        raise ValueError("Password must include at least one uppercase letter")
    if not re.search(r"\d", value):
        raise ValueError("Password must include at least one number")
    return value


def validate_integer_range(value, minimum=None, maximum=None, *, field_name="Value"):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be an integer")

    if minimum is not None and parsed < minimum:
        raise ValueError(f"{field_name} must be at least {minimum}")
    if maximum is not None and parsed > maximum:
        raise ValueError(f"{field_name} must be at most {maximum}")
    return parsed


def validate_float_range(value, minimum=None, maximum=None, *, field_name="Value"):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a number")

    if minimum is not None and parsed < minimum:
        raise ValueError(f"{field_name} must be at least {minimum}")
    if maximum is not None and parsed > maximum:
        raise ValueError(f"{field_name} must be at most {maximum}")
    return parsed


def validate_choice(value, valid_values, *, field_name="Value"):
    normalized = str(value or "").strip()
    if normalized not in valid_values:
        choices = ", ".join(str(item) for item in valid_values)
        raise ValueError(f"{field_name} must be one of: {choices}")
    return normalized


def validate_roll_number(roll_number):
    cleaned = str(roll_number or "").strip().upper()
    if not cleaned:
        raise ValueError("Roll number is required")
    if not ROLL_NUMBER_RE.match(cleaned):
        raise ValueError("Roll number format is invalid")
    return cleaned


class RequestValidator:
    def __init__(self, data):
        self.data = data or {}
        self.errors = []
        self.validated_data = {}

    def required(self, *fields):
        for field in fields:
            val = self.data.get(field)
            if val is None or str(val).strip() == "":
                self.errors.append(f"{field} is required")
            else:
                self.validated_data[field] = val
        return self

    def sanitize(self, field, max_length=255, allow_empty=False):
        if field in self.data:
            try:
                self.validated_data[field] = sanitize_string(
                    self.data.get(field), max_length=max_length, allow_empty=allow_empty
                )
            except ValueError as e:
                self.errors.append(f"{field}: {str(e)}")
        return self

    def email(self, field):
        if self.data.get(field):
            try:
                self.validated_data[field] = validate_email(self.data.get(field))
            except ValueError as e:
                self.errors.append(f"{field}: {str(e)}")
        return self

    def password(self, field):
        if self.data.get(field):
            try:
                self.validated_data[field] = validate_password(self.data.get(field))
            except ValueError as e:
                self.errors.append(f"{field}: {str(e)}")
        return self

    def integer(self, field, min_val=None, max_val=None):
        if self.data.get(field) is not None:
            try:
                self.validated_data[field] = validate_integer_range(
                    self.data.get(field), min_val, max_val, field_name=field
                )
            except ValueError as e:
                self.errors.append(str(e))
        return self

    def float_num(self, field, min_val=None, max_val=None):
        if self.data.get(field) is not None:
            try:
                self.validated_data[field] = validate_float_range(
                    self.data.get(field), min_val, max_val, field_name=field
                )
            except ValueError as e:
                self.errors.append(str(e))
        return self

    def roll_number(self, field):
        if self.data.get(field):
            try:
                self.validated_data[field] = validate_roll_number(self.data.get(field))
            except ValueError as e:
                self.errors.append(f"{field}: {str(e)}")
        return self

    def has_errors(self):
        return len(self.errors) > 0

    def first_error(self):
        return self.errors[0] if self.errors else None
