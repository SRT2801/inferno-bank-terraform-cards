module "lambda_shared" {
  source = "./modules/shared"
}



module "create-request-card-lambda"  {
    source = "./modules/cards"

   lambda_role_arn = module.lambda_shared.lambda_role_arn
}
