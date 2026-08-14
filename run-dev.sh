#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date +%H:%M:%S)] starting dev server..." >> /home/z/my-project/dev.log
  bun run dev >> /home/z/my-project/dev.log 2>&1
  echo "[$(date +%H:%M:%S)] dev server exited (code $?), restarting in 2s..." >> /home/z/my-project/dev.log
  sleep 2
done
