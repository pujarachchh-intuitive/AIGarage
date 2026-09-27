resource "aws_lb" "main" {
  name               = var.name
  load_balancer_type = "application"
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.alb.id]
  # Change runs and repo ingestion stream progress over one long HTTP response.
  idle_timeout               = var.alb_idle_timeout
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "web" {
  name        = "${var.name}-web"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  # Let an in-flight change run finish before a task is replaced (Fargate caps stopTimeout at 120s).
  deregistration_delay = 120

  health_check {
    path                = "/api/github/status"
    matcher             = "200"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }
}

# --- Certificate for the custom domain (DNS hosted outside Route 53) ---------------------
# Two applies: the first requests the certificate and outputs the validation CNAME to add
# at your DNS provider; after it resolves, set certificate_validated = true and apply again.

resource "aws_acm_certificate" "app" {
  count             = var.domain_name != "" ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "app" {
  count           = var.domain_name != "" && var.certificate_validated ? 1 : 0
  certificate_arn = aws_acm_certificate.app[0].arn

  timeouts {
    create = "30m"
  }
}

locals {
  certificate_arn = (
    var.certificate_arn != "" ? var.certificate_arn :
    length(aws_acm_certificate_validation.app) > 0 ? aws_acm_certificate_validation.app[0].certificate_arn : ""
  )
  # Decided from variables only, so count/for_each stay known at plan time.
  https = var.certificate_arn != "" || (var.domain_name != "" && var.certificate_validated)
}

# HTTP: serve directly when there is no certificate, otherwise redirect to HTTPS.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = local.https ? "redirect" : "forward"
    target_group_arn = local.https ? null : aws_lb_target_group.web.arn

    dynamic "redirect" {
      for_each = local.https ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = local.https ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = local.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}
