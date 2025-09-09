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

# Lambdas adicionales para los endpoints requeridos
resource "aws_lambda_function" "activate_card_lambda" {
  function_name    = "activate-card-lambda"
  runtime          = "nodejs18.x"
  handler          = "index.handler"
  role             = var.lambda_role_arn
  filename         = "${path.module}/../../../lambda/activate-card-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/activate-card-lambda.zip")
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      CARD_TABLE_NAME = aws_dynamodb_table.card_table.name
    }
  }
}

resource "aws_lambda_function" "save_transaction_lambda" {
  function_name    = "save-transaction-lambda"
  runtime          = "nodejs18.x"
  handler          = "index.handler"
  role             = var.lambda_role_arn
  filename         = "${path.module}/../../../lambda/save-transaction-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/save-transaction-lambda.zip")
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      TRANSACTION_TABLE_NAME = aws_dynamodb_table.transaction_table.name
      CARD_TABLE_NAME        = aws_dynamodb_table.card_table.name
    }
  }
}

resource "aws_lambda_function" "card_paid_lambda" {
  function_name    = "card-paid-lambda"
  runtime          = "nodejs18.x"
  handler          = "index.handler"
  role             = var.lambda_role_arn
  filename         = "${path.module}/../../../lambda/card-paid-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/card-paid-lambda.zip")
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      CARD_TABLE_NAME = aws_dynamodb_table.card_table.name
    }
  }
}

resource "aws_lambda_function" "get_card_lambda" {
  function_name    = "get-card-lambda"
  runtime          = "nodejs18.x"
  handler          = "index.handler"
  role             = var.lambda_role_arn
  filename         = "${path.module}/../../../lambda/get-card-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/get-card-lambda.zip")
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      CARD_TABLE_NAME = aws_dynamodb_table.card_table.name
    }
  }
}

resource "aws_lambda_function" "process_purchase_lambda" {
  function_name    = "process-purchase-lambda"
  runtime          = "nodejs18.x"
  handler          = "index.handler"
  role             = var.lambda_role_arn
  filename         = "${path.module}/../../../lambda/process-purchase-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/process-purchase-lambda.zip")
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      CARD_TABLE_NAME        = aws_dynamodb_table.card_table.name
      TRANSACTION_TABLE_NAME = aws_dynamodb_table.transaction_table.name
    }
  }
}





resource "aws_lambda_event_source_mapping" "create_request_card_event_source" {
  event_source_arn = aws_sqs_queue.create_request_card.arn
  function_name    = aws_lambda_function.create_request_card_lambda.function_name
  batch_size       = 10
  enabled          = true
}

resource "aws_lambda_function" "card_get_report_lambda" {
  function_name    = "card-get-report-lambda"
  runtime          = "nodejs18.x"
  handler          = "index.handler"
  role             = var.lambda_role_arn
  filename         = "${path.module}/../../../lambda/card-get-report-lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/card-get-report-lambda.zip")
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      TRANSACTION_TABLE_NAME = aws_dynamodb_table.transaction_table.name
      BUCKET_NAME            = aws_s3_bucket.transactions_report.bucket
    }
  }
}

# API Gateway
resource "aws_api_gateway_rest_api" "cards_api" {
  name        = "cards-api"
  description = "API Gateway para operaciones de tarjetas y transacciones"
}

# Recursos de API Gateway
resource "aws_api_gateway_resource" "card_resource" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  parent_id   = aws_api_gateway_rest_api.cards_api.root_resource_id
  path_part   = "card"
}

resource "aws_api_gateway_resource" "card_id_resource" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  parent_id   = aws_api_gateway_resource.card_resource.id
  path_part   = "{card_id}"
}

resource "aws_api_gateway_resource" "activate_resource" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  parent_id   = aws_api_gateway_resource.card_resource.id
  path_part   = "activate"
}

resource "aws_api_gateway_resource" "paid_resource" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  parent_id   = aws_api_gateway_resource.card_resource.id
  path_part   = "paid"
}

resource "aws_api_gateway_resource" "paid_card_id_resource" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  parent_id   = aws_api_gateway_resource.paid_resource.id
  path_part   = "{card_id}"
}

resource "aws_api_gateway_resource" "transactions_resource" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  parent_id   = aws_api_gateway_rest_api.cards_api.root_resource_id
  path_part   = "transactions"
}

resource "aws_api_gateway_resource" "save_resource" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  parent_id   = aws_api_gateway_resource.transactions_resource.id
  path_part   = "save"
}

resource "aws_api_gateway_resource" "save_card_id_resource" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  parent_id   = aws_api_gateway_resource.save_resource.id
  path_part   = "{card_id}"
}

resource "aws_api_gateway_resource" "purchase_resource" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  parent_id   = aws_api_gateway_resource.transactions_resource.id
  path_part   = "purchase"
}

resource "aws_api_gateway_resource" "card_get_report_resource" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  parent_id   = aws_api_gateway_resource.card_id_resource.id
  path_part   = "report"
}

# Métodos API Gateway
resource "aws_api_gateway_method" "activate_card_method" {
  rest_api_id   = aws_api_gateway_rest_api.cards_api.id
  resource_id   = aws_api_gateway_resource.activate_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "activate_card_integration" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  resource_id = aws_api_gateway_resource.activate_resource.id
  http_method = aws_api_gateway_method.activate_card_method.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.activate_card_lambda.invoke_arn
}


resource "aws_api_gateway_method" "save_transaction_method" {
  rest_api_id   = aws_api_gateway_rest_api.cards_api.id
  resource_id   = aws_api_gateway_resource.save_card_id_resource.id
  http_method   = "POST"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.card_id" = true
  }
}

