# --- ECR: the web image ----------------------------------------------------------

resource "aws_ecr_repository" "web" {
  name                 = "${var.name}-web"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "web" {
  repository = aws_ecr_repository.web.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# --- EFS: SYSTEMDNA_DATA_DIR (connected repos, graphs, run patches) -------------------
# Survives task restarts and deploys. The app writes it as the image's `node` user (1000).

resource "aws_efs_file_system" "data" {
  encrypted        = true
  performance_mode = "generalPurpose"
  throughput_mode  = "elastic"
  tags             = { Name = "${var.name}-data" }

  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS"
  }
}

resource "aws_efs_mount_target" "data" {
  count           = length(aws_subnet.private)
  file_system_id  = aws_efs_file_system.data.id
  subnet_id       = aws_subnet.private[count.index].id
  security_groups = [aws_security_group.efs.id]
}

resource "aws_efs_access_point" "data" {
  file_system_id = aws_efs_file_system.data.id

  posix_user {
    uid = 1000
    gid = 1000
  }

  root_directory {
    path = "/systemdna"
    creation_info {
      owner_uid   = 1000
      owner_gid   = 1000
      permissions = "0750"
    }
  }
}

resource "aws_efs_backup_policy" "data" {
  file_system_id = aws_efs_file_system.data.id
  backup_policy {
    status = "ENABLED"
  }
}

# --- Secrets ------------------------------------------------------------------------
# One JSON secret. Terraform only writes empty placeholders so the task can start
# (the app treats empty as "not set" and shows Bob / GitHub as skipped). Put the real
# values in with scripts/set-app-env.sh; they never enter Terraform state.

locals {
  secret_keys = ["BOB_API_KEY", "GITHUB_TOKEN", "GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY"]
}

resource "aws_secretsmanager_secret" "app" {
  # Unique suffix per create, so a rebuild never clashes with a secret pending deletion.
  name_prefix             = "${var.name}/app-"
  description             = "SystemDNA web app credentials (Bob, GitHub)"
  recovery_window_in_days = 0 # values live in infra/.env
}

resource "aws_secretsmanager_secret_version" "app_placeholder" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({ for k in local.secret_keys : k => "" })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
