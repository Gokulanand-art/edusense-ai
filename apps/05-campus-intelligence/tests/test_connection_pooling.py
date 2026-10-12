import ast
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVICES_DIR = PROJECT_ROOT / "services"


def _connection_close_calls(path):
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    offenders = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Attribute) or node.func.attr != "close":
            continue
        if isinstance(node.func.value, ast.Name) and "conn" in node.func.value.id.lower():
            offenders.append(f"{path.relative_to(PROJECT_ROOT)}:{node.lineno}")

    return offenders


def test_services_do_not_manually_close_pooled_connections():
    offenders = []

    for path in sorted(SERVICES_DIR.glob("*.py")):
        offenders.extend(_connection_close_calls(path))

    assert offenders == [], (
        "Service functions must return pooled connections through database.get_db_connection(); "
        f"manual connection close calls found at {', '.join(offenders)}"
    )
