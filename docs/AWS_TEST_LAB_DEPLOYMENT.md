# AWS Test Lab image publishing

This branch prepares the E-commerce application for the isolated DCC Test Lab in AWS `us-east-1`.

## What the workflow does

The manual GitHub Actions workflow `.github/workflows/testlab-ecr.yml` builds two images from this repository and pushes them to the private ECR repository `dcc-testlab-use1-ecommerce`:

- Backend: `backend-<commit-sha>`
- Frontend: `frontend-<commit-sha>`

The frontend is built with an empty `VITE_API_URL`, so production requests and relative `/uploadimage` image paths use the same ALB origin. The ALB sends `/api/*`, `/health`, and `/uploadimage*` to the backend and all other paths to the Nginx frontend.

The workflow only publishes images. It does not create AWS infrastructure, update ECS, or start application services.

## One-time AWS/GitHub setup

1. In AWS IAM, create the GitHub OIDC identity provider if it does not already exist:
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
2. Create a dedicated IAM role for this repository. Restrict its trust policy to:
   - Audience: `sts.amazonaws.com`
   - Subject: `repo:faredmansour/ecommerce-project:ref:refs/heads/feat/aws-testlab-deployment`
   - Federated principal: `arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com`
3. Attach a policy granting `ecr:GetAuthorizationToken` on `*`, and these image upload actions only on `arn:aws:ecr:us-east-1:<AWS_ACCOUNT_ID>:repository/dcc-testlab-use1-ecommerce`:
   - `ecr:BatchCheckLayerAvailability`
   - `ecr:InitiateLayerUpload`
   - `ecr:UploadLayerPart`
   - `ecr:CompleteLayerUpload`
   - `ecr:PutImage`
4. Add the IAM role ARN to this repository's **Settings → Secrets and variables → Actions → Variables** as `AWS_ROLE_ARN`.
5. Open **Actions → Build and push E-commerce images to Test Lab ECR → Run workflow**.

No long-lived AWS access keys are required. Do not add MongoDB Atlas URI, JWT secret, or any other application secret to GitHub variables or image build arguments.

## After publishing

Copy the exact image tags from the workflow summary into the local, uncommitted `terraform.tfvars` in the DCC Test Lab root:

- `ecommerce_backend_image_tag = "backend-<commit-sha>"`
- `ecommerce_frontend_image_tag = "frontend-<commit-sha>"`

Then populate the Atlas URI and JWT signing secret in AWS Secrets Manager. ECS services remain at desired count zero until the DCC Test Lab's `enable_application_services` is explicitly set to true and an approved infrastructure deployment is performed.

## Test-only limitations

- The backend's `uploadimage` directory is ephemeral on ECS; uploaded files can be lost when a task is replaced.
- HTTP is for restricted test access only. Do not use this setup as a production security baseline.
- Redis is intentionally not configured; the backend starts without it unless `REDIS_URL` is supplied.
