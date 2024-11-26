import * as iam from "aws-cdk-lib/aws-iam";
import { Role } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export const createLambdaRole = (scope: Construct, roleName: string) => {
  const lambdaRole = new iam.Role(scope, roleName, {
    assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
  });

  lambdaRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "secretsmanager:GetSecretValue",
        "ec2:CreateNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DeleteNetworkInterface",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
      ],
      resources: ["*"],
    })
  );

  return lambdaRole;
};
