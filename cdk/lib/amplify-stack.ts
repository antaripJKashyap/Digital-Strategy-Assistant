import {
    App,
    BasicAuth,
    GitHubSourceCodeProvider,
    RedirectStatus,
  } from "@aws-cdk/aws-amplify-alpha";
  import * as cdk from "aws-cdk-lib";
  import { BuildSpec } from "aws-cdk-lib/aws-codebuild";
  import { Construct } from "constructs";
  import * as yaml from "yaml";
  import { ApiGatewayStack } from "./api-gateway-stack";
  
  export class AmplifyStack extends cdk.Stack {
    constructor(
      scope: Construct,
      id: string,
      apiStack: ApiGatewayStack,
      props?: cdk.StackProps
    ) {
      super(scope, id, props);
  
      // Define the GitHub repository name as a parameter
      const githubRepoName = new cdk.CfnParameter(this, "githubRepoName", {
        type: "String",
        description: "The name of the GitHub repository",
      }).valueAsString;
  
      const amplifyYaml = yaml.parse(` 
        version: 1
        applications:
          - frontend:
              phases:
                preBuild:
                  commands:
                    - npm ci --cache .npm --prefer-offline
                build:
                  commands:
                    - npm run build
              artifacts:
                baseDirectory: .next
                files:
                  - '**/*'
              cache:
                paths:
                  - .next/cache/**/*
                  - .npm/**/*
            appRoot: frontend
      `);
  
      const username = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        "dls-owner-name"
      );
  
      const amplifyApp = new App(this, "amplifyApp", {
        appName: "dls-amplify",
        sourceCodeProvider: new GitHubSourceCodeProvider({
          owner: username,
          repository: githubRepoName,
          oauthToken: cdk.SecretValue.secretsManager(
            "github-personal-access-token",
            {
              jsonField: "my-github-token",
            }
          ),
        }),
        // customRules: [
        //   {
        //     source: '</^[^.]+$|.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>',
        //     target: '/',
        //     status: RedirectStatus.NOT_FOUND_REWRITE,
        //   },
        // ],
        environmentVariables: {
          NEXT_PUBLIC_AWS_REGION: this.region,
          NEXT_PUBLIC_COGNITO_USER_POOL_ID: apiStack.getUserPoolId(),
          NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID: apiStack.getUserPoolClientId(),
          NEXT_PUBLIC_API_ENDPOINT: apiStack.getEndpointUrl(),
          NEXT_PUBLIC_IDENTITY_POOL_ID: apiStack.getIdentityPoolId(),
        },
        buildSpec: BuildSpec.fromObjectToYaml(amplifyYaml),
      });
  
      amplifyApp.addBranch("main");
      amplifyApp.addBranch("dev");
      amplifyApp.addBranch("frontend");
    }
  }