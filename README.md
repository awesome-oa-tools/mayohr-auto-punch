# mayohr-auto-punch

Automatic punch in/out system for mayohr

## Usage

### Create a .env file

Create a .env file with your credentials:

```bash
# Download the .env.example file:
mkdir -p ~/.mayohr-auto-punch \
  && wget -O ~/.mayohr-auto-punch/.env \
  https://raw.githubusercontent.com/awesome-oa-tools/mayohr-auto-punch/main/.env.example

# Update the .env file with your credentials:
vi ~/.mayohr-auto-punch/.env
```

### Run the script

```bash
npx --yes --quite mayohr-auto-punch@latest
```

### Run the script with Crontab

```bash
# Download the crontab config
mkdir -p ~/.mayohr-auto-punch/crontab && \
  wget -O ~/.mayohr-auto-punch/crontab/mayohr-auto-punch.sh \
    https://raw.githubusercontent.com/awesome-oa-tools/mayohr-auto-punch/main/examples/crontab/mayohr-auto-punch.sh && \
  chmod +x ~/.mayohr-auto-punch/crontab/mayohr-auto-punch.sh && \
  wget -O ~/.mayohr-auto-punch/crontab/mayohr \
    https://raw.githubusercontent.com/awesome-oa-tools/mayohr-auto-punch/main/examples/crontab/mayohr

# Add to existing crontab (this will merge with your existing crontab entries)
crontab -l | cat - ~/.mayohr-auto-punch/crontab/mayohr | crontab -

# Verify the crontab settings
crontab -l

# To remove crontab, run crontab -e
```

### Run the script with PM2

```bash
# Install PM2
npm i -g pm2

# Download the pm2 configs:
wget -O ~/.mayohr-auto-punch/ecosystem.config.js \
  https://raw.githubusercontent.com/awesome-oa-tools/mayohr-auto-punch/main/examples/pm2/ecosystem.config.js

# Start the script with PM2:
pm2 start ~/.mayohr-auto-punch/ecosystem.config.js \
  && pm2 stop mayohr-morning-punch mayohr-evening-punch
```

### Run the script with Docker

```bash
docker run --rm -it \
  -v $HOME/.mayohr-auto-punch:/home/pptruser/.mayohr-auto-punch \
  justintw/mayohr-auto-punch:latest
```

### Run the script with AWS Lambda

```bash
# Download the AWS template
mkdir -p ~/.mayohr-auto-punch/aws \
  && wget -O ~/.mayohr-auto-punch/aws/ecr-template.yaml \
  https://raw.githubusercontent.com/awesome-oa-tools/mayohr-auto-punch/main/examples/aws/ecr-template.yaml \
  && wget -O ~/.mayohr-auto-punch/aws/lambda-template.yaml \
  https://raw.githubusercontent.com/awesome-oa-tools/mayohr-auto-punch/main/examples/aws/lambda-template.yaml

source ~/.mayohr-auto-punch/.env

# Create SSM parameters for sensitive data
aws ssm put-parameter \
  --no-cli-pager \
  --region ap-northeast-1 \
  --name "/mayohr-auto-punch/ms-password" \
  --value "${MS_PASSWORD}" \
  --type "SecureString" \
  --overwrite

aws ssm put-parameter \
  --no-cli-pager \
  --region ap-northeast-1 \
  --name "/mayohr-auto-punch/ms-totp-secret" \
  --value "${MS_TOPT_SECRET}" \
  --type "SecureString" \
  --overwrite

aws ssm put-parameter \
  --no-cli-pager \
  --region ap-northeast-1 \
  --name "/mayohr-auto-punch/telegram-bot-token" \
  --value "${TELEGRAM_BOT_TOKEN}" \
  --type "SecureString" \
  --overwrite

# Create the ecr stack
aws cloudformation create-stack \
  --no-cli-pager \
  --region ap-northeast-1 \
  --stack-name mayohr-auto-punch-ecr \
  --template-body file://~/.mayohr-auto-punch/aws/ecr-template.yaml

# Get ECR URI
ECR_URI=$(aws cloudformation describe-stacks \
  --no-cli-pager \
  --region ap-northeast-1 \
  --stack-name mayohr-auto-punch-ecr \
  --query "Stacks[0].Outputs[?OutputKey=='RepositoryUri'].OutputValue" \
  --output text)

# Login to ECR
aws ecr get-login-password \
  --no-cli-pager \
  --region ap-northeast-1 \
  | docker login \
    --username AWS \
    --password-stdin \
    ${ECR_URI}

# Push the image to ECR
docker pull --platform linux/amd64 justintw/mayohr-auto-punch:latest \
  && docker tag justintw/mayohr-auto-punch:latest ${ECR_URI}:latest \
  && docker push ${ECR_URI}:latest

# Create the stack
aws cloudformation create-stack \
  --no-cli-pager \
  --region ap-northeast-1 \
  --stack-name mayohr-auto-punch-lambda \
  --template-body file://~/.mayohr-auto-punch/aws/lambda-template.yaml \
  --parameters \
    ParameterKey=ImageUri,ParameterValue=${ECR_URI}:latest \
    ParameterKey=MsDomain,ParameterValue=${MS_DOMAIN} \
    ParameterKey=MsUsername,ParameterValue=${MS_USERNAME} \
    ParameterKey=TelegramEnabled,ParameterValue=${TELEGRAM_ENABLED} \
    ParameterKey=TelegramChatId,ParameterValue=${TELEGRAM_CHAT_ID} \
  --capabilities CAPABILITY_IAM
```

## Telegram Notification (Optional)

To enable Telegram notifications:

1. Create a Telegram bot through [@BotFather](https://t.me/botfather)
2. Create a Telegram Channel and add the bot to it as an admin
3. Get Channel ID from https://api.telegram.org/bot<bot_token>/getUpdates
3. Add the following to your `~/.mayohr-auto-punch/.env` file:

```bash
TELEGRAM_ENABLED="true"
TELEGRAM_BOT_TOKEN="your_bot_token"
TELEGRAM_CHAT_ID="your_chat_id"
```
