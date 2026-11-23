output "iaas1_oci_auth_ip" {
  description = "Adresse IP publique de IaaS #1 (OCI VM #1 - backend-auth)"
  value       = oci_core_instance.oci_auth_iaas.public_ip
}

output "iaas1_oci_auth_url" {
  description = "URL HTTP de IaaS #1 (AUTH_SERVICE_URL dans Render)"
  value       = "http://${oci_core_instance.oci_auth_iaas.public_ip}"
}

output "iaas2_oci_audit_ip" {
  description = "Adresse IP publique de IaaS #2 (OCI VM #2 - backend-audit)"
  value       = oci_core_instance.oci_audit_iaas.public_ip
}

output "iaas2_oci_audit_url" {
  description = "URL HTTP de IaaS #2 (AUDIT_SERVICE_URL dans OCI #1, Vercel et Render)"
  value       = "http://${oci_core_instance.oci_audit_iaas.public_ip}"
}
