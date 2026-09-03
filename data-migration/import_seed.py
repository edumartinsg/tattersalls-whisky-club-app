"""
Browsers block reading the response of a cross origin POST to an Apps
Script web app unless the deployment is configured in a very specific way,
which is a common source of confusion during setup. A server side script
has no such restriction, so the one time historical import runs from here
instead of from a button inside the React app.
"""

import json
import sys
import urllib.request

if len(sys.argv) < 2:
    print("Usage: python import_seed.py <apps-script-web-app-url> [seed.json]")
    sys.exit(1)

WEB_APP_URL = sys.argv[1]
SEED_FILE = sys.argv[2] if len(sys.argv) > 2 else "seed.json"

with open(SEED_FILE, encoding="utf-8") as f:
    seed_data = json.load(f)

body = json.dumps({"action": "bulkSeed", "payload": seed_data}).encode("utf-8")
request = urllib.request.Request(
    WEB_APP_URL,
    data=body,
    headers={"Content-Type": "text/plain;charset=utf-8"},
    method="POST",
)

with urllib.request.urlopen(request) as response:
    result = json.loads(response.read())
    print(result)
