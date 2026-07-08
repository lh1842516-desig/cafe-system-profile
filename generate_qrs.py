#!/usr/bin/env python3
"""
Generate table QR PNGs — يستدعي نفس خدمة Node (tableQrService) لضمان تطابق التصميم.

Install (once):
  cd backend && npm install

Run:
  python generate_qrs.py
  python generate_qrs.py --ip 192.168.0.184

Output folder: table_qrs/table_<id>.png
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import socket
import subprocess

PORT = 3000
OUTPUT_DIR = "table_qrs"
DEFAULT_TABLE_IDS = list(range(1, 21))


def _ips_from_ipconfig() -> list[str]:
    out: list[str] = []
    try:
        raw = subprocess.check_output(
            ["ipconfig"],
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
        for m in re.finditer(r"IPv4[^:\r\n]*:\s*(\d+\.\d+\.\d+\.\d+)", raw, re.I):
            ip = m.group(1).strip()
            if ip and not ip.startswith("127."):
                out.append(ip)
    except OSError:
        pass
    return out


def _ips_from_udp_probe() -> str | None:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except OSError:
        pass
    return None


def get_lan_ip_from_node_server() -> str | None:
    script = r"""
const os = require('os');
const nets = os.networkInterfaces();
const candidates = [];
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) candidates.push(net.address);
  }
}
const wifiLan = candidates.find((a) => /^192\.168\.\d+\.\d+$/.test(a));
process.stdout.write(wifiLan || candidates[0] || '');
"""
    backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
    try:
        out = subprocess.check_output(
            ["node", "-e", script],
            cwd=backend_dir,
            text=True,
            encoding="utf-8",
            errors="ignore",
        ).strip()
        if out and re.match(r"^\d+\.\d+\.\d+\.\d+$", out):
            return out
    except OSError:
        pass
    return None


def get_lan_ip() -> str:
    from_node = get_lan_ip_from_node_server()
    if from_node:
        return from_node

    candidates: list[str] = []
    if platform.system() == "Windows":
        candidates.extend(_ips_from_ipconfig())

    probe = _ips_from_udp_probe()
    if probe and probe not in candidates:
        candidates.append(probe)

    seen: set[str] = set()
    unique: list[str] = []
    for a in candidates:
        if a not in seen:
            seen.add(a)
            unique.append(a)

    wifi_lan = next((a for a in unique if re.match(r"^192\.168\.\d+\.\d+$", a)), None)
    if wifi_lan:
        return wifi_lan
    if unique:
        return unique[0]
    return "127.0.0.1"


def regenerate_qrs_via_node(table_ids: list[int | str], lan_ip: str, port: int) -> int:
    """يولّد البطاقات عبر tableQrService — نفس تخطيط Wi-Fi في الإنتاج."""
    backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
    ids_payload = json.dumps([str(t) for t in table_ids])
    host_header = json.dumps(f"{lan_ip}:{port}")
    script = f"""
const qr = require('./services/tableQrService');
const ids = {ids_payload};
const req = {{ headers: {{ host: {host_header} }} }};
qr.regenerateAllTableQrs(ids.map((id) => ({{ id }})), req)
  .then((rows) => {{
    rows.forEach((r) => console.log('Saved', r.filePath, '->', r.url));
    console.log('COUNT', rows.length);
  }})
  .catch((e) => {{ console.error(e); process.exit(1); }});
"""
    out = subprocess.check_output(
        ["node", "-e", script],
        cwd=backend_dir,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    for line in out.splitlines():
        print(line)
    match = re.search(r"^COUNT\s+(\d+)$", out, re.M)
    return int(match.group(1)) if match else len(table_ids)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate table QR PNGs (Node layout — Wi-Fi instruction)")
    parser.add_argument(
        "--ip",
        help="LAN IP يدوياً (مثل 192.168.0.184 — نفس ما يظهر عند npm start)",
    )
    parser.add_argument("--port", type=int, default=PORT, help=f"منفذ السيرفر (افتراضي {PORT})")
    args = parser.parse_args()

    lan_ip = (args.ip or os.environ.get("CAFE_LAN_IP") or "").strip() or get_lan_ip()
    base_url = f"http://{lan_ip}:{args.port}/customer"

    print(f"LAN IP: {lan_ip}")
    print(f"Base URL: {base_url}?tableId=<n>")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    count = regenerate_qrs_via_node(DEFAULT_TABLE_IDS, lan_ip, args.port)
    print(f"Done. {count} files in ./{OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
