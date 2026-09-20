from __future__ import annotations

import argparse
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional

from ored.learning.online import DEFAULT_CHECKPOINT, DEFAULT_LIVE_DIR, OnlineLearner, OnlinePolicy
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)

MAX_BODY_BYTES = 64 * 1024


class OredHandler(BaseHTTPRequestHandler):

    learner: Optional[OnlineLearner] = None
    api_key: str = ""
    lock = threading.Lock()
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        logger.info("%s - %s" % (self.address_string(), fmt % args))

    def _send(self, payload: Dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _authorised(self) -> bool:
        if not self.api_key:
            return True
        header = self.headers.get("authorization") or ""
        return header == "Bearer " + self.api_key

    def do_GET(self) -> None:
        if self.path.rstrip("/") != "/health":
            return self._send({"error": "Not found"}, 404)
        stats = self.learner.stats.as_dict() if self.learner else {}
        self._send({"ok": True, "online": stats})

    def do_POST(self) -> None:
        if not self._authorised():
            return self._send({"error": "Unauthorised"}, 401)

        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            return self._send({"error": "Bad request"}, 400)

        if length <= 0 or length > MAX_BODY_BYTES:
            return self._send({"error": "Bad request"}, 400)

        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._send({"error": "Bad request"}, 400)

        message = str(body.get("message") or "").strip()
        if not message:
            return self._send({"error": "Empty message"}, 400)

        if self.learner is None:
            return self._send({"error": "Model not loaded"}, 503)

        with self.lock:
            reply, learned = self.learner.respond(message)
            stats = self.learner.stats.as_dict()

        self._send({
            "reply": reply,
            "model_version": self.learner.version,
            "learned": learned.learned,
            "learned_skipped_because": learned.reason,
            "loss": learned.loss,
            "online": stats,
        })


def build_server(
    host: str,
    port: int,
    checkpoint: str,
    device: str,
    policy: OnlinePolicy,
    live_dir: str,
    api_key: str,
) -> ThreadingHTTPServer:
    OredHandler.learner = OnlineLearner.from_checkpoint(
        path=checkpoint, device=device, policy=policy, live_dir=live_dir
    )
    OredHandler.api_key = api_key
    return ThreadingHTTPServer((host, port), OredHandler)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Serve Ored and learn from every message it is sent.",
        epilog="Point ORED_API_URL at this server. ORED_API_KEY is read from the environment.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT)
    parser.add_argument("--live-dir", default=DEFAULT_LIVE_DIR)
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    parser.add_argument("--steps-per-message", type=int, default=1)
    parser.add_argument("--save-every", type=int, default=25)
    parser.add_argument("--no-learning", action="store_true")
    args = parser.parse_args(argv)

    policy = OnlinePolicy(
        learning_rate=args.learning_rate,
        steps_per_message=args.steps_per_message,
        save_every=args.save_every,
    )
    if args.no_learning:
        policy.steps_per_message = 1
        policy.save_every = 0

    server = build_server(
        host=args.host,
        port=args.port,
        checkpoint=args.checkpoint,
        device=args.device,
        policy=policy,
        live_dir=args.live_dir,
        api_key=os.environ.get("ORED_API_KEY", ""),
    )

    logger.info(section("ORED.AI -- SERVING"))
    logger.info(f"listening on {args.host}:{args.port}")
    logger.info(f"base checkpoint : {args.checkpoint}")
    logger.info(f"live checkpoint : {args.live_dir}/live.pt")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if OredHandler.learner is not None and policy.save_every:
            OredHandler.learner.save()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
