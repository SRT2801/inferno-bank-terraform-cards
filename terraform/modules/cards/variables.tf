variable "card_table_name" {
  type        = string
  default = "card-table"
}

variable "transaction_table_name" {
  type        = string
  default = "transaction-table"
}

variable "card_table_error_name" {
  type        = string
  default = "card-table-error"
}


variable "transactions_report_bucket" {
  type        = string
  default = "transactions-report-bucket"
}
variable "lambda_role_arn" {
  type = string
  
}
