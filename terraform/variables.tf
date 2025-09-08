variable "access_key" {
  sensitive = true
    type      = string
    description = "AWS access key"
}

variable "secret_key" {
  sensitive = true
    type      = string
    description = "AWS secret key"
}

variable "region" {
    type        = string
    default     = "us-east-1"
    description = "AWS region"
}