variable "name" {
  description = "Name prefix for every resource."
  type        = string
  default     = "systemdna"
}

variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-south-1"
}

variable "vpc_cidr" {
  description = "CIDR for the VPC. Two public and two private /20 subnets are carved from it."
  type        = string
  default     = "10.40.0.0/16"
}

variable "image_tag" {
  description = "Tag of the web image in ECR to run. deploy.sh pushes the git SHA and records it in image.auto.tfvars. \"latest\" only matters before the first deploy."
  type        = string
  default     = "latest"
}

variable "task_cpu" {
  description = "Fargate task CPU units. The scanner and tsc checks are CPU-heavy on big repos."
  type        = number
  default     = 2048
}

variable "task_memory" {
  description = "Fargate task memory (MiB)."
  type        = number
  default     = 8192
}

variable "ephemeral_storage_gib" {
  description = "Task scratch disk for repo clones (os.tmpdir). 21-200 GiB."
  type        = number
  default     = 50
}

variable "desired_count" {
  description = "Tasks to start with. Autoscaling owns the count afterwards (between min_count and max_count)."
  type        = number
  default     = 2
}

variable "min_count" {
  type    = number
  default = 1
}

variable "max_count" {
  type    = number
  default = 3
}

variable "cpu_target_percent" {
  description = "Average task CPU that autoscaling aims for. Scans and tsc checks are the CPU-heavy work."
  type        = number
  default     = 60
}

variable "domain_name" {
  description = "Custom domain for the app (e.g. systemdna.example.com). Terraform requests an ACM certificate for it; DNS is managed outside AWS."
  type        = string
  default     = ""
}

variable "certificate_validated" {
  description = "Set true after the ACM validation CNAME (output certificate_validation_records) is live in DNS. Turns on HTTPS."
  type        = bool
  default     = false
}

variable "certificate_arn" {
  description = "Use an existing ACM certificate instead of domain_name. Empty = none."
  type        = string
  default     = ""
}

variable "allowed_cidrs" {
  description = "Who may reach the load balancer. Narrow this for a private demo."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "alb_idle_timeout" {
  description = "Seconds the ALB keeps a quiet connection open. Change runs stream for up to ~10 minutes."
  type        = number
  default     = 3600
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "budget_email" {
  description = "Email for the monthly cost alert. Empty = no budget."
  type        = string
  default     = ""
}

variable "budget_limit_usd" {
  type    = number
  default = 100
}
