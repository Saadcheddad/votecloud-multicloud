variable "gcp_project_id" {
  description = "ID du projet Google Cloud (ex: votecloud-esi-2026)"
  type        = string
}

variable "gcp_region" {
  description = "Région GCP Always Free (us-central1, us-west1 ou us-east1)"
  type        = string
  default     = "us-central1"
}

variable "gcp_zone" {
  description = "Zone GCP Always Free"
  type        = string
  default     = "us-central1-a"
}

variable "aws_region" {
  description = "Région AWS (Paris eu-west-3 ou Irlande eu-west-1)"
  type        = string
  default     = "eu-west-3"
}

variable "aws_instance_type" {
  description = "Type d'instance EC2 Free Tier (t3.micro en eu-west-3)"
  type        = string
  default     = "t3.micro"
}

variable "aws_key_pair_name" {
  description = "Nom de la paire de clés SSH créée dans AWS EC2"
  type        = string
}

variable "admin_ssh_cidr" {
  description = "Plage IP autorisée en SSH (ex: VOTRE_IP/32 ou 0.0.0.0/0 pour démo)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "database_url" {
  description = "URL Session Pooler IPv4 de Supabase PostgreSQL (PaaS #1)"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "Secret JWT partagé entre GCP IaaS et AWS Lambda FaaS"
  type        = string
  sensitive   = true
}

variable "audit_webhook_secret" {
  description = "Secret HMAC partagé avec AWS EC2 Audit Node"
  type        = string
  sensitive   = true
}
