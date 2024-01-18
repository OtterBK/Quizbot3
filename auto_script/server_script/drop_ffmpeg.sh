#!/bin/bash

# Get the process IDs of matching processes
pids=$(pgrep -f '/ffmpeg-static/ffmpeg')

# Iterate through each process ID
for pid in $pids; do
	# Get the process start time
	start_time=$(ps -o lstart= -p $pid)

	# Convert the start time to seconds since epoch
	start_seconds=$(date -d "$start_time" +%s)

	# Get the current time in seconds since epoch
	current_seconds=$(date +%s)

	# Calculate the elapsed time in seconds
	elapsed_seconds=$((current_seconds - start_seconds))

	# Check if the elapsed time is at least 300 seconds (5 minutes)
	if [ $elapsed_seconds -ge 300 ]; then
	# Kill the process
		kill $pid
			echo "Killed process $pid with start time $start_time and elapsed time $elapsed_seconds seconds."
			fi
		done

