#!/usr/bin/env python3
"""
Green Tab — Google Sheet Browser Extractor

Extracts team data from a restricted Google Sheet using an existing
authenticated Chromium profile. NO authentication secrets are accessed.

Architecture:
    Start/reuse persistent Chromium profile
        ↓
    Verify existing Google authentication
        ↓
    Open restricted Google Sheet
        ↓
    Explicitly select "Team Scores" tab
        ↓
    Verify selected tab
        ↓
    Try authenticated CSV download (Priority 1)
        ↓
    If CSV fails → clipboard extraction (Priority 2)
        ↓
    Return raw TSV/CSV text

Usage:
    from sheet_extractor import SheetExtractor, ExtractionResult, interactive_login

    extractor = SheetExtractor(profile_dir="/path/to/profile")
    result = extractor.extract()
    if result.success:
        print(f"Got {len(result.raw_text)} chars via {result.method}")
"""

import json
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ── Config ──────────────────────────────────────────────────────────────────────

SHEET_ID = "1O3WHz1gphUvoBLdQlJ9sT5pWBlgrjASwGFpgO-0qRmw"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit"
# gid=87009911 is the "Team Scores" tab — confirmed via tab enumeration
TEAM_SCORES_GID = "87009911"
CSV_EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={TEAM_SCORES_GID}"
TARGET_TAB_NAME = "Team Scores"

DEFAULT_PROFILE_DIR = Path.home() / ".config" / "green-tab" / "browser-profile"
SCREENSHOT_DIR = Path("/tmp/green-tab-screenshots")


# ── Data Classes ────────────────────────────────────────────────────────────────

