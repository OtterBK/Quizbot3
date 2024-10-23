#!/bin/bash

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
