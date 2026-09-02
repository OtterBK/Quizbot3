#!/bin/bash
. /etc/profile.d/quizbot_path.sh

# Check if QUIZBOT_PATH is set
if [ -z "$QUIZBOT_PATH" ]; then
    echo "QUIZBOT_PATH is not set. Please set it before running the script."
    exit 1
fi

# Define the backup folder using QUIZBOT_PATH
BACKUP_FOLDER="$QUIZBOT_PATH/auto_script/db_backup"

# Create the backup folder if it doesn't exist
if [ ! -d "$BACKUP_FOLDER" ]; then
  echo "Creating backup folder: $BACKUP_FOLDER"
  mkdir -p $BACKUP_FOLDER
fi

# Set the current date as part of the backup file name
backup_file="$BACKUP_FOLDER/backup_$(date +\%Y\%m\%d_\%H\%M\%S).sql"

# Perform the database backup
sudo -u postgres pg_dump -d quizbot3 > "$backup_file"
echo "Database backup created at: $backup_file"

# Delete backup files that are 7 days old
find $BACKUP_FOLDER/ -type f -name 'backup_*.sql' -mtime +6 -exec rm {} \;
echo "Old backups deleted."

# Upload the latest backup to Google Drive (off-site copy for when the usual local-device
# pickup isn't available). Only the single most recent file is kept there - anything older
# gets removed from the Drive folder right after the new upload succeeds.
# rclone remote "gdrive" must be configured for root beforehand (this script always runs
# as root via cron's `sudo -E bash`) - see 정석 사용법.txt for the one-time setup steps.
if command -v rclone >/dev/null 2>&1; then
  if rclone copy "$backup_file" gdrive:quizbot_backup/; then
    echo "Backup uploaded to Google Drive."
    backup_filename="$(basename "$backup_file")"
    rclone lsf gdrive:quizbot_backup/ --files-only | while read -r remote_file; do
      if [ "$remote_file" != "$backup_filename" ]; then
        rclone deletefile "gdrive:quizbot_backup/$remote_file"
      fi
    done
  else
    echo "WARNING: Google Drive upload failed. Local backup is still intact."
  fi
else
  echo "WARNING: rclone is not installed - skipping Google Drive upload. See 정석 사용법.txt."
fi