@dataclass
class ExtractionResult:
    """Result of a sheet extraction attempt."""
    success: bool = False
    raw_text: str = ""
    method: str = ""  # "csv_download" or "clipboard"
    tab_verified: bool = False
    sheet_title: str = ""  # e.g., "Aug - 26 - Google Sheets"
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
    Extracts data from a restricted Google Sheet using an authenticated
    Chromium browser profile. NEVER accesses, decrypts, or exports
    authentication cookies or session tokens.
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
        """Main extraction flow. Returns ExtractionResult with raw text data."""
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
                    self._context.grant_permissions(
                        ["clipboard-read", "clipboard-write"],
                        origin="https://docs.google.com",
                    )
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
        """Navigate to the sheet, verify auth, select tab, and extract data."""
        result = ExtractionResult()
        page = self._context.new_page()

        try:
            # ── Step 1: Navigate to the sheet ──
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

            # Capture sheet title for month detection (e.g., "Aug - 26 - Google Sheets")
            result.sheet_title = title

            # ── Step 3: Select "Team Scores" tab ──
            tab_found = self._select_team_scores_tab(page)
            result.tab_verified = tab_found
            result.details["tab_found"] = tab_found

            if not tab_found:
                # Check if we're already on the right tab by URL gid
                if TEAM_SCORES_GID in page.url:
                    tab_found = True
                    result.details["tab_selection"] = "verified_by_gid"
                    result.tab_verified = True

            # ── Step 4: Try CSV download (Priority 1) ──
            csv_result = self._try_csv_download()
            if csv_result.success:
                result.success = True
                result.raw_text = csv_result.raw_text
                result.method = "csv_download"
                result.details["csv_download"] = "success"
                page.close()
                return result

            result.details["csv_download"] = f"failed: {csv_result.error}"

            # ── Step 5: Clipboard extraction (Priority 2) ──
            # Make sure we're on the right tab first
            if not result.tab_verified:
                tab_found = self._select_team_scores_tab(page)
                result.tab_verified = tab_found

            clip_result = self._try_clipboard_extraction(page)
            if clip_result.success:
                result.success = True
                result.raw_text = clip_result.raw_text
                result.method = "clipboard"
                result.details["clipboard"] = "success"
                page.close()
                return result

            result.error = (
                f"Both CSV download and clipboard extraction failed. "
                f"CSV: {csv_result.error}. Clipboard: {clip_result.error}"
            )
            if self.screenshot_on_failure:
                self._save_screenshot(page, "both_methods_failed")

        except Exception as e:
            result.error = f"Extraction error: {e}"
            if self.screenshot_on_failure and self._context:
                try:
                    self._save_screenshot(page, f"exception_{type(e).__name__}")
                except Exception:
                    pass

        finally:
            try:
                page.close()
            except Exception:
                pass

        return result

    def _select_team_scores_tab(self, page) -> bool:
        """Find and click the 'Team Scores' tab in the Google Sheets UI."""
        selectors = [
            '.docs-sheet-tab-name',
            '[role="tab"]',
        ]

        for selector in selectors:
            try:
                tabs = page.locator(selector).all()
                for tab in tabs:
                    text = tab.inner_text().strip()
                    if TARGET_TAB_NAME.lower() in text.lower():
                        tab.click()
                        page.wait_for_timeout(3000)
                        return True
            except Exception:
                continue

        # Fallback: use JavaScript to find and click
        try:
            found = page.evaluate(f"""() => {{
                const tabs = document.querySelectorAll('.docs-sheet-tab-name, .docs-sheet-tab');
                for (const tab of tabs) {{
                    if (tab.innerText && tab.innerText.toLowerCase().includes('{TARGET_TAB_NAME.lower()}')) {{
                        tab.click();
                        return true;
                    }}
                }}
                return false;
            }}""")
            if found:
                page.wait_for_timeout(3000)
                return True
        except Exception:
            pass

        return False

    def _try_csv_download(self) -> ExtractionResult:
        """
        Priority 1: Download CSV via the export URL using Playwright's
        download handling. The key insight is that navigating to the
        export URL triggers a download event, not a page navigation.
        We use expect_download to catch it.
        """
        result = ExtractionResult()

        if not self._context:
            result.error = "No browser context"
            return result

        download_page = self._context.new_page()

        try:
            with download_page.expect_download(timeout=30000) as download_info:
                # Navigate to the export URL — this triggers a download
                # The goto will raise "Download is starting" which is expected
                # because Playwright intercepts the download event
                try:
                    download_page.goto(CSV_EXPORT_URL, timeout=30000)
                except Exception as goto_err:
                    # "Download is starting" error is expected — the download
                    # is captured by expect_download, not by the navigation
                    if "Download is starting" not in str(goto_err) and "Download" not in str(goto_err):
                        # Unexpected error — re-raise
                        raise goto_err

            download = download_info.value

            # Save to temp file
            tmp_path = f"/tmp/green-tab-export-{int(time.time())}.csv"
            download.save_as(tmp_path)

            content = Path(tmp_path).read_text(encoding="utf-8")

            # Clean up temp file
            try:
                Path(tmp_path).unlink()
            except Exception:
                pass

            # Validate content
            if not content or len(content) < 50:
                result.error = f"Downloaded CSV is too small ({len(content)} chars)"
                return result

            if "accounts.google.com" in content[:500] or "Sign in" in content[:500]:
                result.error = "CSV download returned a login page — session expired"
                return result

            if "<!DOCTYPE" in content[:100] or "<html" in content[:100].lower():
                result.error = "CSV download returned HTML, not CSV"
                return result

            # Validate this is from Team Scores (not Bamboo ID)
            content_lower = content[:2000].lower()
            bamboo_indicators = ["bamboo id", "bamboo_id", "citrix user"]
            score_indicators = ["csat", "productivity", "aht", "fcr"]
            has_bamboo = any(ind in content_lower for ind in bamboo_indicators)
            has_scores = any(ind in content_lower for ind in score_indicators)

            if has_bamboo and not has_scores:
                result.error = "CSV appears to be from 'Bamboo ID' tab, not 'Team Scores'"
                return result

            # SUCCESS
            result.success = True
            result.raw_text = content
            result.method = "csv_download"
            return result

        except Exception as e:
            result.error = f"CSV download failed: {e}"
            return result

        finally:
            try:
                download_page.close()
            except Exception:
                pass

    def _try_clipboard_extraction(self, page) -> ExtractionResult:
        """
        Priority 2: Select all cells on the active tab and copy to clipboard.
        Google Sheets Ctrl+A selects the active sheet's data.
        """
        result = ExtractionResult()

        try:
            # Ensure we're on the sheet page
            if "docs.google.com/spreadsheets" not in page.url:
                page.goto(
                    f"{SHEET_URL}?gid={TEAM_SCORES_GID}#gid={TEAM_SCORES_GID}",
                    wait_until="domcontentloaded",
                    timeout=self.timeout_ms,
                )
                page.wait_for_timeout(5000)

            # Focus the sheet area
            try:
                page.locator('[role="grid"], .grid-container, #grid-container').first.click()
                page.wait_for_timeout(500)
            except Exception:
                page.click("body")
                page.wait_for_timeout(500)

            # Select all and copy
            page.keyboard.press("Control+a")
            page.wait_for_timeout(1000)
            page.keyboard.press("Control+c")
            page.wait_for_timeout(2000)

            # Read clipboard
            clipboard_text = page.evaluate("""async () => {
                try { return await navigator.clipboard.readText(); }
                catch (e) { return 'CLIPBOARD_ERROR: ' + e.message; }
            }""")

            if not clipboard_text:
                result.error = "Clipboard is empty"
                return result

            if clipboard_text.startswith("CLIPBOARD_ERROR:"):
                result.error = f"Clipboard read failed: {clipboard_text}"
                return result

            # Validate
            if "accounts.google.com" in clipboard_text[:500] or "Sign in" in clipboard_text[:500]:
                result.error = "Clipboard contains login page content — session expired"
                return result

            content_lower = clipboard_text[:2000].lower()
            bamboo_indicators = ["bamboo id", "bamboo_id", "citrix user"]
            if any(ind in content_lower for ind in bamboo_indicators):
                score_indicators = ["csat", "productivity", "aht", "fcr"]
                if not any(ind in content_lower for ind in score_indicators):
                    result.error = "Clipboard appears to be from 'Bamboo ID' tab, not 'Team Scores'"
                    return result

            if "\t" not in clipboard_text and "," not in clipboard_text:
                result.error = "Clipboard doesn't appear to contain spreadsheet data"
                return result

            result.success = True
            result.raw_text = clipboard_text
            result.method = "clipboard"
            return result

        except Exception as e:
            result.error = f"Clipboard extraction failed: {e}"
            return result

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
            headless=False,  # MUST be visible for manual login
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
            "membersFound": 0,
        }

        if test_result.success:
            from sheet_parser import parse_csv, validate_team_data
            try:
                rows = parse_csv(test_result.raw_text) if test_result.method == "csv_download" else parse_tsv(test_result.raw_text)
                data = validate_team_data(rows)
                result["membersFound"] = len(data.get("members", []))
                result["monthLabel"] = data.get("monthLabel", "")
            except Exception:
                pass
            print(f"[login] ✅ Verified! Found {result['membersFound']} members.")
            print(f"[login] Profile saved to: {profile_dir}")
        else:
            print(f"[login] ⚠️  Could not verify: {test_result.error}")
            print(f"[login] Try running fetch_team_data.py again later.")

        return result