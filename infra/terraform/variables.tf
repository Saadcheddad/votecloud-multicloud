variable "compartment_ocid" {
  description = "OCID du compartiment Oracle Cloud (root ou projet)"
  type        = string
}

variable "oci_region" {
  description = "Région Oracle Cloud OCI (Morocco West Casablanca)"
  type        = string
  default     = "af-casablanca-1"
}

variable "ssh_public_key" {
  description = "Clé publique SSH autorisée sur les 2 VMs Ubuntu OCI"
  type        = string
}
