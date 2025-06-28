terraform {
  required_version = ">= 1.8"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

provider "aws" {
  region = var.aws_region
}


# S3 bucket para salvar resultados
###############################################################################
#  S3 bucket + CORS + Public-Access Block + Bucket Policy
###############################################################################

# 1) Bucket
resource "aws_s3_bucket" "results" {
  bucket        = var.result_bucket_name
  force_destroy = true
}

# 2) Public-access block
resource "aws_s3_bucket_public_access_block" "results" {
  bucket = aws_s3_bucket.results.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false # ← libera bucket policy pública
  restrict_public_buckets = false
}

# 3) CORS
resource "aws_s3_bucket_cors_configuration" "results" {
  bucket = aws_s3_bucket.results.id

  cors_rule {
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = [
      "http://localhost:3000",
      "https://localhost:3000",
      "https://*.amplifyapp.com",
      "*"
    ]
    allowed_headers = ["*"]
    expose_headers  = ["ETag", "x-amz-meta-custom-header", "Content-Length"]
    max_age_seconds = 3000
  }

  depends_on = [aws_s3_bucket.results]
}

# 4) Bucket-policy JSON
data "aws_iam_policy_document" "results_public_read" {
  statement {
    sid    = "PublicReadGetObject"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.results.arn}/*"]
  }
}

# 5) Bucket-policy resource
resource "aws_s3_bucket_policy" "results" {
  bucket = aws_s3_bucket.results.id
  policy = data.aws_iam_policy_document.results_public_read.json

  depends_on = [
    aws_s3_bucket.results,
    aws_s3_bucket_public_access_block.results # garante que o bloqueio já foi ajustado
  ]
}

# IAM ROLE para todas as Lambdas

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "generate_code_lambda_exec_terraform"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "basic_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "bedrock" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonBedrockFullAccess"
}

resource "aws_iam_role_policy_attachment" "s3" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
}

resource "aws_iam_role_policy_attachment" "stepfunctions" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/AWSStepFunctionsFullAccess"
}

# Pacotes ZIP das Lambdas

data "archive_file" "trigger_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/stepfunction_trigger"
  output_path = "${path.module}/lambdas/stepfunction_trigger.zip"
}

data "archive_file" "extract_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/extract_content_data"
  output_path = "${path.module}/lambdas/extract_content_data.zip"
}

data "archive_file" "java_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/generate_java_code"
  output_path = "${path.module}/lambdas/generate_java_code.zip"
}

data "archive_file" "python_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/generate_python_code"
  output_path = "${path.module}/lambdas/generate_python_code.zip"
}

data "archive_file" "save_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/save_and_return_data"
  output_path = "${path.module}/lambdas/save_and_return_data.zip"
}

data "archive_file" "bdd_trigger_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/stepfunction_bdd_trigger"
  output_path = "${path.module}/lambdas/stepfunction_bdd_trigger.zip"
}

data "archive_file" "bdd_test_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/generate_bdd_teste"
  output_path = "${path.module}/lambdas/generate_bdd_teste.zip"
}

# Lambda Layer – Bedrock
resource "aws_lambda_layer_version" "bedrock_layer" {
  layer_name          = "bedrock-layer"
  filename            = "${path.module}/../layers/bedrock-layer.zip"
    source_code_hash    = filebase64sha256("${path.module}/../layers/bedrock-layer.zip")
  compatible_runtimes = ["nodejs22.x", "nodejs20.x", "nodejs18.x"] # Múltiplas versões
  license_info        = "Apache-2.0"
  description         = "SDK Bedrock e utilitários"
}

# Lambda functions

resource "aws_lambda_function" "stepfunction_trigger" {
  function_name    = "stepfunction_trigger"
  handler          = "index.handler"
  runtime          = var.node_runtime_version
  role             = aws_iam_role.lambda_exec.arn
  filename         = data.archive_file.trigger_zip.output_path
  source_code_hash = data.archive_file.trigger_zip.output_base64sha256
  memory_size      = 256
  timeout          = 300

  environment {
    variables = {
      SFN_ARN       = aws_sfn_state_machine.generate_code_flow.arn
      RESULT_BUCKET = aws_s3_bucket.results.bucket
    }
  }
  layers = [aws_lambda_layer_version.bedrock_layer.arn]
}

resource "aws_lambda_function" "extract_content_data" {
  function_name    = "extract_content_data"
  handler          = "index.handler"
  runtime          = var.node_runtime_version
  role             = aws_iam_role.lambda_exec.arn
  filename         = data.archive_file.extract_zip.output_path
  source_code_hash = data.archive_file.extract_zip.output_base64sha256
  memory_size      = 128
  timeout          = 300
  layers           = [aws_lambda_layer_version.bedrock_layer.arn]
}

resource "aws_lambda_function" "generate_java_code" {
  function_name    = "generate_java_code"
  handler          = "index.handler"
  runtime          = var.node_runtime_version
  role             = aws_iam_role.lambda_exec.arn
  filename         = data.archive_file.java_zip.output_path
  source_code_hash = data.archive_file.java_zip.output_base64sha256
  memory_size      = 128
  timeout          = 300
  layers           = [aws_lambda_layer_version.bedrock_layer.arn]
}

resource "aws_lambda_function" "generate_python_code" {
  function_name    = "generate_python_code"
  handler          = "index.handler"
  runtime          = var.node_runtime_version
  role             = aws_iam_role.lambda_exec.arn
  filename         = data.archive_file.python_zip.output_path
  source_code_hash = data.archive_file.python_zip.output_base64sha256
  memory_size      = 128
  timeout          = 300
  layers           = [aws_lambda_layer_version.bedrock_layer.arn]
}

resource "aws_lambda_function" "save_and_return_data" {
  function_name    = "save_and_return_data"
  handler          = "index.handler"
  runtime          = var.node_runtime_version
  role             = aws_iam_role.lambda_exec.arn
  filename         = data.archive_file.save_zip.output_path
  source_code_hash = data.archive_file.save_zip.output_base64sha256
  memory_size      = 128
  timeout          = 300

  environment {
    variables = {
      RESULT_BUCKET = aws_s3_bucket.results.bucket
    }
  }
  layers = [aws_lambda_layer_version.bedrock_layer.arn]
}

resource "aws_lambda_function" "generate_bdd_teste" {
  function_name    = "generate_bdd_teste"
  handler          = "index.handler"
  runtime          = var.node_runtime_version
  role             = aws_iam_role.lambda_exec.arn
  filename         = data.archive_file.bdd_test_zip.output_path
  source_code_hash = data.archive_file.bdd_test_zip.output_base64sha256
  memory_size      = 128
  timeout          = 300

  environment {
    variables = {
      RESULT_BUCKET = aws_s3_bucket.results.bucket
    }
  }
  layers = [aws_lambda_layer_version.bedrock_layer.arn]
}

resource "aws_lambda_function" "stepfunction_bdd_trigger" {
  function_name    = "stepfunction_bdd_trigger"
  handler          = "index.handler"
  runtime          = var.node_runtime_version
  role             = aws_iam_role.lambda_exec.arn
  filename         = data.archive_file.bdd_trigger_zip.output_path
  source_code_hash = data.archive_file.bdd_trigger_zip.output_base64sha256
  memory_size      = 256
  timeout          = 300

  environment {
    variables = {
      SFN_ARN       = aws_sfn_state_machine.generate_bdd_flow.arn
      RESULT_BUCKET = aws_s3_bucket.results.bucket
    }
  }
  layers = [aws_lambda_layer_version.bedrock_layer.arn]
}

# CloudWatch Log Group for Step Functions

# IAM ROLE for Step Functions
data "aws_iam_policy_document" "sfn_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sfn_role" {
  name               = "generate_code_sfn_role_terraform"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume.json
}

# Allow SFN to invoke Lambdas + put logs
resource "aws_iam_role_policy" "sfn_invoke_and_logs" {
  name = "sfn-invoke-lambdas-logs"
  role = aws_iam_role.sfn_role.id
  policy = jsonencode({
    Version : "2012-10-17",
    Statement : [
      {
        Effect : "Allow",
        Action : [
          "lambda:InvokeFunction"
        ],
        Resource : [
          aws_lambda_function.extract_content_data.arn,
          aws_lambda_function.generate_java_code.arn,
          aws_lambda_function.generate_python_code.arn,
          aws_lambda_function.save_and_return_data.arn
        ]
      },
      {
        Effect : "Allow",
        Action : [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups"
        ],
        Resource : "*"
      }
    ]
  })
}


# Step Function definition




locals {
  sfn_definition = jsonencode({
    "Comment" : "Generate code flow with error handling",
    "StartAt" : "ExtractContentData",
    "States" : {
      "ExtractContentData" : {
        "Type" : "Task",
        "Resource" : "arn:aws:states:::lambda:invoke",
        "Parameters" : {
          "FunctionName" : "${aws_lambda_function.extract_content_data.arn}",
          "Payload.$" : "$"
        },
        "ResultPath" : "$.extract_result",
        "Next" : "CheckExtractContentData"
      },
      "CheckExtractContentData" : {
        "Type" : "Choice",
        "Choices" : [
          {
            "Variable" : "$.extract_result.Payload.statuscode",
            "NumericEquals" : 200,
            "Next" : "LanguageChoice"
          }
        ],
        "Default" : "SaveAndReturn"
      },
      "LanguageChoice" : {
        "Type" : "Choice",
        "Choices" : [
          {
            "Variable" : "$.user_data.language",
            "StringEquals" : "java",
            "Next" : "GenerateJavaCode"
          },
          {
            "Variable" : "$.user_data.language",
            "StringEquals" : "python",
            "Next" : "GeneratePythonCode"
          }
        ],
        "Default" : "UnsupportedLanguage"
      },
      "GenerateJavaCode" : {
        "Type" : "Task",
        "Resource" : "arn:aws:states:::lambda:invoke",
        "Parameters" : {
          "FunctionName" : "${aws_lambda_function.generate_java_code.arn}",
          "Payload.$" : "$.extract_result.Payload"
        },
        "ResultPath" : "$.code_result",
        "Next" : "CheckGenerateCode"
      },
      "GeneratePythonCode" : {
        "Type" : "Task",
        "Resource" : "arn:aws:states:::lambda:invoke",
        "Parameters" : {
          "FunctionName" : "${aws_lambda_function.generate_python_code.arn}",
          "Payload.$" : "$.extract_result.Payload"
        },
        "ResultPath" : "$.code_result",
        "Next" : "CheckGenerateCode"
      },
      "CheckGenerateCode" : {
        "Type" : "Choice",
        "Choices" : [
          {
            "Variable" : "$.code_result.Payload.statuscode",
            "NumericEquals" : 200,
            "Next" : "SaveAndReturn"
          }
        ],
        "Default" : "SaveAndReturn"
      },
      "UnsupportedLanguage" : {
        "Type" : "Fail",
        "Error" : "UnsupportedLanguage",
        "Cause" : "Only java or python are supported"
      },
      "SaveAndReturn" : {
        "Type" : "Task",
        "Resource" : "arn:aws:states:::lambda:invoke",
        "Parameters" : {
          "FunctionName" : "${aws_lambda_function.save_and_return_data.arn}",
          "Payload.$" : "$"
        },
        "ResultPath" : "$.result",
        "End" : true
      }
    }
  })
}


resource "aws_sfn_state_machine" "generate_code_flow" {
  name       = "generate-code-flow"
  role_arn   = aws_iam_role.sfn_role.arn
  type       = "STANDARD"
  definition = local.sfn_definition
}

# generate_bdd state_machine

locals {
  sfn_bdd_definition = jsonencode({
    Comment = "Generate BDD test flow",
    StartAt = "GenerateBDDTest",
    States = {
      GenerateBDDTest = {
        Type     = "Task",
        Resource = "arn:aws:states:::lambda:invoke",
        Parameters = {
          FunctionName = aws_lambda_function.generate_bdd_teste.arn
          "Payload.$"  = "$"
        },
        ResultPath = "$.bddResult",
        End        = true
      }
    }
  })
}

resource "aws_iam_role_policy" "sfn_bdd_invoke_and_logs" {
  name = "sfn-bdd-invoke"
  role = aws_iam_role.sfn_role.id
  policy = jsonencode({
    Version : "2012-10-17",
    Statement : [
      {
        Effect   = "Allow",
        Action   = ["lambda:InvokeFunction"],
        Resource = [aws_lambda_function.generate_bdd_teste.arn]
      },
      {
        Effect : "Allow",
        Action : [
          "logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery", "logs:ListLogDeliveries",
          "logs:PutResourcePolicy", "logs:DescribeResourcePolicies", "logs:DescribeLogGroups"
        ],
        Resource : "*"
      }
    ]
  })
}

resource "aws_sfn_state_machine" "generate_bdd_flow" {
  name       = "generate-bdd-flow"
  role_arn   = aws_iam_role.sfn_role.arn
  type       = "STANDARD"
  definition = local.sfn_bdd_definition
}


# Lambda permissions for Step Functions
resource "aws_lambda_permission" "allow_sfn_extract" {
  statement_id  = "AllowSFNExtract"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.extract_content_data.arn
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.generate_code_flow.arn
}


resource "aws_lambda_permission" "allow_sfn_bdd_test" {
  statement_id  = "AllowSFNBDDTest"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.generate_bdd_teste.arn
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.generate_bdd_flow.arn
}

resource "aws_lambda_permission" "allow_sfn_java" {
  statement_id  = "AllowSFNJava"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.generate_java_code.arn
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.generate_code_flow.arn
}

resource "aws_lambda_permission" "allow_sfn_python" {
  statement_id  = "AllowSFNPython"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.generate_python_code.arn
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.generate_code_flow.arn
}

resource "aws_lambda_permission" "allow_sfn_save" {
  statement_id  = "AllowSFNSave"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.save_and_return_data.arn
  principal     = "states.amazonaws.com"
  source_arn    = aws_sfn_state_machine.generate_code_flow.arn
}


# API Gateway HTTP API

resource "aws_apigatewayv2_api" "api" {
  name          = "generate-code-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "trigger_integration" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.stepfunction_trigger.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "generate_code_route" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /generate_code"
  target    = "integrations/${aws_apigatewayv2_integration.trigger_integration.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

# Permission API → Lambda
resource "aws_lambda_permission" "allow_apigw" {
  statement_id  = "AllowInvokeFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.stepfunction_trigger.arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "bdd_trigger_integration" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.stepfunction_bdd_trigger.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "generate_bdd_route" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /generate_bdd"
  target    = "integrations/${aws_apigatewayv2_integration.bdd_trigger_integration.id}"
}

resource "aws_lambda_permission" "allow_apigw_bdd" {
  statement_id  = "AllowInvokeFromAPIGatewayBDD"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.stepfunction_bdd_trigger.arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}