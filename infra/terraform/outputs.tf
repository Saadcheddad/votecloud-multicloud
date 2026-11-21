output "iaas1_gcp_auth_ip" {
  description = "Adresse IP publique de IaaS #1 (GCP Compute Engine - backend-auth)"
  value       = google_compute_instance.gcp_auth_vm.network_interface[0].access_config[0].nat_ip
}

output "iaas1_gcp_auth_url" {
  description = "URL HTTP de IaaS #1 (à renseigner dans Render : AUTH_SERVICE_URL)"
  value       = "http://${google_compute_instance.gcp_auth_vm.network_interface[0].access_config[0].nat_ip}"
}

output "iaas2_aws_audit_ip" {
  description = "Adresse IP publique de IaaS #2 (AWS EC2 - backend-audit)"
  value       = aws_instance.aws_audit_ec2.public_ip
}

output "iaas2_aws_audit_url" {
  description = "URL HTTP de IaaS #2 (à renseigner dans GCP/Lambda/Render : AUDIT_SERVICE_URL)"
  value       = "http://${aws_instance.aws_audit_ec2.public_ip}"
}

output "faas1_aws_lambda_url" {
  description = "URL HTTPS publique de FaaS #1 (AWS Lambda Function URL - à renseigner dans Render : FAAS_VOTE_URL)"
  value       = aws_lambda_function_url.faas_vote_url.function_url
}
