"""Unit tests for application settings (``app/config.py``).

The shared conftest points ``PI_METER_SESSIONS_DIR``/``DB_PATH``/``FRONTEND_DIST``
at this test's ``tmp_path`` before every test, so nothing here can reach the real
``~/.pi`` directory or ``data/pi-meter.sqlite``. Environment overrides are added
through the ``make_settings`` fixture and removed again by ``monkeypatch``.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app import config
from app.config import (
    ANY_HOST,
    LOOPBACK_HOSTS,
    REPO_ROOT,
    Settings,
    get_settings,
    is_bindable_host,
)


# --------------------------------------------------------------------------- #
# Defaults and isolation
# --------------------------------------------------------------------------- #


def test_defaults_match_the_documented_contract(settings):
    assert settings.host == "127.0.0.1"
    assert settings.port == 8787
    assert settings.log_level == "WARNING"
    assert settings.sync_on_startup is False
    assert settings.max_parse_warnings == 50
    assert settings.entry_insert_batch == 1000
    assert settings.sync_run_retention == 100
    assert settings.entries_page_size == 200
    assert settings.entries_page_max == 500
    assert settings.sessions_page_size == 25
    assert settings.dev_cors_origin is None


def test_paths_default_to_repository_relative_locations(make_settings):
    # Clear the conftest-owned environment overrides to reach the built-in defaults.
    fresh = make_settings(SESSIONS_DIR=None, DB_PATH=None, FRONTEND_DIST=None)

    assert fresh.sessions_dir == (Path.home() / ".pi" / "agent" / "sessions").resolve()
    assert fresh.db_path == REPO_ROOT / "data" / "pi-meter.sqlite"
    assert fresh.frontend_dist == REPO_ROOT / "frontend" / "dist"


def test_settings_never_point_at_real_session_data(settings):
    assert settings.sessions_dir.is_relative_to(Path(settings.sessions_dir.anchor))
    assert "agent" not in str(settings.sessions_dir).split("/")
    assert settings.db_path.name == "pi-meter.sqlite"


def test_database_url_uses_sqlite_driver(settings):
    assert settings.database_url == f"sqlite+pysqlite:///{settings.db_path}"
    assert settings.database_url.startswith("sqlite+pysqlite:////")


# --------------------------------------------------------------------------- #
# Environment prefix
# --------------------------------------------------------------------------- #


def test_environment_prefix_binds_prefixed_variables(make_settings):
    configured = make_settings(port=9123, log_level="debug", sessions_page_size=50)

    assert configured.port == 9123
    assert configured.log_level == "DEBUG"
    assert configured.sessions_page_size == 50


def test_unprefixed_environment_variables_are_ignored(make_settings, monkeypatch):
    monkeypatch.setenv("PORT", "1111")
    monkeypatch.setenv("HOST", "127.0.0.1")

    configured = make_settings()

    assert configured.port == 8787
    assert configured.host == "127.0.0.1"


def test_unknown_prefixed_variables_are_ignored(make_settings, monkeypatch):
    monkeypatch.setenv("PI_METER_NOT_A_REAL_SETTING", "whatever")

    configured = make_settings()

    assert not hasattr(configured, "not_a_real_setting")


def test_env_file_is_loaded_and_environment_takes_precedence(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "PI_METER_PORT=9999\nPI_METER_LOG_LEVEL=debug\nPI_METER_SESSIONS_PAGE_SIZE=7\n",
        encoding="utf-8",
    )

    from_file = Settings(_env_file=env_file)
    assert from_file.port == 9999
    assert from_file.sessions_page_size == 7

    # Real environment variables win over the .env file (conftest sets WARNING).
    assert from_file.log_level == "WARNING"

    monkeypatch.setenv("PI_METER_PORT", "8001")
    assert Settings(_env_file=env_file).port == 8001


def test_env_file_configuration_is_standard():
    assert Settings.model_config["env_prefix"] == "PI_METER_"
    assert Settings.model_config["env_file"] == ".env"
    assert Settings.model_config["extra"] == "ignore"


# --------------------------------------------------------------------------- #
# Path normalization
# --------------------------------------------------------------------------- #


def test_tilde_paths_are_expanded(tmp_path):
    configured = Settings(_env_file=None, sessions_dir="~/pi-meter-test-sessions")

    assert configured.sessions_dir == (Path.home() / "pi-meter-test-sessions").resolve()
    assert "~" not in str(configured.sessions_dir)


def test_relative_paths_resolve_against_repository_root_not_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    configured = Settings(_env_file=None, db_path="data/relative.sqlite", frontend_dist="build/dist")

    assert configured.db_path == (REPO_ROOT / "data" / "relative.sqlite").resolve()
    assert configured.frontend_dist == (REPO_ROOT / "build" / "dist").resolve()
    assert tmp_path not in configured.db_path.parents


def test_absolute_paths_are_kept_and_resolved(tmp_path):
    nested = tmp_path / "a" / ".." / "b"

    configured = Settings(_env_file=None, db_path=tmp_path / "x.sqlite", sessions_dir=nested)

    assert configured.db_path == tmp_path / "x.sqlite"
    assert configured.sessions_dir == (tmp_path / "b").resolve()


def test_path_accepts_string_and_path_inputs(tmp_path):
    from_string = Settings(_env_file=None, sessions_dir=str(tmp_path / "s"))
    from_path = Settings(_env_file=None, sessions_dir=tmp_path / "s")

    assert from_string.sessions_dir == from_path.sessions_dir == (tmp_path / "s").resolve()


def test_database_url_follows_normalized_path(tmp_path):
    configured = Settings(_env_file=None, db_path=str(tmp_path / "db.sqlite"))

    assert configured.database_url == f"sqlite+pysqlite:///{configured.db_path}"


# --------------------------------------------------------------------------- #
# Numeric bounds
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("port", [1, 80, 8787, 65_535])
def test_port_accepts_valid_range(port):
    assert Settings(_env_file=None, port=port).port == port


@pytest.mark.parametrize("port", [0, -1, 65_536, 100_000])
def test_port_rejects_out_of_range_values(port):
    with pytest.raises(ValidationError, match="port"):
        Settings(_env_file=None, port=port)


@pytest.mark.parametrize("port", ["not-a-port", "87.5", ""])
def test_port_rejects_non_numeric_values(port):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, port=port)


@pytest.mark.parametrize(
    ("field", "minimum"),
    [
        ("max_parse_warnings", 0),
        ("entry_insert_batch", 1),
        ("sync_run_retention", 1),
        ("entries_page_size", 1),
        ("entries_page_max", 1),
        ("sessions_page_size", 1),
    ],
)
def test_numeric_floor_bounds(field, minimum):
    assert getattr(Settings(_env_file=None, **{field: minimum}), field) == minimum

    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{field: minimum - 1})


def test_numeric_bounds_apply_to_environment_overrides(make_settings):
    assert make_settings(max_parse_warnings=0).max_parse_warnings == 0

    with pytest.raises(ValidationError):
        make_settings(entry_insert_batch=0)


# --------------------------------------------------------------------------- #
# Host validation
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("host", sorted(LOOPBACK_HOSTS))
def test_loopback_hosts_are_allowed(host):
    assert Settings(_env_file=None, host=host).host == host
    assert is_bindable_host(host) is True


@pytest.mark.parametrize("host", sorted(ANY_HOST))
def test_any_address_wildcards_are_allowed(host):
    assert Settings(_env_file=None, host=host).host == host


@pytest.mark.parametrize(
    "host",
    ["100.64.0.1", "100.100.100.100", "100.127.255.254"],
)
def test_tailnet_addresses_are_allowed(host):
    assert Settings(_env_file=None, host=host).host == host
    assert is_bindable_host(host) is True


@pytest.mark.parametrize(
    "host",
    ["10.0.0.5", "192.168.1.10", "8.8.8.8", "100.63.255.255", "100.128.0.1", "example.com"],
)
def test_non_loopback_non_tailnet_hosts_are_rejected(host):
    assert is_bindable_host(host) is False

    with pytest.raises(ValidationError, match="host must be loopback"):
        Settings(_env_file=None, host=host)


def test_host_is_normalized_and_whitespace_tolerated():
    assert Settings(_env_file=None, host=" LOCALHOST ").host == "localhost"
    assert Settings(_env_file=None, host="::1").host == "::1"


@pytest.mark.parametrize("host", ["", "   ", "localhost:8787"])
def test_empty_or_malformed_hosts_are_rejected(host):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, host=host)


# --------------------------------------------------------------------------- #
# Other normalizers
# --------------------------------------------------------------------------- #


def test_log_level_is_upper_cased_and_stripped():
    assert Settings(_env_file=None, log_level="debug").log_level == "DEBUG"
    assert Settings(_env_file=None, log_level=" Warning ").log_level == "WARNING"
    assert Settings(_env_file=None, log_level="info").log_level == "INFO"


def test_booleans_parse_from_environment_strings(make_settings):
    assert make_settings(sync_on_startup="true").sync_on_startup is True
    assert make_settings(sync_on_startup="0").sync_on_startup is False


def test_dev_cors_origin_is_optional(make_settings, monkeypatch):
    assert make_settings(dev_cors_origin="http://localhost:5173").dev_cors_origin == (
        "http://localhost:5173"
    )

    monkeypatch.delenv("PI_METER_DEV_CORS_ORIGIN", raising=False)
    assert make_settings().dev_cors_origin is None


# --------------------------------------------------------------------------- #
# Cached settings
# --------------------------------------------------------------------------- #


def test_get_settings_is_cached_until_cleared(make_settings):
    first = get_settings()
    assert get_settings() is first

    updated = make_settings(port=9000)
    assert updated is not first
    assert get_settings().port == 9000


def test_cache_clear_picks_up_new_environment(make_settings, monkeypatch):
    assert get_settings().port == 8787

    monkeypatch.setenv("PI_METER_PORT", "9555")
    assert get_settings().port == 8787  # still cached

    get_settings.cache_clear()
    assert get_settings().port == 9555


def test_repository_constants_and_helpers_are_documented():
    assert REPO_ROOT == Path(config.__file__).resolve().parents[1]
    assert REPO_ROOT.is_dir()
    assert LOOPBACK_HOSTS == {"127.0.0.1", "::1", "localhost"}
    assert "0.0.0.0" in ANY_HOST and "::" in ANY_HOST
    assert config.TAILNET_NETWORK.version == 4
    assert str(config.TAILNET_NETWORK) == "100.64.0.0/10"
