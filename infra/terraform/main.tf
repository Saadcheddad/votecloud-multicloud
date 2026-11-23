# ==============================================================================
# VoteCloud - Infrastructure-as-Code Multicloud (Terraform — Oracle Cloud OCI)
# Provisionne :
#   - Réseau VCN + Subnet Public + Security List (ports 22, 80, 443 + Egress)
#   - IaaS #1 : OCI Compute VM #1 (backend-auth, VM.Standard.A1.Flex Always Free)
#   - IaaS #2 : OCI Compute VM #2 (backend-audit, VM.Standard.A1.Flex Always Free)
# (PaaS #1 Supabase, PaaS #2 Render et FaaS #1 Vercel sont gérés sans OS via Git/Blueprint)
# ZERO ressource Azure, AWS ou GCP.
# ==============================================================================

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
}

provider "oci" {
  region = var.oci_region
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_ocid
}

data "oci_core_images" "ubuntu_2204_arm" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

# ==============================================================================
# 1. Réseau VCN + Internet Gateway + Security List (Ports 22, 80, 443)
# ==============================================================================
resource "oci_core_vcn" "votecloud_vcn" {
  compartment_id = var.compartment_ocid
  cidr_block     = "10.0.0.0/16"
  display_name   = "votecloud-vcn"
}

resource "oci_core_internet_gateway" "votecloud_igw" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.votecloud_vcn.id
  display_name   = "votecloud-igw"
  enabled        = true
}

resource "oci_core_route_table" "votecloud_rt" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.votecloud_vcn.id
  display_name   = "votecloud-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.votecloud_igw.id
  }
}

resource "oci_core_security_list" "votecloud_seclist" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.votecloud_vcn.id
  display_name   = "votecloud-public-seclist"

  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }

  dynamic "ingress_security_rules" {
    for_each = [22, 80, 443]
    content {
      protocol = "6" # TCP
      source   = "0.0.0.0/0"
      tcp_options {
        min = ingress_security_rules.value
        max = ingress_security_rules.value
      }
    }
  }
}

resource "oci_core_subnet" "votecloud_subnet" {
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.votecloud_vcn.id
  cidr_block        = "10.0.0.0/24"
  display_name      = "votecloud-public-subnet"
  route_table_id    = oci_core_route_table.votecloud_rt.id
  security_list_ids = [oci_core_security_list.votecloud_seclist.id]
}

# ==============================================================================
# 2. IaaS #1 : OCI Compute VM #1 (backend-auth — Always Free A1.Flex)
# ==============================================================================
resource "oci_core_instance" "oci_auth_iaas" {
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = "votecloud-oci-auth-iaas"
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = 1
    memory_in_gbs = 6
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu_2204_arm.images[0].id
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.votecloud_subnet.id
    assign_public_ip = true
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
  }
}

# ==============================================================================
# 3. IaaS #2 : OCI Compute VM #2 (backend-audit — Always Free A1.Flex)
# ==============================================================================
resource "oci_core_instance" "oci_audit_iaas" {
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = "votecloud-oci-audit-iaas"
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = 1
    memory_in_gbs = 6
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu_2204_arm.images[0].id
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.votecloud_subnet.id
    assign_public_ip = true
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
  }
}
