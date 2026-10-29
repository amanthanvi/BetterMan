"""B4 policy, source integrity, promotions and bounded sitemap numbering."""

import json
from collections import Counter

import pytest

from ingestion.generated.selector import Candidate, Priority, select
from ingestion.ingest_runner import _build_sitemap_page_map, _PageRef
from ingestion.popularity import PopularityPolicy


def test_popcon_only_thresholds_score_and_section_suffixes():
    policy = PopularityPolicy({"popular": 10_000, "almost": 9_999}, {})
    assert policy.evaluate("api", "3", "popular").indexable
    assert not policy.evaluate("api", "3", "almost").indexable
    assert policy.evaluate("api", "3", "popular:amd64").indexable
    for section in ("1", "1p", "5", "7", "8"):
        assert policy.evaluate("unknown", section).indexable
    for section in ("2", "3", "3pm", "4", "6", "9"):
        assert not policy.evaluate("unknown", section).indexable
    assert policy.evaluate("api", "3", "popular").score == 4000
    assert policy.evaluate("api", "3", "popular").score > policy.evaluate("api", "3").score
    # Non-Debian names get the same exact-name proxy; no fuzzy mapping.
    assert not policy.evaluate("api", "3", "popular-devel").indexable


def test_traffic_promotes_only_matching_routes_and_combines_with_popcon():
    policy = PopularityPolicy({"popular": 10_000}, {("api", "3"): 100, ("low", "3"): 99})
    assert policy.evaluate("API", "3").indexable
    assert not policy.evaluate("api", "2").indexable
    assert not policy.evaluate("low", "3").indexable
    assert policy.evaluate("api", "3", "popular").score == 8009
    assert not PopularityPolicy({}, {}).evaluate("api", "3").indexable


def test_optional_snapshot_normalizes_routes_without_request_or_distro_data(tmp_path, monkeypatch):
    monkeypatch.delenv("BETTERMAN_PLAUSIBLE_COUNTS", raising=False)
    policy = PopularityPolicy.load()
    assert policy.installations["coreutils"] > 10_000
    assert policy.pageviews == {}
    snapshot = tmp_path / "counts.json"
    snapshot.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "generatedAt": "2026-10-29T00:00:00Z",
                "pageviews": {
                    "/man/Foo%3A%3ABar/3pm": 60,
                    "/man/foo::bar/3pm?ref=test": 40,
                    "/search": 999,
                    "/api/v1/man/unused/3": 999,
                },
            }
        )
    )
    monkeypatch.setenv("BETTERMAN_PLAUSIBLE_COUNTS", str(snapshot))
    policy = PopularityPolicy.load()
    assert policy.evaluate("foo::bar", "3pm").indexable
    assert policy.pageviews == {("foo::bar", "3pm"): 100}
    assert policy.provenance()["trafficSha256"]
    assert policy.provenance()["trafficGeneratedAt"] == "2026-10-29T00:00:00Z"
    snapshot.write_text('{"schemaVersion": 1, "pageviews": {"/man/api/3": -1}}')
    with pytest.raises(ValueError, match="count"):
        PopularityPolicy.load()
    snapshot.write_text('{"schemaVersion": 0}')
    with pytest.raises(ValueError, match="snapshot"):
        PopularityPolicy.load()


def test_selector_uses_persisted_tier_and_demand_and_hand_list_cannot_promote():
    candidates = [
        Candidate("cold", "3", "cold", indexable=False, popularity_score=0),
        Candidate("hot", "3", "hot", indexable=True, popularity_score=8000),
        Candidate("ls", "1", "ls", indexable=True, popularity_score=5000),
        Candidate("legacy", "1", "legacy", indexable=False),
    ]
    assert [c.name for c in select(candidates)] == ["hot", "ls"]
    assert [c.name for c in select(candidates, priority=Priority.parse(["cold"]))] == ["hot", "ls"]


def test_115k_page_sitemap_assignment_is_dense_and_long_tail_is_zero():
    policy = PopularityPolicy({}, {})
    refs = [
        _PageRef(str(i), f"page{i:06}", "1" if i % 3 == 0 else "3", None, None)
        for i in range(115_000)
    ]
    mapping = _build_sitemap_page_map(pages=refs, policy=policy)
    sizes = Counter(mapping.values())
    assert sizes == {0: 76_666, 1: 10_000, 2: 10_000, 3: 10_000, 4: 8_334}
    assert len(mapping) == 115_000


def test_metadata_projection_counts_normalized_routes_without_extracting_archives(tmp_path):
    import gzip

    from scripts.report_index_demand import report

    rows = (
        "usr/share/man/man1/tar.1.gz utils/tar\n"
        "usr/share/man/man3/Cold.3.gz libs/cold\n"
        "usr/share/man/man3/hot.3.gz libs/popular\n"
    )
    for filename in ("main-Contents-all.gz", "main-Contents-amd64.gz"):
        with gzip.open(tmp_path / filename, "wt") as output:
            output.write(rows)
    result = report(tmp_path, PopularityPolicy({"popular": 10_000}, {}))
    assert result["curatedExplicitPackages"]["indexable"] == 1
    assert result["fullDebianRoutes"]["routes"] == 3
    assert result["fullDebianRoutes"]["indexable"] == 2
    assert result["projected115kCanonicalIndexable"] == 76_667
