output "generate_code_api_url" {
  description = "Invoke URL for POST /generate_code"
  value       = "${aws_apigatewayv2_stage.default.invoke_url}/generate_code"
}

output "state_machine_arn" {
  value = aws_sfn_state_machine.generate_code_flow.arn
}
