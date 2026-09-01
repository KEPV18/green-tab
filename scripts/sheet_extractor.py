#!/usr/bin/env python3
"""
Green Tab — Google Sheet Browser Extractor (v2)

Extracts data from EXACTLY TWO tabs in the restricted Google Sheet:
1. "Team Scores" (gid=87009911) → team_metrics
2. "KSCAT Calc" (gid=758073782) → kscat_data

NO other tabs are used. NO fallbacks to Sheet19, Tab 0, Bamboo ID, etc.

Architecture:
    Start/reuse persistent Chromium profile
        ↓
    Verify existing Google authentication
        ↓
    Download CSV from Team Scores tab
        ↓
    Download CSV from KSCAT Calc tab
        ↓
    Return raw CSV text for each source

Usage:
    from sheet_extractor import SheetExtractor, ExtractionResult, interactive_login

    extractor = SheetExtractor(profile_dir="/path/to/profile")
    result = extractor.extract()
    if result.success:
        print(f"Team Scores: {len(result.team_scores_csv)} chars")
        print(f"KSCAT Calc:  {len(result.kscat_calc_csv)} chars")
"""

import json
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ── Config ──────────────────────────────────────────────────────────────────────

SHEET_ID = "1w_mLKr2d1VgduPY0iGqdZ6lv1fQhOGUQIL-h67lGxqE"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit"

# ONLY ONE DATA SOURCE — the new Performance Dashboard sheet
DASHBOARD_GID = "1"

DASHBOARD_CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={DASHBOARD_GID}"

DASHBOARD_TAB_NAME = "Dashboard"

# Legacy GIDs (kept for backward compat, no longer fetched)
TEAM_SCORES_GID = "1"
KSCAT_CALC_GID = "1"

DEFAULT_PROFILE_DIR = Path.home() / ".config" / "green-tab" / "browser-profile"
SCREENSHOT_DIR = Path("/tmp/green-tab-screenshots")


# ── Data Classes ────────────────────────────────────────────────────────────────

@dataclass
class ExtractionResult:
    """Result of a sheet extraction attempt."""
    success: bool = False
    team_scores_csv: str = ""       # Raw CSV from Team Scores tab
    kscat_calc_csv: str = ""        # Raw CSV from KSCAT Calc tab
    sheet_title: str = ""           # e.g., "Aug - 26 - Google Sheets"
    error: str = ""
    details: dict[str, Any] = field(default_factory=dict)


# ── Browser Process Management ──────────────────────────────────────────────────

def _find_green_tab_browser_pid() -> int | None:
    """Find a running Chromium process using the green-tab profile, if any."""
    import subprocess
    try:
        result = subprocess.run(
            ["pgrep", "-f", "green-tab/browser-profile"],
            capture_output=True, text=True, timeout=5,
        )
        pids = result.stdout.strip().split("\n")
        for pid_str in pids:
            pid_str = pid_str.strip()
            if pid_str.isdigit():
                return int(pid_str)
    except Exception:
        pass
    return None


def _is_stale_lock(lock: Path) -> bool:
    """Check if a lock file is stale (referenced process no longer running)."""
    try:
        target = os.readlink(str(lock))
        parts = target.rsplit("-", 1)
        if len(parts) == 2 and parts[1].isdigit():
            pid = int(parts[1])
            os.kill(pid, 0)  # Raises OSError if process doesn't exist
            return False  # Process exists, lock is valid
    except (OSError, ValueError):
        return True  # Stale lock or can't determine
    return False


def _clean_stale_locks(profile_dir: Path) -> None:
    """Remove stale lock files only if no browser is using the profile."""
    if _find_green_tab_browser_pid() is not None:
        return  # Browser is running — don't touch locks

    for lock_name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        lock = profile_dir / lock_name
        if lock.exists():
            if lock_name == "SingletonLock" and not _is_stale_lock(lock):
                continue  # Valid lock
            try:
                lock.unlink()
            except OSError:
                pass


# ── Main Extractor ──────────────────────────────────────────────────────────────

