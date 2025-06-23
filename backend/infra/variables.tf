variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "result_bucket_name" {
  description = "Globally unique S3 bucket name to store outputs"
  type        = string
  default     = "pocdesktoptemp"
}

variable "node_runtime_version" {
  description = "Variable for runtime for node.js"
  type        = string
  default     = "nodejs22.x"
}