#!/usr/bin/env python3
"""
Meta API Gateway for VM-local Slack team.
Listens on localhost:4001, presents OpenAI-compatible /v1/chat/completions,
uses the custom.meta vault credential via surrogate (never exposes the key).
The Node.js engine points LITELLM_BASE_URL=http://127.0.0.1:4001 to use it.

muse-spark-1.3 consumes reasoning tokens from the max_tokens budget, so this
gateway boosts the requested budget and retries with more tokens when the
model returns null content with finish_reason=length.
"""
import json
import sys
import time
import traceback
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

ALLOWED_HOSTS = ["api.meta.ai"]
META_URL = "https://api.meta.ai/v1/chat/completions"
MODEL = "muse-spark-1.3"

# Reasoning-token headroom: the model can burn 1-3k tokens thinking before
# writing. Floor the budget and retry bigger on truncated (null-content) replies.
MIN_TOKENS = 4000
MAX_TOKENS = 16000
RETRIES = 2


def log(*parts):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *parts, flush=True, file=sys.stderr)


def call_meta(payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(META_URL, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    add_surrogate_to_request(req, "custom.meta", entry_name="access_token",
                             allowed_hosts=ALLOWED_HOSTS)
    with urllib.request.urlopen(req, timeout=180) as resp:
        return read_json_response(resp)


def content_empty(result):
    try:
        ch = result["choices"][0]
        msg = ch.get("message") or {}
        return not (msg.get("content") or "").strip() and not msg.get("tool_calls")
    except Exception:
        return True


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self.send_response(404)
            self.end_headers()
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
        except Exception as e:
            log("bad request body:", e)
            self.send_response(400)
            self.end_headers()
            return

        requested = body.get("max_tokens") or 1200
        budget = min(max(int(requested), MIN_TOKENS), MAX_TOKENS)

        payload = {"model": MODEL, "messages": body.get("messages", []),
                   "max_tokens": budget}
        # Pass through anything else the client sent (tools, tool_choice,
        # temperature, etc.) — Meta's endpoint is OpenAI-compatible.
        for k, v in body.items():
            if k not in payload and k != "model":
                payload[k] = v

        result = None
        last_err = None
        for attempt in range(RETRIES + 1):
            payload["max_tokens"] = budget
            try:
                result = call_meta(payload)
                last_err = None
            except Exception as e:
                last_err = e
                log(f"attempt {attempt} meta error:", repr(e)[:300])
                result = None
                break  # transport/auth errors won't fix with more tokens
            if not content_empty(result):
                break
            log(f"attempt {attempt}: null content (finish={self._finish(result)}), "
                f"retrying with budget={budget * 2}")
            budget = min(budget * 2, MAX_TOKENS)

        if last_err is not None or result is None:
            log("FAILED:", traceback.format_exc(limit=3)[-400:] if last_err else "no result")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(last_err)[:500]}).encode())
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())

    @staticmethod
    def _finish(result):
        try:
            return result["choices"][0].get("finish_reason")
        except Exception:
            return "?"

    def log_message(self, format, *args):
        pass  # quiet access log


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 4001), Handler)
    print("Meta gateway listening on 127.0.0.1:4001", flush=True)
    log("gateway started")
    server.serve_forever()
