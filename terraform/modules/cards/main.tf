resource "aws_lambda_function" "create_request_card_lambda" {
  function_name    = "create-request-card-lambda"
  runtime          = "nodejs18.x"
  handler          = "index.handler"
  role             = var.lambda_role_arn
  filename         = "${path.module}/../../../lambda/create-request-card-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/create-request-card-lambda.zip")
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      CARD_TABLE_NAME = aws_dynamodb_table.card_table.name
      ERROR_QUEUE_URL = aws_sqs_queue.error_create_request_card.url
    }
  }
}


resource "aws_lambda_event_source_mapping" "create_request_card_event_source" {
  event_source_arn = aws_sqs_queue.create_request_card.arn
  function_name    = aws_lambda_function.create_request_card_lambda.function_name
  batch_size       = 10
  enabled          = true
}


resource "aws_iam_policy" "lambda_sqs_dynamodb_policy" {
  name        = "lambda-sqs-dynamodb-policy"
  description = "Permite a la lambda leer de SQS y escribir en DynamoDB"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:SendMessage"
        ],
        Effect = "Allow",
        Resource = [
          aws_sqs_queue.create_request_card.arn,
          aws_sqs_queue.error_create_request_card.arn
        ]
      },
      {
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ],
        Effect = "Allow",
        Resource = [
          aws_dynamodb_table.card_table.arn,
          aws_dynamodb_table.card_table_error.arn
        ]
      }
    ]
  })
}


resource "aws_iam_role_policy_attachment" "lambda_sqs_dynamodb_policy_attachment" {
  role       = element(split("/", var.lambda_role_arn), length(split("/", var.lambda_role_arn)) - 1)
  policy_arn = aws_iam_policy.lambda_sqs_dynamodb_policy.arn
}
