# ==============================================================================
# VoteCloud - Infrastructure-as-Code Multicloud (Terraform)
# Provisionne :
#   - IaaS #1 : GCP Compute Engine e2-micro (Always Free : us-central1-a, pd-standard)
#   - IaaS #2 : AWS EC2 t3.micro (Free Tier : eu-west-3, Ubuntu 24.04)
#   - FaaS #1 : AWS Lambda Node.js 20.x + Function URL HTTPS (Always Free)
# (PaaS #1 Supabase & PaaS #2 Render sont déployés sans gestion d'OS via Blueprint/Console)
# ZERO ressource Azure.
# ==============================================================================

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.40"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
  zone    = var.gcp_zone
}

provider "aws" {
  region = var.aws_region
}

# ==============================================================================
# 1. IaaS #1 : Google Cloud Compute Engine (Always Free e2-micro)
# ==============================================================================
resource "google_compute_firewall" "votecloud_auth_fw" {
  name    = "votecloud-allow-http-https"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["votecloud-auth"]
}

resource "google_compute_instance" "gcp_auth_vm" {
  name         = "votecloud-gcp-auth-iaas"
  machine_type = "e2-micro" # Eligible GCP Always Free
  zone         = var.gcp_zone
  tags         = ["votecloud-auth", "http-server", "https-server"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 30            # Jusqu'à 30 Go gratuits Always Free
      type  = "pd-standard" # IMPORTANT : pd-standard est gratuit (pd-balanced est payant !)
    }
  }

  network_interface {
    network = "default"
    access_config {
      # IP publique éphémère (standard)
    }
  }

  metadata_startup_script = <<-EOT
    #!/bin/bash
    apt-get update -y
    apt-get install -y git curl nginx ufw
  EOT

  labels = {
    project = "votecloud"
    role    = "iaas-1-auth"
  }
}

# ==============================================================================
# 2. IaaS #2 : Amazon EC2 (Free Tier t3.micro - Ubuntu 24.04)
# ==============================================================================
data "aws_ami" "ubuntu_2404" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "votecloud_audit_sg" {
  name        = "votecloud-audit-iaas-sg"
  description = "Pare-feu reseau pour IaaS #2 (AWS EC2 Audit & Tally Node)"

  ingress {
    description = "SSH administration"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_ssh_cidr]
  }

  ingress {
    description = "HTTP Reverse Proxy Nginx"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Acces sortant vers Supabase PaaS et mises a jour"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project = "VoteCloud"
    Role    = "IaaS-2-Audit"
  }
}

resource "aws_instance" "aws_audit_ec2" {
  ami                         = data.aws_ami.ubuntu_2404.id
  instance_type               = var.aws_instance_type
  key_name                    = var.aws_key_pair_name
  vpc_security_group_ids      = [aws_security_group.votecloud_audit_sg.id]
  associate_public_ip_address = true

  root_block_device {
    volume_size = 16
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name    = "votecloud-aws-audit-iaas"
    Project = "VoteCloud"
    Role    = "IaaS-2-Audit"
  }
}

# ==============================================================================
# 3. FaaS #1 : AWS Lambda (Node.js 20.x + Function URL HTTPS - Always Free)
# ==============================================================================
resource "aws_iam_role" "lambda_exec_role" {
  name = "votecloud-faas-vote-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic_logs" {
  role       = aws_iam_role.lambda_exec_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "faas_vote" {
  function_name    = "votecloud-faas-vote"
  role             = aws_iam_role.lambda_exec_role.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = "${path.module}/../../faas-vote/faas-vote.zip"
  source_code_hash = filebase64sha256("${path.module}/../../faas-vote/faas-vote.zip")
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      DATABASE_URL         = var.database_url
      DATABASE_SSL         = "true"
      JWT_SECRET           = var.jwt_secret
      AUDIT_WEBHOOK_SECRET = var.audit_webhook_secret
      AUDIT_SERVICE_URL    = "http://${aws_instance.aws_audit_ec2.public_ip}"
    }
  }

  tags = {
    Project = "VoteCloud"
    Role    = "FaaS-1-VoteProcessor"
  }
}

resource "aws_lambda_function_url" "faas_vote_url" {
  function_name      = aws_lambda_function.faas_vote.function_name
  authorization_type = "NONE" # Sécurisé applicativement par JWT signé GCP + HMAC
}
