#!/bin/bash

# Get the INSTALL_PATH environment variable (QUIZBOT_PATH)
if [ -z "$QUIZBOT_PATH" ]; then
    echo "QUIZBOT_PATH is not set. Please set it before running the script."
    exit 1
fi

# Define the target path using QUIZBOT_PATH
TARGET_PATH="$QUIZBOT_PATH/node_modules/youtube-dl-exec/bin"

# Check if the directory exists, create if it doesn't
if [ ! -d "$TARGET_PATH" ]; then
  echo "Creating target directory: $TARGET_PATH"
  mkdir -p $TARGET_PATH
fi

# If yt-dlp already exists, back it up as yt-dlp-prev
if [ -f "$TARGET_PATH/yt-dlp" ]; then
  echo "Backing up existing yt-dlp as yt-dlp-prev"
  cp "$TARGET_PATH/yt-dlp" "$TARGET_PATH/yt-dlp-prev"
fi

# Download the latest yt-dlp
echo "Downloading the latest version of yt-dlp..."
curl -LO https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp

# Move the downloaded yt-dlp file to the target directory
echo "Moving yt-dlp to $TARGET_PATH"
mv -f yt-dlp $TARGET_PATH

# Grant 777 permissions to the yt-dlp file
echo "Granting 777 permissions to yt-dlp"
chmod 777 $TARGET_PATH/yt-dlp

echo "yt-dlp installation completed, previous version saved as yt-dlp-prev."
