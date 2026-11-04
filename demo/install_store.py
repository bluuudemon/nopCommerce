#!/usr/bin/env python3
"""Submit the nopCommerce install wizard with sample data. No browser needed."""

import http.cookiejar
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


def main() -> int:
    base = sys.argv[1].rstrip("/")
    email = os.environ["DEMO_ADMIN_EMAIL"]
    password = os.environ["DEMO_ADMIN_PASSWORD"]
    sql_host = os.environ.get("DEMO_SQL_HOST", "database")
    sql_db = os.environ.get("DEMO_SQL_DATABASE", "nopcommerce")
    sql_user = os.environ.get("DEMO_SQL_USER", "postgres")
    sql_password = os.environ["DEMO_SQL_PASSWORD"]

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", "nop-demo-install")]

    install_url = f"{base}/install"
    print(f"GET {install_url}", flush=True)
    try:
        with opener.open(install_url, timeout=120) as response:
            final_url = response.geturl()
            html = response.read().decode("utf-8", "replace")
            status = response.status
    except urllib.error.HTTPError as exc:
        html = exc.read().decode("utf-8", "replace")
        final_url = exc.geturl()
        status = exc.code
        if status not in (200, 302):
            print(html[:1500], file=sys.stderr)
            return 1

    if "html-home-page" in html or "/install" not in final_url:
        print("Storefront is already installed.", flush=True)
        return 0

    token_match = re.search(
        r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', html
    )
    if not token_match:
        token_match = re.search(
            r'value="([^"]+)"[^>]*name="__RequestVerificationToken"', html
        )
    if not token_match:
        print("Install page did not include an antiforgery token.", file=sys.stderr)
        print(html[:1500], file=sys.stderr)
        return 1

    provider = "3"
    for match in re.finditer(
        r'<option[^>]*value="(\d+)"[^>]*>\s*([^<]*Postgre[^<]*)\s*</option>',
        html,
        re.IGNORECASE,
    ):
        provider = match.group(1)
        break

    form = {
        "__RequestVerificationToken": token_match.group(1),
        "AdminEmail": email,
        "AdminPassword": password,
        "ConfirmPassword": password,
        "InstallSampleData": "true",
        "DataProvider": provider,
        "CreateDatabaseIfNotExists": "true",
        "ConnectionStringRaw": "false",
        "ServerName": sql_host,
        "DatabaseName": sql_db,
        "Username": sql_user,
        "Password": sql_password,
    }
    data = urllib.parse.urlencode(form).encode()
    request = urllib.request.Request(install_url, data=data, method="POST")
    print(
        f"POST install (provider={provider}, database={sql_host}/{sql_db}). "
        "Sample data usually takes a few minutes.",
        flush=True,
    )
    try:
        with opener.open(request, timeout=900) as response:
            body = response.read().decode("utf-8", "replace")
            print(f"Install response HTTP {response.status}", flush=True)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        print(f"Install response HTTP {exc.code}", flush=True)
        if exc.code >= 400:
            print(_snippet(body), file=sys.stderr)
            return 1
    except Exception as exc:
        # The app restarts itself at the end of a successful install and
        # may drop the connection. Treat that as success if we already posted.
        print(f"Install request ended with {exc}. Checking storefront.", flush=True)
        body = ""

    if body and _failed(body):
        print(_snippet(body), file=sys.stderr)
        return 1

    restart = f"{base}/install/restartapplication"
    print(f"GET {restart}", flush=True)
    try:
        opener.open(restart, timeout=60).read()
    except Exception as exc:
        print(f"Restart call returned {exc} (expected if the process exits).", flush=True)
    return 0


def _failed(body: str) -> bool:
    if "validation-summary-errors" in body:
        return True
    if re.search(r"Setup failed|SetupFailed|field-validation-error", body, re.I):
        return True
    # A successful post renders the restart script.
    if "restartapplication" in body or "RestartUrl" in body:
        return False
    if "html-home-page" in body:
        return False
    # Still on the install form with no restart means the post did not finish.
    return 'id="installation-form"' in body


def _snippet(body: str) -> str:
    match = re.search(
        r'class="message-error"[\s\S]{0,1200}', body
    )
    text = match.group(0) if match else body[:1500]
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:800]


if __name__ == "__main__":
    sys.exit(main())
