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
  import * as codebuild from 'aws-cdk-lib/aws-codebuild';
  import { Platform } from "@aws-cdk/aws-amplify-alpha";
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

      const amplifyYamlAdmin = yaml.parse(` 
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
            appRoot: frontendAdmin
      `);
  
      const username = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        "DSA-owner-name"
      );

      const amplifyApp = new App(this, `${id}-amplifyApp`, {
        appName: `${id}-public`,
        platform: Platform.WEB_COMPUTE,
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
        environmentVariables: {
          NEXT_PUBLIC_AWS_REGION: this.region,
          NEXT_PUBLIC_COGNITO_USER_POOL_ID: apiStack.getUserPoolId(),
          NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID: apiStack.getUserPoolClientId(),
          NEXT_PUBLIC_API_ENDPOINT: apiStack.getEndpointUrl(),
          NEXT_PUBLIC_IDENTITY_POOL_ID: apiStack.getIdentityPoolId(),
          NEXT_PUBLIC_GRAPHQL_WS_URL: this.createGraphQLWebSocketUrl(
            apiStack.getEventApiUrl(),
            apiStack.getEventApiKey(),
          ),
          AMPLIFY_DIFF_DEPLOY: "false",
          AMPLIFY_MONOREPO_APP_ROOT: "frontend",

        },
        buildSpec: BuildSpec.fromObjectToYaml(amplifyYaml),
      });

      amplifyApp.addCustomRule({
        source: '/<*>',
        target: '	/index.html',
        status: RedirectStatus.NOT_FOUND_REWRITE ,
      });

      

      const amplifyAppAdmin = new App(this, `${id}-amplifyAppAdmin`, {
        appName: `${id}-admin`,
        platform: Platform.WEB_COMPUTE,
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
        environmentVariables: {
          NEXT_PUBLIC_AWS_REGION: this.region,
          NEXT_PUBLIC_COGNITO_USER_POOL_ID: apiStack.getUserPoolId(),
          NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID: apiStack.getUserPoolClientId(),
          NEXT_PUBLIC_API_ENDPOINT: apiStack.getEndpointUrl(),
          NEXT_PUBLIC_IDENTITY_POOL_ID: apiStack.getIdentityPoolId(),
          AMPLIFY_DIFF_DEPLOY: "false",
          AMPLIFY_MONOREPO_APP_ROOT: "frontendAdmin",
        },
        buildSpec: BuildSpec.fromObjectToYaml(amplifyYamlAdmin),
      });

      amplifyAppAdmin.addCustomRule({
        source: '/<*>',
        target: '	/index.html',
        status: RedirectStatus.NOT_FOUND_REWRITE ,
      });
  
      amplifyApp.addBranch("main");
      amplifyAppAdmin.addBranch("main");
      amplifyApp.addBranch("phase2");
      amplifyAppAdmin.addBranch("phase2");
    }
    private createGraphQLWebSocketUrl(apiUrl: string, apiKey: string): string {
      // Extract the hostname from the API URL
      const url = new URL(apiUrl);
      const host = url.hostname; // Extracts the hostname, e.g., "f3274umsvbezxkugpmex7mcawa.appsync-realtime-api.ca-central-1.amazonaws.com"
    
      const header = {
        host: host,
        "x-api-key": apiKey,
      };
    
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64");
      const payload = "e30="; // Base64-encoded empty JSON object {}
    
      return `${apiUrl}?header=${encodedHeader}&payload=${payload}`;
    }
  }