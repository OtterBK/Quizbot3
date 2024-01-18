#!/bin/bash

export HOST_ADDR=localhost
export PGPASSFILE=../.pgpass
BACKUP_FOLDER=../db_backup


# Set the current date as part of the backup file name
backup_file="$BACKUP_FOLDER/backup_$(date +\%Y\%m\%d_\%H\%M\%S).sql"

# Perform the PostgreSQL backup without password prompt
pg_dump -U quizbot -h $HOST_ADDR -d quizbot3 > "$backup_file"




# Delete backup files that are 7 days old
find $BACKUP_FOLDER/ -type f -name 'backup_*.sql' -mtime +6 -exec rm {} \;

