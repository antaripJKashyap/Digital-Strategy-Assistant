import * as lambda from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { DatabaseStack } from "../database-stack";
import { LayerVersion } from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Role } from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export const createLambdaFunctions = (
  scope: Construct,
  vpc: Vpc,
  db: DatabaseStack,
  userPoolId: string,
  apiRestApiId: string,
  region: string,
  account: string,
  postgresLayer: LayerVersion,
  jwtLayer: LayerVersion,
  lambdaRole: Role,
  coglambdaRole: Role,
  secret: secretsmanager.ISecret
) => {
  const lambdaUserFunction = new lambda.Function(scope, "userFunction", {
    runtime: lambda.Runtime.NODEJS_20_X,
    code: lambda.Code.fromAsset("lambda/lib"),
    handler: "userFunction.handler",
    timeout: Duration.seconds(300),
    vpc: vpc,
    environment: {
      SM_DB_CREDENTIALS: db.secretPathUser.secretName,
      RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
      USER_POOL: userPoolId,
    },
    functionName: "userFunction",
    memorySize: 512,
    layers: [postgresLayer],
    role: lambdaRole,
  });

  const cfnLambda_user = lambdaUserFunction.node.defaultChild as lambda.CfnFunction;
  cfnLambda_user.overrideLogicalId("userFunction");

  lambdaUserFunction.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${region}:${account}:${apiRestApiId}/*/*/user*`,
  });

  const lambdaAdminFunction = new lambda.Function(scope, "adminFunction", {
    runtime: lambda.Runtime.NODEJS_20_X,
    code: lambda.Code.fromAsset("lambda/adminFunction"),
    handler: "adminFunction.handler",
    timeout: Duration.seconds(300),
    vpc: vpc,
    environment: {
      SM_DB_CREDENTIALS: db.secretPathTableCreator.secretName,
      RDS_PROXY_ENDPOINT: db.rdsProxyEndpointTableCreator,
    },
    functionName: "adminFunction",
    memorySize: 512,
    layers: [postgresLayer],
    role: lambdaRole,
  });

  const cfnLambda_Admin = lambdaAdminFunction.node.defaultChild as lambda.CfnFunction;
  cfnLambda_Admin.overrideLogicalId("adminFunction");

  lambdaAdminFunction.addPermission("AllowApiGatewayInvoke", {
    principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    action: "lambda:InvokeFunction",
    sourceArn: `arn:aws:execute-api:${region}:${account}:${apiRestApiId}/*/*/admin*`,
  });

  const AutoSignupLambda = new lambda.Function(scope, "addAdminOnSignUp", {
    runtime: lambda.Runtime.NODEJS_20_X,
    code: lambda.Code.fromAsset("lambda/lib"),
    handler: "addAdminOnSignUp.handler",
    timeout: Duration.seconds(300),
    environment: {
      SM_DB_CREDENTIALS: db.secretPathTableCreator.secretName,
      RDS_PROXY_ENDPOINT: db.rdsProxyEndpointTableCreator,
    },
    vpc: vpc,
    functionName: "addAdminOnSignUp",
    memorySize: 128,
    layers: [postgresLayer],
    role: coglambdaRole,
  });

  const updateTimestampLambda = new lambda.Function(scope, "updateTimestampLambda", {
    runtime: lambda.Runtime.NODEJS_20_X,
    code: lambda.Code.fromAsset("lambda/lib"),
    handler: "updateLastSignIn.handler",
    timeout: Duration.seconds(300),
    environment: {
      SM_DB_CREDENTIALS: db.secretPathTableCreator.secretName,
      RDS_PROXY_ENDPOINT: db.rdsProxyEndpointTableCreator,
    },
    vpc: vpc,
    functionName: "updateLastSignIn",
    memorySize: 128,
    layers: [postgresLayer],
    role: coglambdaRole,
  });

  const authorizationFunction = new lambda.Function(scope, "admin-authorization-api-gateway", {
    runtime: lambda.Runtime.NODEJS_20_X,
    code: lambda.Code.fromAsset("lambda/adminAuthorizerFunction"),
    handler: "adminAuthorizerFunction.handler",
    timeout: Duration.seconds(300),
    vpc: vpc,
    environment: {
      SM_COGNITO_CREDENTIALS: secret.secretName,
    },
    functionName: "adminLambdaAuthorizer",
    memorySize: 512,
    layers: [jwtLayer],
    role: lambdaRole,
  });

  authorizationFunction.grantInvoke(new iam.ServicePrincipal("apigateway.amazonaws.com"));

  return {
    lambdaUserFunction,
    lambdaAdminFunction,
    AutoSignupLambda,
    updateTimestampLambda,
    authorizationFunction,
  };
};