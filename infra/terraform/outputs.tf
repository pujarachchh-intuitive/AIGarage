output "app_url" {
  description = "Open this in a browser."
  value       = "${local.https ? "https" : "http"}://${var.domain_name != "" ? var.domain_name : aws_lb.main.dns_name}"
}

output "certificate_validation_records" {
  description = "Add these CNAMEs at your DNS provider so ACM can issue the certificate."
  value = [for o in flatten(aws_acm_certificate.app[*].domain_validation_options) : {
    name  = o.resource_record_name
    type  = o.resource_record_type
    value = o.resource_record_value
  }]
}

output "domain_cname" {
  description = "Point your domain at the load balancer with this CNAME."
  value = var.domain_name == "" ? null : {
    name  = var.domain_name
    type  = "CNAME"
    value = aws_lb.main.dns_name
  }
}

output "alb_dns_name" {
  description = "Point your domain's CNAME / alias record here."
  value       = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.web.repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service" {
  value = aws_ecs_service.web.name
}

output "app_secret_id" {
  description = "Fill with scripts/set-app-env.sh."
  value       = aws_secretsmanager_secret.app.name
}

output "log_group" {
  value = aws_cloudwatch_log_group.web.name
}
