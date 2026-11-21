#!/usr/bin/env bash
# ==============================================================================
# VoteCloud - Déploiement CLI optionnel de FaaS #1 (AWS Lambda + Function URL)
# Note : Vous pouvez aussi déployer faas-vote.zip en 1 clic via la Console AWS !
# ==============================================================================
set -euo pipefail

FUNCTION_NAME="${FUNCTION_NAME:-votecloud-faas-vote}"
AWS_REGION="${AWS_REGION:-eu-west-3}"
ROLE_ARN="${LAMBDA_ROLE_ARN:?Définissez LAMBDA_ROLE_ARN (rôle IAM avec AWSLambdaBasicExecutionRole)}"

cd "$(dirname "$0")/../../faas-vote"
npm install --omit=dev
npm run package

if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "=== Mise à jour du code de la fonction Lambda existante ==="
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb://faas-vote.zip \
    --region "$AWS_REGION"
else
  echo "=== Création de la fonction AWS Lambda (Node.js 20.x) ==="
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --timeout 15 \
    --memory-size 256 \
    --zip-file fileb://faas-vote.zip \
    --region "$AWS_REGION"

  echo "=== Activation de la Lambda Function URL (HTTPS public) ==="
  aws lambda create-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE \
    --region "$AWS_REGION"

  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE \
    --region "$AWS_REGION"
fi

echo "=== URL HTTPS de votre fonction FaaS #1 ==="
aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$AWS_REGION" --query FunctionUrl --output text
