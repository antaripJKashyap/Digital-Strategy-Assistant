#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { Tags } from "aws-cdk-lib";
import { AmplifyStack } from "../lib/amplify-stack";
import { ApiGatewayStack } from "../lib/api-gateway-stack";
import { DatabaseStack } from "../lib/database-stack";
import { VpcStack } from "../lib/vpc-stack";
import { DBFlowStack } from "../lib/dbFlow-stack";
const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const VpcStackName = app.node.tryGetContext("VpcStackName");
const DatabaseStackName = app.node.tryGetContext("DatabaseStackName");
const ApiStackName = app.node.tryGetContext("ApiStackName");
const DbFlowStackName = app.node.tryGetContext("DbFlowStackName");
const AmplifyStackName = app.node.tryGetContext("AmplifyStackName");
const vpcStack = new VpcStack(app, "VpcStack", {
  env,
  stackName: VpcStackName,
});
const dbStack = new DatabaseStack(app, "Database", vpcStack, {
  env,
  stackName: DatabaseStackName,
});
const apiStack = new ApiGatewayStack(app, "Api", dbStack, vpcStack, {
  env,
  stackName: ApiStackName,
});
const dbFlowStack = new DBFlowStack(
  app,
  "DBFlow",
  vpcStack,
  dbStack,
  apiStack,
  { env, stackName: DbFlowStackName }
);
const amplifyStack = new AmplifyStack(app, "Amplify", apiStack, {
  env,
  stackName: AmplifyStackName,
});
Tags.of(app).add("app", "Digital-Strategy-Assistant");