resource "aws_api_gateway_integration" "save_transaction_integration" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  resource_id = aws_api_gateway_resource.save_card_id_resource.id
  http_method = aws_api_gateway_method.save_transaction_method.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.save_transaction_lambda.invoke_arn
}


resource "aws_api_gateway_method" "card_paid_method" {
  rest_api_id   = aws_api_gateway_rest_api.cards_api.id
  resource_id   = aws_api_gateway_resource.paid_card_id_resource.id
  http_method   = "POST"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.card_id" = true
  }
}

resource "aws_api_gateway_integration" "card_paid_integration" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  resource_id = aws_api_gateway_resource.paid_card_id_resource.id
  http_method = aws_api_gateway_method.card_paid_method.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.card_paid_lambda.invoke_arn
}


resource "aws_api_gateway_method" "get_card_method" {
  rest_api_id   = aws_api_gateway_rest_api.cards_api.id
  resource_id   = aws_api_gateway_resource.card_id_resource.id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.card_id" = true
  }
}

resource "aws_api_gateway_integration" "get_card_integration" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  resource_id = aws_api_gateway_resource.card_id_resource.id
  http_method = aws_api_gateway_method.get_card_method.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.get_card_lambda.invoke_arn
}

resource "aws_api_gateway_method" "process_purchase_method" {
  rest_api_id   = aws_api_gateway_rest_api.cards_api.id
  resource_id   = aws_api_gateway_resource.purchase_resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "card_get_report_method" {
  rest_api_id   = aws_api_gateway_rest_api.cards_api.id
  resource_id   = aws_api_gateway_resource.card_get_report_resource.id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.card_id" = true
  }
}


resource "aws_api_gateway_integration" "process_purchase_integration" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  resource_id = aws_api_gateway_resource.purchase_resource.id
  http_method = aws_api_gateway_method.process_purchase_method.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.process_purchase_lambda.invoke_arn
}

resource "aws_api_gateway_integration" "card_get_report_integration" {
  rest_api_id = aws_api_gateway_rest_api.cards_api.id
  resource_id = aws_api_gateway_resource.card_get_report_resource.id
  http_method = aws_api_gateway_method.card_get_report_method.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.card_get_report_lambda.invoke_arn
}


resource "aws_api_gateway_deployment" "cards_api_deployment" {
  depends_on = [
    aws_api_gateway_integration.activate_card_integration,
    aws_api_gateway_integration.save_transaction_integration,
    aws_api_gateway_integration.card_paid_integration,
    aws_api_gateway_integration.get_card_integration,
    aws_api_gateway_integration.process_purchase_integration,
    aws_api_gateway_integration.card_get_report_integration,
  ]

  rest_api_id = aws_api_gateway_rest_api.cards_api.id

  # Garantiza que se cree un nuevo despliegue cuando cambien las integraciones
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "prod" {
  stage_name    = "prod"
  rest_api_id   = aws_api_gateway_rest_api.cards_api.id
  deployment_id = aws_api_gateway_deployment.cards_api_deployment.id
}


resource "aws_lambda_permission" "activate_card_lambda_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.activate_card_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.cards_api.execution_arn}/*/${aws_api_gateway_method.activate_card_method.http_method}${aws_api_gateway_resource.activate_resource.path}"
}

resource "aws_lambda_permission" "save_transaction_lambda_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.save_transaction_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.cards_api.execution_arn}/*/${aws_api_gateway_method.save_transaction_method.http_method}${aws_api_gateway_resource.save_card_id_resource.path}"
}

resource "aws_lambda_permission" "card_paid_lambda_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.card_paid_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.cards_api.execution_arn}/*/${aws_api_gateway_method.card_paid_method.http_method}${aws_api_gateway_resource.paid_card_id_resource.path}"
}

resource "aws_lambda_permission" "process_purchase_lambda_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.process_purchase_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.cards_api.execution_arn}/*/${aws_api_gateway_method.process_purchase_method.http_method}${aws_api_gateway_resource.purchase_resource.path}"
}


resource "aws_lambda_permission" "get_card_lambda_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_card_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.cards_api.execution_arn}/*/${aws_api_gateway_method.get_card_method.http_method}${aws_api_gateway_resource.card_id_resource.path}"
}

resource "aws_lambda_permission" "card_get_report_permission" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.card_get_report_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.cards_api.execution_arn}/*/${aws_api_gateway_method.card_get_report_method.http_method}${aws_api_gateway_resource.card_get_report_resource.path}"
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
          "dynamodb:Query",
          "dynamodb:Scan"
        ],
        Effect = "Allow",
        Resource = [
          aws_dynamodb_table.card_table.arn,
          aws_dynamodb_table.card_table_error.arn,
          aws_dynamodb_table.transaction_table.arn,
          "${aws_dynamodb_table.card_table.arn}/index/*",
          "${aws_dynamodb_table.transaction_table.arn}/index/*"
        ]
      },
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Effect   = "Allow",
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Action = [
          "s3:PutObject",
        ],
        Effect   = "Allow",
        Resource = "${aws_s3_bucket.transactions_report.arn}/*"
      }
    ]
  })
}


resource "aws_iam_role_policy_attachment" "lambda_sqs_dynamodb_policy_attachment" {
  role       = element(split("/", var.lambda_role_arn), length(split("/", var.lambda_role_arn)) - 1)
  policy_arn = aws_iam_policy.lambda_sqs_dynamodb_policy.arn
}

