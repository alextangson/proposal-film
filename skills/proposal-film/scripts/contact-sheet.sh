#!/usr/bin/env bash
# Review sheets with plain ffmpeg - look at these before you show anything to the person you are making the film for.
#
#   scripts/contact-sheet.sh clip  clips/C01-t1.mp4 [frames=8]   -> clips/C01-t1.sheet.jpg  (one row of evenly spaced frames)
#   scripts/contact-sheet.sh board kf/*.png                       -> storyboard-1.jpg, -2 ... (keyframes in order, 4 per row)
# Existing sheets are never overwritten.
#
# Check on the sheet: same faces, bodies and clothes across shots; no warped hands; eyes look where the story says;
# the transition you designed really happens inside the shot. Open faces at full size - thumbnails hide eye lines.
set -euo pipefail
command -v ffmpeg >/dev/null || { echo "ffmpeg not found (macOS: brew install ffmpeg)" >&2; exit 2; }
mode="${1:?usage: contact-sheet.sh clip <video> [frames] | board <images...>}"; shift

if [ "$mode" = clip ]; then
  in="${1:?video file missing}"; n="${2:-8}"
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
  fps=$(awk -v n="$n" -v d="$dur" 'BEGIN { printf "%.4f", n / d }')
  out="${in%.*}.sheet.jpg"
  [ -e "$out" ] && { echo "$out already exists - delete or rename it first" >&2; exit 2; }
  ffmpeg -v error -n -i "$in" -vf "fps=$fps,scale=480:-2,tile=${n}x1:padding=6:color=white" -frames:v 1 "$out"
  echo "$out"
elif [ "$mode" = board ]; then
  [ "$#" -gt 0 ] || { echo "no images given" >&2; exit 2; }
  tmp=$(mktemp -d); i=0
  for f in "$@"; do
    ffmpeg -v error -y -i "$f" -vf "scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2:white" "$tmp/$(printf %04d $i).png"
    i=$((i + 1))
  done
  rows=$(( (i + 3) / 4 )); n=1
  while [ -e "storyboard-$n.jpg" ]; do n=$((n + 1)); done
  ffmpeg -v error -n -framerate 1 -i "$tmp/%04d.png" -vf "tile=4x${rows}:padding=6:color=white" -frames:v 1 "storyboard-$n.jpg"
  rm -rf "$tmp"
  echo "storyboard-$n.jpg  ($i frames, in the order you passed them - number your files in playback order)"
else
  echo "mode must be clip or board" >&2; exit 2
fi
