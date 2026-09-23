#!/usr/bin/env bash
set -euo pipefail
# Original test narration, generated locally; no downloaded or copyrighted media.
fixture_dir="${1:-/tmp/arc-fixture}"
mkdir -p "$fixture_dir"
espeak -s 145 -w "$fixture_dir/speech.wav" 'Welcome to this short lesson on video intelligence. A video contains useful ideas, but finding a specific moment can take time. First, we extract the audio and transcribe the speech. Each sentence keeps its original timestamp. Next, we group related sentences into sections. An embedding turns the meaning of each section into a numerical vector. Similar ideas have similar vectors. K means clustering groups these vectors into topics without labeled training data. The silhouette score helps choose how many groups to use. Principal component analysis projects the vectors into two dimensions for a topic map. Finally, a question retrieves relevant transcript sections. The language model answers from that evidence and links back to the original moment. The key lesson is that a useful answer should always be connected to its source.'
ffmpeg -nostdin -y -v error -f lavfi -i 'color=c=0x26382e:s=640x360:r=24' -i "$fixture_dir/speech.wav" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -movflags +faststart "$fixture_dir/arc-lesson.mp4"
printf 'Fixture created: %s/arc-lesson.mp4\n' "$fixture_dir"
