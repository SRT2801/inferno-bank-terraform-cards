


resource "aws_dynamodb_table" "card_table" {
  name         = "card-table"
  hash_key     = "uuid"
  range_key    = "createdAt"
  billing_mode = "PAY_PER_REQUEST"

  attribute {
    name = "uuid"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name            = "userIdIndex"
    hash_key        = "userId"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "transaction_table" {
  name         = "transaction-table"
  hash_key     = "uuid"
  range_key    = "createdAt"
  billing_mode = "PAY_PER_REQUEST"
  attribute {
    name = "uuid"
    type = "S"
  }
  attribute {
    name = "createdAt"
    type = "S"
  }


  attribute {
    name = "cardId"
    type = "S"
  }

  global_secondary_index {
    name            = "cardIdIndex"
    hash_key        = "cardId"
    projection_type = "ALL"
  }

}

resource "aws_dynamodb_table" "card_table_error" {
  name         = "card-table-error"
  hash_key     = "uuid"
  range_key    = "createdAt"
  billing_mode = "PAY_PER_REQUEST"
  attribute {
    name = "uuid"
    type = "S"
  }
  attribute {
    name = "createdAt"
    type = "S"
  }
}

resource "aws_sqs_queue" "create_request_card" {
  name = "create-request-card-sqs"
}

resource "aws_sqs_queue" "error_create_request_card" {
  name = "error-create-request-card-sqs"
}

resource "random_id" "suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "transactions_report" {
  bucket        = "transactions-report-bucket-${random_id.suffix.hex}"
  force_destroy = true
}