class SheetExtractor:
    """
    Extracts data from EXACTLY TWO tabs in the restricted Google Sheet
    using an authenticated Chromium browser profile.
    NEVER accesses, decrypts, or exports authentication cookies or session tokens.
    """

    def __init__(
        self,
        profile_dir: Path | str | None = None,
        headless: bool = True,
        timeout_ms: int = 30000,
        screenshot_on_failure: bool = True,
    ):
        self.profile_dir = Path(profile_dir) if profile_dir else DEFAULT_PROFILE_DIR
        self.headless = headless
        self.timeout_ms = timeout_ms
        self.screenshot_on_failure = screenshot_on_failure
        self._context = None
        self._playwright = None

    def extract(self) -> ExtractionResult:
        """Main extraction flow. Returns ExtractionResult with raw CSV text from both sources."""
        if not self.profile_dir.exists():
            return ExtractionResult(
                success=False,
                error=f"Browser profile not found at {self.profile_dir}. Run --login first.",
            )

        _clean_stale_locks(self.profile_dir)

        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            return ExtractionResult(
                success=False,
                error="Playwright not installed. Run: pip install playwright && playwright install chromium",
            )

        result = ExtractionResult()

        try:
            with sync_playwright() as p:
                self._playwright = p

                os.environ.setdefault("WAYLAND_DISPLAY", "wayland-0")
                os.environ.setdefault("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")

                self._context = p.chromium.launch_persistent_context(
                    user_data_dir=str(self.profile_dir),
                    headless=self.headless,
                    channel="chromium",
                    args=[
                        "--disable-blink-features=AutomationControlled",
                        "--no-first-run",
                        "--disable-extensions",
                        "--no-default-browser-check",
                        "--disable-gpu",
                    ],
                    accept_downloads=True,
                )

                try:
                    result = self._navigate_and_extract()
                finally:
                    try:
                        self._context.close()
                    except Exception:
                        pass
                    self._context = None

        except Exception as e:
            result.error = f"Browser error: {e}"
            result.success = False

        finally:
            self._playwright = None

        return result

    def _navigate_and_extract(self) -> ExtractionResult:
        """Navigate to the sheet, verify auth, and download CSV from both tabs."""
        result = ExtractionResult()
        page = self._context.new_page()

        try:
            # ── Step 1: Navigate to verify auth ──
            page.goto(
                f"{SHEET_URL}?gid={TEAM_SCORES_GID}#gid={TEAM_SCORES_GID}",
                wait_until="domcontentloaded",
                timeout=self.timeout_ms,
            )
            page.wait_for_timeout(6000)

            # ── Step 2: Verify authentication ──
            current_url = page.url
            title = page.title()

            if "accounts.google.com" in current_url or "Sign in" in title:
                result.error = (
                    "Google session expired. Re-authentication required. "
                    "Run with --login to sign in manually."
                )
                result.details["url"] = current_url
                if self.screenshot_on_failure:
                    self._save_screenshot(page, "auth_failed")
                page.close()
                return result

            result.sheet_title = title

            # ── Step 3: Download Team Scores CSV ──
            print(f"[extractor] Downloading Team Scores CSV (gid={TEAM_SCORES_GID})...")
            ts_csv = self._download_csv(TEAM_SCORES_CSV_URL, "Team Scores")
            if ts_csv is None:
                result.error = f"Failed to download Team Scores CSV. See logs above."
                page.close()
                return result

            result.team_scores_csv = ts_csv
            result.details["team_scores_chars"] = len(ts_csv)
            print(f"[extractor] ✅ Team Scores: {len(ts_csv)} chars")

            # ── Step 4: Download KSCAT Calc CSV ──
            print(f"[extractor] Downloading KSCAT Calc CSV (gid={KSCAT_CALC_GID})...")
            kc_csv = self._download_csv(KSCAT_CALC_CSV_URL, "KSCAT Calc")
            if kc_csv is None:
                result.error = f"Failed to download KSCAT Calc CSV. See logs above."
                page.close()
                return result

            result.kscat_calc_csv = kc_csv
            result.details["kscat_calc_chars"] = len(kc_csv)
            print(f"[extractor] ✅ KSCAT Calc: {len(kc_csv)} chars")

            result.success = True
            page.close()
            return result

        except Exception as e:
            result.error = f"Extraction error: {e}"
            if self.screenshot_on_failure and self._context:
                try:
                    self._save_screenshot(page, f"exception_{type(e).__name__}")
                except Exception:
                    pass
            return result
        finally:
            try:
                page.close()
            except Exception:
                pass

    def _download_csv(self, url: str, label: str) -> str | None:
        """
        Download CSV from the given export URL using a new page context.
        Returns the CSV text content, or None on failure.
        """
        if not self._context:
            return None

        dl_page = self._context.new_page()
        try:
            with dl_page.expect_download(timeout=30000) as dl_info:
                try:
                    dl_page.goto(url, timeout=30000)
                except Exception as goto_err:
                    if "Download is starting" not in str(goto_err) and "Download" not in str(goto_err):
                        raise goto_err

            download = dl_info.value
            tmp_path = f"/tmp/green-tab-{label.replace(' ', '-').lower()}-{int(time.time())}.csv"
            download.save_as(tmp_path)

            content = Path(tmp_path).read_text(encoding="utf-8")

            # Clean up temp file
            try:
                Path(tmp_path).unlink()
            except Exception:
                pass

            # Validate content
            if not content or len(content) < 50:
                print(f"[extractor] ❌ {label} CSV is too small ({len(content)} chars)")
                return None

            if "accounts.google.com" in content[:500] or "Sign in" in content[:500]:
                print(f"[extractor] ❌ {label} CSV returned a login page — session expired")
                return None

            if "<!DOCTYPE" in content[:100] or "<html" in content[:100].lower():
                print(f"[extractor] ❌ {label} CSV returned HTML, not CSV")
                return None

            return content

        except Exception as e:
            print(f"[extractor] ❌ {label} CSV download failed: {e}")
            return None
        finally:
            try:
                dl_page.close()
            except Exception:
                pass

    def _save_screenshot(self, page, label: str) -> Path | None:
        """Save a screenshot for debugging. Never includes auth secrets."""
        try:
            SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
            timestamp = time.strftime("%Y%m%d-%H%M%S")
            path = SCREENSHOT_DIR / f"green-tab-{label}-{timestamp}.png"
            page.screenshot(path=str(path), full_page=False)
            return path
        except Exception:
            return None


