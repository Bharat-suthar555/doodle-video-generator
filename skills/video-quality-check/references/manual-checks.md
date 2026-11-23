# Manual Checks With FFmpeg

When the toolkit isn't installed, these FFmpeg commands cover the core checks. Each prints the measurement; compare it with the thresholds in [checks.md](checks.md).

## Metadata

```bash
ffprobe -v error -show_entries \
  stream=codec_name,width,height,avg_frame_rate,pix_fmt,sample_rate,channels \
  -show_entries format=duration -of json video.mp4
```

## Decode Errors

```bash
ffmpeg -v error -i video.mp4 -f null - 2>&1 | head -20
```

No output means no decode errors.

## Black Frames

```bash
ffmpeg -i video.mp4 -vf blackdetect=d=0.5:pix_th=0.10 -an -f null - 2>&1 \
  | grep black_start
```

## Loudness, True Peak and Silence

```bash
ffmpeg -i video.mp4 -vn \
  -af ebur128=peak=true,silencedetect=n=-50dB:d=1.5 -f null - 2>&1 \
  | grep -E "I:|Peak:|silence_"
```

Integrated loudness is the `I:` line in the summary; true peak is the `Peak:` line.

## Sample Peak (Clipping)

```bash
ffmpeg -i video.mp4 -vn -af astats=measure_perchannel=none -f null - 2>&1 \
  | grep "Peak level dB"
```

## Representative Frames

```bash
ffmpeg -i video.mp4 -vf "fps=1/5,scale=480:-2,tile=4x2" -frames:v 1 sheet.png
```

## Subtitle Overlaps

Read the `.srt` and confirm each caption's start time is at or after the previous caption's end time, and that no caption has more than two lines.
