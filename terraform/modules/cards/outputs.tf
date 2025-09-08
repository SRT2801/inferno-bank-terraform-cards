

output "card_table_name" {
  value = aws_dynamodb_table.card_table.name
}

output "transaction_table_name" {
  value = aws_dynamodb_table.transaction_table.name
}

output "card_table_error_name" {
  value = aws_dynamodb_table.card_table_error.name
}

output "create_request_card_queue_url" {
  value = aws_sqs_queue.create_request_card.url
}

output "error_create_request_card_queue_url" {
  value = aws_sqs_queue.error_create_request_card.url
}

output "transactions_report_bucket" {
  value = aws_s3_bucket.transactions_report.bucket
}