# ── Interactive Login ────────────────────────────────────────────────────────────

def interactive_login() -> dict[str, Any] | None:
    """
    ONE-TIME ONLY: Open browser for user to manually sign in.
    NEVER called automatically. NEVER retries.
    """
    from playwright.sync_api import sync_playwright

    profile_dir = DEFAULT_PROFILE_DIR
    profile_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("  Green Tab — Google Sheet Login")
    print()
    print("  IMPORTANT: This is a ONE-TIME login.")
    print("  Sign in with your WORK Google account MANUALLY.")
    print("  After signing in, the sheet will load automatically.")
    print("  Then press ENTER here to save the session.")
    print("=" * 60)
    print()

    os.environ.setdefault("WAYLAND_DISPLAY", "wayland-0")
    os.environ.setdefault("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=False,
            channel="chromium",
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--disable-extensions",
                "--no-default-browser-check",
            ],
            accept_downloads=True,
        )

        context.grant_permissions(
            ["clipboard-read", "clipboard-write"],
            origin="https://docs.google.com",
        )

        page = context.pages[0] if context.pages else context.new_page()

        print("[login] Opening Google Sheet in browser...")
        page.goto(
            f"{SHEET_URL}?gid={TEAM_SCORES_GID}#gid={TEAM_SCORES_GID}",
            wait_until="domcontentloaded",
            timeout=120000,
        )

        needs_login = "accounts.google.com" in page.url

        if needs_login:
            print()
            print("  Google login page detected.")
            print("  Sign in with your WORK account.")
            print()
        else:
            print("[login] Sheet loaded! You're already authenticated.")

        print()
        print("  >>> Press ENTER when you can see the sheet data in the browser <<<")
        input()

        # Quick verification
        extractor = SheetExtractor(profile_dir=profile_dir, headless=False)
        test_result = extractor.extract()

        context.close()

        result = {
            "loginAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "profileDir": str(profile_dir),
            "verified": test_result.success,
        }

        if test_result.success:
            print(f"[login] ✅ Verified! Both data sources accessible.")
            print(f"[login] Profile saved to: {profile_dir}")
        else:
            print(f"[login] ⚠️  Could not verify: {test_result.error}")
            print(f"[login] Try running fetch_team_data.py again later.")

        return result