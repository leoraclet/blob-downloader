#!/usr/bin/env python3
import argparse
import base64
import json
import os
import subprocess
import sys
import time
from queue import Queue
from threading import Thread
from urllib.parse import urljoin

import m3u8
import requests
import tqdm


def parse_args():
    parser = argparse.ArgumentParser(description="Download a video from an m3u8 URL.")
    parser.add_argument("url", help="URL to the master m3u8 file")
    parser.add_argument(
        "--output", default="output.mp4", help="Output filename (default: output.mp4)"
    )
    parser.add_argument(
        "--concurrent",
        type=int,
        default=10,
        help="Number of concurrent downloads (default: 10)",
    )
    return parser.parse_args()


def fetch_m3u8_data(url):
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        return m3u8.loads(r.text)
    except Exception as e:
        print(f"Error fetching m3u8 data: {e}", file=sys.stderr)
        sys.exit(1)


def find_playlist_url(m3u8_master, base_url):
    for media in m3u8_master.data.get("media", []):
        if (
            media.get("type") == "AUDIO"
            and media.get("language") == "eng"
            and media.get("group_id") == "720p"
        ):
            return urljoin(base_url, media["uri"])
    # Fallback: use the first playlist if no match is found
    if m3u8_master.data.get("playlists"):
        return urljoin(base_url, m3u8_master.data["playlists"][0]["uri"])
    raise ValueError("No suitable playlist found in m3u8 data.")


def download_segment(url, session):
    tries = 0
    while tries < 3:
        try:
            r = session.get(url, timeout=10)
            r.raise_for_status()
            return r.content
        except Exception as e:
            print(f"Error downloading segment {url}: {e}", file=sys.stderr)
            tries += 1
            time.sleep(1)

    return None


def worker(q, session, segments):
    while True:
        url = q.get()
        segment_data = download_segment(url, session)
        if segment_data:
            segments[url] = segment_data
        q.task_done()


def main():
    args = parse_args()
    session = requests.Session()
    segments = {}

    # Fetch master m3u8
    m3u8_master = fetch_m3u8_data(args.url)
    base_url = "/".join(args.url.split("/")[:-1]) + "/"
    playlist_url = find_playlist_url(m3u8_master, base_url)

    # Fetch playlist m3u8
    m3u8_playlist = fetch_m3u8_data(playlist_url)
    m3_data = m3u8_playlist.data
    # Save data to analyse later
    with open("data/data.json", "w") as file:
        json.dump(m3_data, file, indent=4)

    # Prepare queue and threads
    q = Queue(args.concurrent * 2)
    for _ in range(args.concurrent):
        t = Thread(target=worker, args=(q, session, segments))
        t.daemon = True
        t.start()

    # Download segments
    try:
        for segment in tqdm.tqdm(m3_data["segments"], desc="Downloading segments"):
            uri = urljoin(playlist_url, segment["uri"])
            q.put(uri)
        q.join()
    except KeyboardInterrupt:
        print("\nDownload interrupted by user.", file=sys.stderr)
        sys.exit(1)

    # Sort segments by uri
    # FIXME: My might to be modified depending on the uri scheme.
    #        In tmy case, testing with my url, the segment numbering was at the ned of
    #        the URI but base64 encoded, hence the decoding procedure when sorting.
    sorted_segments = [
        segments[k]
        for k in sorted(
            segments.keys(),
            key=lambda x: int(
                base64.b64decode(x.split("/")[-1]).decode().split("-")[1]
            ),
        )
    ]

    # Save to file
    with open("temp.ts", "wb") as fs:
        for segment in sorted_segments:
            fs.write(segment)

    # Convert to mp4 using ffmpeg
    try:
        subprocess.run(
            ["ffmpeg", "-i", "temp.ts", "-c", "copy", f"{args.output}"], check=True
        )
        os.remove("temp.ts")
        print(f"Successfully saved to {args.output}")
    except subprocess.CalledProcessError as e:
        print(f"Error converting to mp4: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
