#!/bin/bash

# Set the path to the .pgpass file
PGPASSFILE="/home/ubuntu/.pgpass"

# Run the SQL query using the credentials from .pgpass
psql -U quizbot -h localhost -d quizbot3 -c "UPDATE tb_quiz_info SET played_count_of_week = 0;"

