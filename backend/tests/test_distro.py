from app.core.errors import APIError
from app.datasets.distro import DISTRO_ORDER, SUPPORTED_DISTROS, normalize_distro


def test_normalize_distro_defaults_to_debian() -> None:
    assert normalize_distro(None) == "debian"
    assert normalize_distro("  ARCH  ") == "arch"


def test_supported_distros_are_ordered_explicitly() -> None:
    assert set(SUPPORTED_DISTROS) == set(DISTRO_ORDER)
    assert tuple(DISTRO_ORDER) == (
        "debian",
        "ubuntu",
        "fedora",
        "arch",
        "alpine",
        "freebsd",
        "macos",
    )
    assert DISTRO_ORDER == (
        "debian",
        "ubuntu",
        "fedora",
        "arch",
        "alpine",
        "freebsd",
        "macos",
    )


def test_normalize_distro_rejects_unknown_values() -> None:
    try:
        normalize_distro("solaris")
    except APIError as exc:
        assert exc.status_code == 400
        assert exc.code == "INVALID_DISTRO"
    else:
        raise AssertionError("normalize_distro should reject unknown values")
