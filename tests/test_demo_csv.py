from pathlib import Path


def test_pages_ships_the_canonical_manual_import_sample():
    root = Path(__file__).resolve().parents[1]
    sample = Path("data/manual_import_sample.csv")
    assert (root / "demo" / sample).read_bytes() == (root / sample).read_bytes()
