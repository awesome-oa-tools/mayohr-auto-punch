#!/bin/bash

# load nvm
export NVM_DIR="${HOME}/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

LOG_FILE="/var/log/mayohr-auto-punch.log"

echo "Running at $(date)" >> "$LOG_FILE"

DELAY=$(( RANDOM % 300 ))

echo "Delaying for $DELAY seconds" >> "$LOG_FILE"

sleep "$DELAY"

MAX_RETRIES=3
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  npx --yes --quiet mayohr-auto-punch@latest >> "$LOG_FILE" 2>&1

  # 判斷 $LOG_FILE 倒數三行是否不包含 [ERROR]
  if ! tail -n 3 "$LOG_FILE" | grep -q "ERROR"; then
    echo "Command executed successfully" >> "$LOG_FILE"
    exit 0
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo "Command failed, attempt $RETRY_COUNT of $MAX_RETRIES. Retrying in 30 seconds..." >> "$LOG_FILE"
      sleep 10
    else
      echo "Command failed after $MAX_RETRIES attempts" >> "$LOG_FILE"
      exit 1
    fi
  fi
done
