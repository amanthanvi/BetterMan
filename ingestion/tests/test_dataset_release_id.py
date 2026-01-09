from ingestion.ingest_runner import _build_dataset_release_id


def test_dataset_release_id_includes_distro() -> None:
    rid = _build_dataset_release_id(git_sha="abc123", mandoc_version="1.2.3", distro="debian")
    assert "+debian+abc123+mandoc:1.2.3" in rid
