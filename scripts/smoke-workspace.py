"""Exercise the built HTTP app with temporary data. No browser or UI runtime.
Always stop our server and delete only the temporary fixture directory.
"""
import json
import io
import os
from pathlib import Path
import re
import secrets
import signal
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from PIL import Image, ImageDraw, ImageFont


def main():
    project = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="shuug-http-check-") as folder:
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        token = secrets.token_urlsafe(32)
        env = {**os.environ, "NODE_ENV": "production", "DEALDESK_DATA_DIR": folder,
               "WORKSPACE_ACCESS_TOKEN": token}
        # The fixture must never select the user's real database or provider accounts.
        project_keys = set(env)
        for filename in (".env", ".env.local", ".env.production", ".env.production.local"):
            file = project / filename
            if file.exists():
                project_keys.update(re.findall(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=", file.read_text(), re.MULTILINE))
        for key in project_keys:
            if key.startswith(("SHOPIFY_", "QBO_", "GOOGLE_", "BRAVE_", "ZAPIER_", "CUSTOM_", "AMAZON_", "SOCIAL_", "GEMINI_", "OPENAI_")) or key == "DATABASE_URL":
                env[key] = ""
        env["DATABASE_URL"] = ""
        root = f"http://127.0.0.1:{port}"

        def request(path, body=None, authenticated=True):
            headers = {"Content-Type": "application/json"}
            if authenticated:
                headers["Authorization"] = f"Bearer {token}"
            req = urllib.request.Request(root + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=10) as response:
                    return response.status, response.read().decode()
            except urllib.error.HTTPError as error:
                return error.code, error.read().decode()

        with open(Path(folder) / "server.log", "w+") as output:
            process = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", str(port)], cwd=project, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                for attempt in range(40):
                    if process.poll() is not None:
                        raise RuntimeError("The fixture server exited before becoming ready.")
                    try:
                        status, _ = request("/api/workspace/assistant", {"question": "help"})
                        if status == 200:
                            break
                    except (OSError, urllib.error.URLError):
                        pass
                    time.sleep(0.25)
                else:
                    raise RuntimeError("The fixture server did not become ready.")
                status, _ = request("/api/workspace/assistant", {"question": "enable inventory"}, authenticated=False)
                assert status == 403, "Production mutations must require owner access"
                status, body = request("/api/workspace/assistant", {"question": "I need to track sample requests"})
                reply = json.loads(body)
                assert status == 200 and reply.get("changed") is True, body
                tracker_path = reply["links"][0]["href"]
                status, page = request(tracker_path)
                assert status == 200 and "Sample requests" in page and "Add first record" in page
                _, repeated = request("/api/workspace/assistant", {"question": "I need to track sample requests"})
                assert json.loads(repeated)["links"][0]["href"] == tracker_path
                data = json.loads((Path(folder) / "features.json").read_text())
                assert len(data["trackers"]) == 1 and data["trackers"][0]["records"] == []
                _, answer = request("/api/workspace/assistant", {"question": "Show sales by channel"})
                assert "demo order data" in json.loads(answer)["answer"]
                for path, marker in [("/copilot", "What do you need to get done?"), ("/features", ">Preview</button>"), ("/settings", "Amazon Ads"), ("/visits", "Store finder"), ("/customers/import", "Import your customers"), ("/amazon", "Shipping pipeline"), ("/amazon-marketing", "Connect your Amazon Ads account"), ("/samples", "Shipping address"), ("/products", "Advertise on Amazon"), ("/expenses", "Upload receipts"), ("/calendar", "Business calendar"), ("/social", "Drop a link. Start tracking.")]:
                    status, page = request(path)
                    assert status == 200 and marker.lower() in page.lower(), f"Failed page {path}: {status}"
                assert token not in page, "Owner token must not render in page HTML"
                # URL-first social tracking makes no provider calls for these links.
                link_input = {"links": "instagram.com/shuugfixture\ntiktok.com/@shuugfixture", "role": "brand"}
                assert request("/api/social/track", link_input, authenticated=False)[0] == 403
                status, body = request("/api/social/track", link_input)
                social = json.loads(body)
                assert status == 200 and social["ok"], body
                assert len(social["state"]["accounts"]) == 2 and len(social["state"]["campaigns"]) == 6
                assert social["state"]["snapshots"] == [], "A URL must not invent account metrics"
                status, body = request("/api/social/track", link_input)
                assert status == 200 and len(json.loads(body)["state"]["campaigns"]) == 6, "Repeated links must not duplicate the plan"
                account_id = social["state"]["accounts"][0]["id"]
                report = {"accountId": account_id, "observedAt": "2026-09-01T12:00:00Z", "followers": 25, "sourceUrl": "https://www.instagram.com/shuugfixture/", "posts": []}
                assert request("/api/social/import", report, authenticated=False)[0] == 403
                assert json.loads(request("/api/social/import", report)[1])["imported"] is True
                assert json.loads(request("/api/social/import", report)[1])["imported"] is False
                assert request("/api/social/export?format=json", authenticated=False)[0] == 403
                status, export = request("/api/social/export?format=json")
                assert status == 200 and token not in export and len(json.loads(export)["snapshots"]) == 1
                status, calendar_export = request("/api/social/export?format=ics")
                assert status == 200 and calendar_export.count("BEGIN:VEVENT") == 6
                status, social_page = request("/social")
                assert status == 200 and "shuugfixture" in social_page and "25" in social_page

                # Real native OCR through the production upload endpoint, with
                # a synthetic receipt only. All resulting records stay in temp.
                font_path = next((p for p in ["/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"] if Path(p).exists()), None)
                font = ImageFont.truetype(font_path, 42) if font_path else ImageFont.load_default(size=42)
                fixture = Image.new("RGB", (1200, 650), "white")
                ImageDraw.Draw(fixture).multiline_text((65, 65), "FIXTURE OFFICE SUPPLY\n09/10/2026\nPaper and pencils\nSubtotal 100.00\nTax 8.25\nTOTAL USD 108.25", font=font, fill="black", spacing=28)
                buffer = io.BytesIO()
                fixture.save(buffer, format="PNG")
                original = buffer.getvalue()
                boundary = "shuug-fixture-boundary"
                upload_body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture-receipt.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + original + f'\r\n--{boundary}--\r\n'.encode())

                def upload(authenticated=True):
                    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
                    if authenticated:
                        headers["Authorization"] = f"Bearer {token}"
                    req = urllib.request.Request(root + "/api/receipts/upload", data=upload_body, headers=headers)
                    try:
                        with urllib.request.urlopen(req, timeout=65) as response:
                            return response.status, json.loads(response.read())
                    except urllib.error.HTTPError as error:
                        return error.code, json.loads(error.read())

                assert upload(False)[0] == 403, "Receipt uploads require owner access"
                status, receipt = upload()
                assert status == 201, receipt
                record = receipt["expense"]
                assert record["status"] == "draft", "OCR must not record an expense automatically"
                assert record["receipt"]["extraction"] == "read", record["receipt"]["message"]
                assert record["fields"]["merchant"] == "FIXTURE OFFICE SUPPLY"
                assert record["fields"]["amountCents"] == 10825 and record["fields"]["taxCents"] == 825, record["fields"]
                repeated_status, repeated = upload()
                assert repeated_status == 200 and repeated["duplicate"] is True and repeated["expense"]["id"] == record["id"]
                receipt_path = "/api/receipts/" + record["id"]
                assert request(receipt_path, authenticated=False)[0] == 403, "Original receipt files are private"
                req = urllib.request.Request(root + receipt_path + "?download=1", headers={"Authorization": f"Bearer {token}"})
                with urllib.request.urlopen(req, timeout=10) as response:
                    assert response.read() == original, "Original receipt bytes must be unchanged"
                    assert response.headers.get("Cache-Control") == "private, no-store"
                assert len(list((Path(folder) / "expenses").glob("*.json"))) == 1
                # Exercise the scanned-PDF render/OCR path as well as photos.
                pdf_buffer = io.BytesIO()
                fixture.save(pdf_buffer, format="PDF", resolution=150.0)
                upload_body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture-receipt.pdf"\r\nContent-Type: application/pdf\r\n\r\n'.encode() + pdf_buffer.getvalue() + f'\r\n--{boundary}--\r\n'.encode())
                pdf_status, pdf_receipt = upload()
                assert pdf_status == 201 and pdf_receipt["expense"]["receipt"]["mime"] == "application/pdf", pdf_receipt
                assert pdf_receipt["expense"]["fields"]["amountCents"] == 10825, pdf_receipt["expense"]["receipt"]["message"]
                assert pdf_receipt["expense"]["status"] == "draft"
                upload_body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="fake-receipt.png"\r\nContent-Type: image/png\r\n\r\n<html>not a receipt image</html>\r\n--{boundary}--\r\n'.encode())
                assert upload()[0] == 400, "A fake image extension must be rejected"
                assert len(list((Path(folder) / "expenses").glob("*.json"))) == 2
                status, page = request("/expenses")
                assert status == 200 and "FIXTURE OFFICE SUPPLY" in page and "108.25" in page
                print("PASS: owner access, assistant/tools, imports, shipping, Amazon Marketing, samples, expense/calendar/social pages; URL-first tracking, social report deduplication and calendar export; real photo and scanned-PDF OCR, draft review, duplicate prevention, file validation and private unchanged downloads")
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=8)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=3)
                assert process.poll() is not None, "Fixture server was not stopped"
                print("CLEANUP: fixture server stopped; temporary business data removed on exit")


if __name__ == "__main__":
    main()
