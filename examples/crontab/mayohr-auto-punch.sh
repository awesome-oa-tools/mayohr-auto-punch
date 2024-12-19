#!/bin/bash

source ~/.zshrc

LOG_FILE="/var/log/mayohr-auto-punch.log"

echo "Running at $(date)" >> "$LOG_FILE"

DELAY=$(( RANDOM % 300 ))

sleep "$DELAY"

npx --yes --quiet mayohr-auto-punch@latest >> "$LOG_FILE" 2>&1
