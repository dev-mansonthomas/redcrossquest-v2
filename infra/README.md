# RCQ V2 Infrastructure

Terraform configuration for deploying RedCrossQuest V2 on Google Cloud Platform.

## Architecture

This infrastructure deploys:

- **Cloud Run Services**:
  - `rcq_superset`: Apache Superset analytics platform
  - `rcq_api`: FastAPI backend
  - `rcq_frontend`: Angular 21 frontend
- **Cloud SQL**: MySQL 8 database (existing instance)
- **Secret Manager**: Secure storage for:
  - Database credentials
  - OAuth client secrets
  - Superset secret key
- **IAM**: Service accounts and permissions for inter-service communication

## Prerequisites

1. **GCP Access**: Admin access to projects `rcq-fr-dev`, `rcq-fr-test`, `rcq-fr-prod`
2. **Terraform**: Version 1.5 or higher`# macOSbrew install terraform

# Or download from: [[https://www.terraform.io/downloads`](https://www.terraform.io/downloads%60)](https://www.terraform.io/downloads%60%5D(https://www.terraform.io/downloads%60))

1. **GCP CLI**: Authenticated and configured`gcloud auth application-default login gcloud config set project rcq-fr-dev`
2. **GCS Bucket for State**: Create a bucket for Terraform state`gsutil mb -p rcq-fr-dev -l europe-west1 gs://rcq-terraform-state-dev gsutil versioning set on gs://rcq-terraform-state-dev`
3. **Cloud SQL Instance**: Ensure the MySQL instance exists and note its connection name
4. **Superset**: See `superset/README.md` for setup instructions

## Directory Structure

```
infra/
├── main.tf              # Main Terraform configuration
├── variables.tf         # Variable definitions
├── outputs.tf           # Output values
├── env/                 # Environment-specific variables
│   ├── dev.tfvars
│   ├── test.tfvars
│   └── prod.tfvars
└── modules/
    ├── cloud_run/       # Cloud Run service module
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    └── iam/             # IAM permissions module
        ├── main.tf
        └── variables.tf
```

## Deployment

### Initial Setup

1. **Update Cloud SQL connection name** in `env/*.tfvars`:`# Get your Cloud SQL instance connection namegcloud sql instances describe rcq-mysql-instance --format="value(connectionName)"

# Update in env/dev.tfvars, env/test.tfvars, env/prod.tfvars

cloud_sql_connection_name = "rcq-fr-dev:europe-west1:rcq-mysql-instance"` 2. **Initialize Terraform**:`cd infraterraform init -backend-config="bucket=rcq-terraform-state-dev"` 3. **Create workspace** (optional, for managing multiple environments):`terraform workspace new devterraform workspace new testterraform workspace new prod`

### Deploy to Development

1. **Review the plan**:`terraform plan -var-file=env/dev.tfvars`
2. **Apply the configuration**:`terraform apply -var-file=env/dev.tfvars`
3. **Store secrets** in Secret Manager:`# Superset secret key (generate a random key)openssl rand -base64 32 | gcloud secrets versions add rcq_superset_secret_key_dev --data-file=-

# API DB credentials

echo -n 'rcq_api_user' | gcloud secrets versions add rcq_api_db_user_dev --data-file=-echo -n 'YOUR_API_PASSWORD' | gcloud secrets versions add rcq_api_db_password_dev --data-file=-

# Google OAuth credentials

echo -n 'YOUR_CLIENT_ID' | gcloud secrets versions add rcq_google_oauth_client_id_dev --data-file=-echo -n 'YOUR_CLIENT_SECRET' | gcloud secrets versions add rcq_google_oauth_client_secret_dev --data-file=-` 4. **Get service URLs**:`terraform output`

### Deploy to Test/Production

Same process as dev, but use the appropriate tfvars file and backend bucket:

```bash
# Test
terraform init -backend-config="bucket=rcq-terraform-state-test"
terraform plan -var-file=env/test.tfvars
terraform apply -var-file=env/test.tfvars

# Production
terraform init -backend-config="bucket=rcq-terraform-state-prod"
terraform plan -var-file=env/prod.tfvars
terraform apply -var-file=env/prod.tfvars
```

## Resource Naming Convention

All resources follow the naming convention:

- **Prefix**: `rcq_` (RedCrossQuest)
- **Labels**: `app=rcq`, `environment=dev|test|prod`

Examples:

- Cloud Run: `rcq_superset`, `rcq_api`, `rcq_frontend`
- Secrets: `rcq_superset_secret_key_dev`, `rcq_api_db_password_prod`
- Service Accounts: `rcq-superset-sa`, `rcq-api-sa`

## Outputs

After deployment, Terraform outputs:

- `superset_url`: Superset service URL
- `api_url`: API service URL
- `frontend_url`: Frontend service URL
- Service account emails for each service

## Updating Infrastructure

1. Modify Terraform files
2. Run `terraform plan` to review changes
3. Run `terraform apply` to apply changes

## Destroying Resources

⚠️ **WARNING**: This will delete all Cloud Run services and secrets. The GCP project itself is never deleted.

```bash
terraform destroy -var-file=env/dev.tfvars
```

## Troubleshooting

### Cloud SQL Connection Issues

- Verify the connection name is correct
- Ensure Cloud SQL Admin API is enabled
- Check service account has `cloudsql.client` role

### Secret Access Issues

- Verify secrets exist in Secret Manager
- Check service account has `secretmanager.secretAccessor` role
- Ensure secret names match the environment suffix

### Permission Denied

- Verify you're authenticated: `gcloud auth application-default login`
- Check you have necessary IAM roles in the GCP project
- Ensure APIs are enabled: Cloud Run, Secret Manager, Cloud SQL Admin

## Security Notes

- All secrets are stored in Secret Manager, never in code
- Service accounts follow principle of least privilege
- Cloud SQL connections use private IP when possible
- All resources are tagged for easy identification and cost tracking

## Next Steps

After infrastructure is deployed:

1. Build and push Docker images for each service
2. Update image tags in tfvars files
3. Re-run `terraform apply` to deploy new images
4. Configure Superset dashboards
5. Set up CI/CD pipeline for automated deployments