import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import {
  Architecture,
  Code,
  Function,
  LayerVersion,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
//import { VpcStack } from './vpc-stack';
import * as cognito from "aws-cdk-lib/aws-cognito";
import { CfnJson } from "aws-cdk-lib";
import { VpcStack } from "./vpc-stack";
import { DatabaseStack } from "./database-stack";
import { parse, stringify } from "yaml";
import { Fn } from "aws-cdk-lib";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as bedrock from "aws-cdk-lib/aws-bedrock";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { SecretValue } from "aws-cdk-lib";

export class ApiGatewayStack extends cdk.Stack {
  private readonly api: apigateway.SpecRestApi;
  public readonly appClient: cognito.UserPoolClient;
  public readonly userPool: cognito.UserPool;
  public readonly identityPool: cognito.CfnIdentityPool;
  private readonly layerList: { [key: string]: LayerVersion };
  public readonly stageARN_APIGW: string;
  public readonly apiGW_basedURL: string;
  public readonly secret: secretsmanager.ISecret;
  public getEndpointUrl = () => this.api.url;
  public getUserPoolId = () => this.userPool.userPoolId;
  public getUserPoolClientId = () => this.appClient.userPoolClientId;
  public getIdentityPoolId = () => this.identityPool.ref;
  public addLayer = (name: string, layer: LayerVersion) =>
    (this.layerList[name] = layer);
  public getLayers = () => this.layerList;
  constructor(
    scope: Construct,
    id: string,
    db: DatabaseStack,
    vpcStack: VpcStack,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    this.layerList = {};
    // Create the embedding storage bucket
    const embeddingStorageBucket = new s3.Bucket(
      this,
      "EmbeddingStorageBucket",
      {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        cors: [
          {
            allowedHeaders: ["*"],
            allowedMethods: [
              s3.HttpMethods.GET,
              s3.HttpMethods.PUT,
              s3.HttpMethods.HEAD,
              s3.HttpMethods.POST,
              s3.HttpMethods.DELETE,
            ],
            allowedOrigins: ["*"],
          },
        ],
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        enforceSSL: true,
        autoDeleteObjects: true,
      }
    );

    // Create the data ingestion bucket
    const dataIngestionBucket = new s3.Bucket(this, "DataIngestionBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.HEAD,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ["*"],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      enforceSSL: true,
      autoDeleteObjects: true,
    });

    /**
     *
     * Create Integration Lambda layer for aws-jwt-verify
     */
    const jwt = new lambda.LayerVersion(this, "aws-jwt-verify", {
      code: lambda.Code.fromAsset("./layers/aws-jwt-verify.zip"),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: "Contains the aws-jwt-verify library for JS",
    });

    

    /**
     *
     * Create Integration Lambda layer for PSQL
     */
    const postgres = new lambda.LayerVersion(this, "postgres", {
      code: lambda.Code.fromAsset("./layers/postgres.zip"),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: "Contains the postgres library for JS",
    });

    /**
     *
     * Create Lambda layer for Psycopg2
     */
    const psycopgLayer = new LayerVersion(this, "psycopgLambdaLayer", {
      code: Code.fromAsset("./layers/psycopg2.zip"),
      compatibleRuntimes: [Runtime.PYTHON_3_11],
      description: "Lambda layer containing the psycopg2 Python library",
    });


     

  

     

    // powertoolsLayer does not follow the format of layerList
    const powertoolsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "PowertoolsLayer",
      `arn:aws:lambda:${this.region}:017000801446:layer:AWSLambdaPowertoolsPythonV2:78`
    );

    this.layerList["psycopg2"] = psycopgLayer;
    this.layerList["postgres"] = postgres;
    this.layerList["jwt"] = jwt;
    // this.layerList["data_ingestionLayer"] = data_ingestionLayer;
    // this.layerList["text_generationLayer"] = text_generationLayer;

    // Create Cognito user pool

    /**
     *
     * Create Cognito User Pool
     * Using verification code
     * Inspiration from http://buraktas.com/create-cognito-user-pool-aws-cdk/
     */
    const userPoolName = "dlsUserPool";
    this.userPool = new cognito.UserPool(this, "dls-pool", {
      userPoolName: userPoolName,
      signInAliases: {
        email: true,
      },
      selfSignUpEnabled: true,
      autoVerify: {
        email: true,
      },
      userVerification: {
        emailSubject: "You need to verify your email",
        emailBody:
          "Thanks for signing up to DLS Assistant. \n Your verification code is {####}",
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create app client
    this.appClient = this.userPool.addClient("dls-pool", {
      userPoolClientName: userPoolName,
      authFlows: {
        userPassword: true,
        custom: true,
        userSrp: true,
      },
    });

    this.identityPool = new cognito.CfnIdentityPool(this, "dls-identity-pool", {
      allowUnauthenticatedIdentities: true,
      identityPoolName: "dlsIdentityPool",
      cognitoIdentityProviders: [
        {
          clientId: this.appClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    const secretsName = "DLS_Cognito_Secrets";

    this.secret = new secretsmanager.Secret(this, secretsName, {
      secretName: secretsName,
      description: "Cognito Secrets for authentication",
      secretObjectValue: {
        VITE_COGNITO_USER_POOL_ID: cdk.SecretValue.unsafePlainText(
          this.userPool.userPoolId
        ),
        VITE_COGNITO_USER_POOL_CLIENT_ID: cdk.SecretValue.unsafePlainText(
          this.appClient.userPoolClientId
        ),
        VITE_AWS_REGION: cdk.SecretValue.unsafePlainText(this.region),
        VITE_IDENTITY_POOL_ID: cdk.SecretValue.unsafePlainText(
          this.identityPool.ref
        ),
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create roles and policies
    const createPolicyStatement = (actions: string[], resources: string[]) => {
      return new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: actions,
        resources: resources,
      });
    };

    /**
     *
     * Load OpenAPI file into API Gateway using REST API
     */

    // Read OpenAPI file and load file to S3
    const asset = new Asset(this, "SampleAsset", {
      path: "OpenAPI_Swagger_Definition.yaml",
    });

    const data = Fn.transform("AWS::Include", { Location: asset.s3ObjectUrl });

    // Create the API Gateway REST API
    this.api = new apigateway.SpecRestApi(this, "APIGateway", {
      apiDefinition: apigateway.AssetApiDefinition.fromInline(data),
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      restApiName: "dlsAPI",
      deploy: true,
      cloudWatchRole: true,
      deployOptions: {
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        dataTraceEnabled: true,
        stageName: "prod",
        methodOptions: {
          "/*/*": {
            throttlingRateLimit: 100,
            throttlingBurstLimit: 200,
          },
        },
      },
    });

    this.stageARN_APIGW = this.api.deploymentStage.stageArn;
    this.apiGW_basedURL = this.api.urlForPath();

    const adminRole = new iam.Role(this, "AdminRole", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    adminRole.attachInlinePolicy(
      new iam.Policy(this, "AdminPolicy", {
        statements: [
          createPolicyStatement(
            ["execute-api:Invoke"],
            [
              `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/admin/*`,
              `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/instructor/*`,
              `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user/*`,
            ]
          ),
        ],
      })
    );

    const adminGroup = new cognito.CfnUserPoolGroup(this, "AdminGroup", {
      groupName: "admin",
      userPoolId: this.userPool.userPoolId,
      roleArn: adminRole.roleArn,
    });

    // Create unauthenticated role with no permissions
    const unauthenticatedRole = new iam.Role(this, "UnauthenticatedRole", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "unauthenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    const lambdaRole = new iam.Role(this, "postgresLambdaRole", {
      roleName: "postgresLambdaRole",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    // Grant access to Secret Manager
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    // Grant access to EC2
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses",
        ],
        resources: ["*"], // must be *
      })
    );

    // Grant access to log
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Logs
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["arn:aws:logs:*:*:*"],
      })
    );

    // Inline policy to allow AdminAddUserToGroup action
    const adminAddUserToGroupPolicyLambda = new iam.Policy(
      this,
      "adminAddUserToGroupPolicyLambda",
      {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "cognito-idp:AdminAddUserToGroup",
              "cognito-idp:AdminRemoveUserFromGroup",
              "cognito-idp:AdminGetUser",
              "cognito-idp:AdminListGroupsForUser",
            ],
            resources: [
              `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${this.userPool.userPoolId}`,
            ],
          }),
        ],
      }
    );

    // Attach the inline policy to the role
    lambdaRole.attachInlinePolicy(adminAddUserToGroupPolicyLambda);

    // Attach roles to the identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, "IdentityPoolRoles", {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: adminRole.roleArn,
        unauthenticated: unauthenticatedRole.roleArn,
      },
    });

    const lambdaUserFunction = new lambda.Function(this, "userFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda/lib"),
      handler: "userFunction.handler",
      timeout: Duration.seconds(300),
      vpc: vpcStack.vpc,
      environment: {
        SM_DB_CREDENTIALS: db.secretPathUser.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        USER_POOL: this.userPool.userPoolId,
      },
      functionName: "userFunction",
      memorySize: 512,
      layers: [postgres],
      role: lambdaRole,
    });

    // Add the permission to the Lambda function's policy to allow API Gateway access
    lambdaUserFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
    });

    const cfnLambda_user = lambdaUserFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnLambda_user.overrideLogicalId("userFunction");

    const lambdaAdminFunction = new lambda.Function(this, "adminFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda/adminFunction"),
      handler: "adminFunction.handler",
      timeout: Duration.seconds(300),
      vpc: vpcStack.vpc,
      environment: {
        SM_DB_CREDENTIALS: db.secretPathTableCreator.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpointTableCreator,
      },
      functionName: "adminFunction",
      memorySize: 512,
      layers: [postgres],
      role: lambdaRole,
    });

    // Add the permission to the Lambda function's policy to allow API Gateway access
    lambdaAdminFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/admin*`,
    });

    const cfnLambda_Admin = lambdaAdminFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnLambda_Admin.overrideLogicalId("adminFunction");

    const coglambdaRole = new iam.Role(this, "cognitoLambdaRole", {
      roleName: "cognitoLambdaRole",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    const logRole = new iam.Role(this, "logRole", {
      roleName: "logRole",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    logRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Logs
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["arn:aws:logs:*:*:*"],
      })
    );

    logRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          // Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:DLS/*`,
        ],
      })
    );

    // Grant access to Secret Manager
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    // Grant access to EC2
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses",
        ],
        resources: ["*"], // must be *
      })
    );

    // Grant access to log
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Logs
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["arn:aws:logs:*:*:*"],
      })
    );

    // Grant permission to add users to an IAM group
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["iam:AddUserToGroup"],
        resources: [
          `arn:aws:iam::${this.account}:user/*`,
          `arn:aws:iam::${this.account}:group/*`,
        ],
      })
    );

    // Inline policy to allow AdminAddUserToGroup action
    const adminAddUserToGroupPolicy = new iam.Policy(
      this,
      "AdminAddUserToGroupPolicy",
      {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "cognito-idp:AdminAddUserToGroup",
              "cognito-idp:AdminRemoveUserFromGroup",
              "cognito-idp:AdminGetUser",
              "cognito-idp:AdminListGroupsForUser",
            ],
            resources: [
              `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${this.userPool.userPoolId}`,
            ],
          }),
        ],
      }
    );

    // Attach the inline policy to the role
    coglambdaRole.attachInlinePolicy(adminAddUserToGroupPolicy);

    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          // Secrets Manager
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:DLS/*`,
        ],
      })
    );

    const AutoSignupLambda = new lambda.Function(this, "addAdminOnSignUp", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambda/lib"),
      handler: "addAdminOnSignUp.handler",
      timeout: Duration.seconds(300),
      environment: {
        SM_DB_CREDENTIALS: db.secretPathTableCreator.secretName,
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpointTableCreator,
      },
      vpc: vpcStack.vpc,
      functionName: "addAdminOnSignUp",
      memorySize: 128,
      layers: [postgres],
      role: coglambdaRole,
    });

    //cognito auto assign authenticated users to the admin group

    this.userPool.addTrigger(
      cognito.UserPoolOperation.POST_CONFIRMATION,
      AutoSignupLambda
    );

    new cdk.CfnOutput(this, "UserPoolIdOutput", {
      value: this.userPool.userPoolId,
      description: "The ID of the Cognito User Pool",
    });

    // **
    //  *
    //  * Create Lambda for Admin Authorization endpoints
    //  */
    const authorizationFunction = new lambda.Function(
      this,
      "admin-authorization-api-gateway",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        code: lambda.Code.fromAsset("lambda/adminAuthorizerFunction"),
        handler: "adminAuthorizerFunction.handler",
        timeout: Duration.seconds(300),
        vpc: vpcStack.vpc,
        environment: {
          SM_COGNITO_CREDENTIALS: this.secret.secretName,
        },
        functionName: "adminLambdaAuthorizer",
        memorySize: 512,
        layers: [jwt],
        role: lambdaRole,
      }
    );

    // Add the permission to the Lambda function's policy to allow API Gateway access
    authorizationFunction.grantInvoke(
      new iam.ServicePrincipal("apigateway.amazonaws.com")
    );

    // Change Logical ID to match the one decleared in YAML file of Open API
    const apiGW_authorizationFunction = authorizationFunction.node
      .defaultChild as lambda.CfnFunction;
    apiGW_authorizationFunction.overrideLogicalId("adminLambdaAuthorizer");

    // Create secrets for Bedrock LLM ID, Embedding Model ID, and Table Name
    // const bedrockLLMSecret = new secretsmanager.Secret(this, "BedrockLLMSecret", {
    //   secretName: "BedrockLLMSecret",
    //   description: "Secret containing the Bedrock LLM ID",
    //   secretStringValue: cdk.SecretValue.unsafePlainText("meta.llama3-70b-instruct-v1:0"),
    // });
    const bedrockLLMSecret = new secretsmanager.Secret(
      this,
      "BedrockLLMSecret",
      {
        secretName: "BedrockLLMSecret",
        description: "Secret containing the Bedrock LLM ID",
        secretStringValue: cdk.SecretValue.unsafePlainText(
          "meta.llama3-70b-instruct-v1:0"
        ),
      }
    );
    // const embeddingModelSecret = new secretsmanager.Secret(this, "EmbeddingModelSecret", {
    //   secretName: "EmbeddingModelSecret",
    //   description: "Secret containing the Embedding Model ID",
    //   secretStringValue: cdk.SecretValue.unsafePlainText("amazon.titan-embed-text-v2:0"),
    // });

    const embeddingModelSecret = new secretsmanager.Secret(
      this,
      "EmbeddingModelSecret",
      {
        secretName: "EmbeddingModelSecret",
        description: "Secret containing the Embedding Model ID",
        secretStringValue: cdk.SecretValue.unsafePlainText(
          "amazon.titan-embed-text-v2:0"
        ),
      }
    );

    const tableNameSecret = new secretsmanager.Secret(this, "TableNameSecret", {
      secretName: "TableNameSecret",
      description: "Secret containing the DynamoDB table name",
      secretStringValue: cdk.SecretValue.unsafePlainText(
        "DynamoDB-Conversation-Table"
      ),
    });

    /**
     *
     * Create Lambda with container image for text generation workflow in RAG pipeline
     */
    const textGenLambdaDockerFunc = new lambda.DockerImageFunction(
      this,
      "TextGenLambdaDockerFunction",
      {
        code: lambda.DockerImageCode.fromImageAsset("./text_generation"),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300),
        vpc: vpcStack.vpc, // Pass the VPC
        functionName: "TextGenLambdaDockerFunction",
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
          REGION: this.region,
          BEDROCK_LLM_SECRET: bedrockLLMSecret.secretName,
          EMBEDDING_MODEL_SECRET: embeddingModelSecret.secretName,
          TABLE_NAME_SECRET: tableNameSecret.secretName,
        },
      }
    );
    // const textGenLambdaLayerFunc = new lambda.Function(
    //   this,
    //   "textGenLambdaLayerFunction",
    //   {
    //     runtime: lambda.Runtime.PYTHON_3_11,
    //     code: lambda.Code.fromAsset("lambda/text_generation"),
    //     handler: "main.handler",
    //     timeout: Duration.seconds(300),
    //     memorySize: 512,
    //     vpc: vpcStack.vpc,
    //     environment: {
    //             SM_DB_CREDENTIALS: db.secretPathUser.secretName,
    //             RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
    //             REGION: this.region,
    //             BEDROCK_LLM_SECRET: bedrockLLMSecret.secretName,
    //             EMBEDDING_MODEL_SECRET: embeddingModelSecret.secretName,
    //             TABLE_NAME_SECRET: tableNameSecret.secretName,
    //           },
    //     functionName: "textGenLambdaLayerFunction",
    //     layers: [text_generation_layer],
    //   }
    // );

    // Override the Logical ID of the Lambda Function to get ARN in OpenAPI
    const cfnTextGenDockerFunc = textGenLambdaDockerFunc.node
      .defaultChild as lambda.CfnFunction;
    cfnTextGenDockerFunc.overrideLogicalId("TextGenLambdaDockerFunction");

    // Add the permission to the Lambda function's policy to allow API Gateway access
    textGenLambdaDockerFunc.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/user*`,
    });

    // Custom policy statement for Bedrock access
    const bedrockPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["bedrock:InvokeModel", "bedrock:InvokeEndpoint"],
      resources: [
        "arn:aws:bedrock:" +
          this.region +
          "::foundation-model/meta.llama3-70b-instruct-v1:0",
        "arn:aws:bedrock:" +
          this.region +
          "::foundation-model/amazon.titan-embed-text-v2:0",
      ],
    });

    // Attach the custom Bedrock policy to Lambda function
    textGenLambdaDockerFunc.addToRolePolicy(bedrockPolicyStatement);

    // Grant access to Secret Manager
    textGenLambdaDockerFunc.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    // Grant access to DynamoDB actions
    textGenLambdaDockerFunc.addToRolePolicy(  
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:ListTables",
          "dynamodb:CreateTable",
          "dynamodb:DescribeTable",
          "dynamodb:PutItem",
          "dynamodb:GetItem",
        ],
        resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/*`],
      })
    );

    // Create the Lambda function for generating presigned URLs
    const generatePreSignedURL = new lambda.Function(
      this,
      "GeneratePreSignedURLFunc",
      {
        runtime: lambda.Runtime.PYTHON_3_11,
        code: lambda.Code.fromAsset("lambda/generatePreSignedURL"),
        handler: "generatePreSignedURL.lambda_handler",
        timeout: Duration.seconds(300),
        memorySize: 128,
        environment: {
          BUCKET: dataIngestionBucket.bucketName,
          REGION: this.region,
        },
        functionName: "GeneratePreSignedURLFunc",
        layers: [powertoolsLayer],
      }
    );

    // Override the Logical ID of the Lambda Function to get ARN in OpenAPI
    const cfnGeneratePreSignedURL = generatePreSignedURL.node
      .defaultChild as lambda.CfnFunction;
    cfnGeneratePreSignedURL.overrideLogicalId("GeneratePreSignedURLFunc");

    // Grant the Lambda function the necessary permissions
    dataIngestionBucket.grantReadWrite(generatePreSignedURL);
    generatePreSignedURL.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:GetObject"],
        resources: [
          dataIngestionBucket.bucketArn,
          `${dataIngestionBucket.bucketArn}/*`,
        ],
      })
    );

    // Add the permission to the Lambda function's policy to allow API Gateway access
    generatePreSignedURL.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/admin*`,
    });

    /**
     *
     * Create Lambda with container image for data ingestion workflow in RAG pipeline
     * This function will be triggered when a file in uploaded or deleted fro, the S3 Bucket
     */
    const dataIngestLambdaDockerFunction = new lambda.DockerImageFunction(
      this,
      "DataIngestLambdaDockerFunctionReImaged",
      {
        code: lambda.DockerImageCode.fromImageAsset("./data_ingestion"),
        memorySize: 512,
        timeout: cdk.Duration.seconds(300),
        vpc: vpcStack.vpc, // Pass the VPC
        functionName: "DataIngestLambdaDockerFunctionReImaged",
        environment: {
          SM_DB_CREDENTIALS: db.secretPathAdminName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
          BUCKET: dataIngestionBucket.bucketName,
          REGION: this.region,
          EMBEDDING_BUCKET_NAME: embeddingStorageBucket.bucketName,
        },
      }
    );

    // const dataIngestLambdaLayerFunction = new lambda.Function(
    //   this,
    //   "dataIngestLambdaLayerFunction",
    //   {
    //     runtime: lambda.Runtime.PYTHON_3_11,
    //     code: lambda.Code.fromAsset("lambda/data_ingestion"),
    //     handler: "main.handler",
    //     timeout: Duration.seconds(300),
    //     memorySize: 512,
    //     vpc: vpcStack.vpc,
    //     environment: {
    //             SM_DB_CREDENTIALS: db.secretPathAdminName,
    //             RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
    //             BUCKET: dataIngestionBucket.bucketName,
    //             REGION: this.region,
    //             EMBEDDING_BUCKET_NAME: embeddingStorageBucket.bucketName,
    //           },
    //     functionName: "dataIngestLambdaLayerFunction",
    //     layers: [data_ingestion_layer],
    //   }
    // );


    // Override the Logical ID of the Lambda Function to get ARN in OpenAPI
    const cfnDataIngestLambdaDockerFunction = dataIngestLambdaDockerFunction
      .node.defaultChild as lambda.CfnFunction;
    cfnDataIngestLambdaDockerFunction.overrideLogicalId(
      "DataIngestLambdaDockerFunctionReImaged"
    );

    dataIngestionBucket.grantRead(dataIngestLambdaDockerFunction);

    dataIngestLambdaDockerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [dataIngestionBucket.bucketArn], // Access to the specific bucket
      })
    );

    dataIngestLambdaDockerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [embeddingStorageBucket.bucketArn], // Access to the specific bucket
      })
    );

    dataIngestLambdaDockerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:HeadObject",
        ],
        resources: [
          `arn:aws:s3:::${embeddingStorageBucket.bucketName}/*`, // Grant access to all objects within this bucket
        ],
      })
    );

    dataIngestLambdaDockerFunction.addToRolePolicy(bedrockPolicyStatement);

    dataIngestLambdaDockerFunction.addEventSource(
      new lambdaEventSources.S3EventSource(dataIngestionBucket, {
        events: [
          s3.EventType.OBJECT_CREATED,
          s3.EventType.OBJECT_REMOVED,
          s3.EventType.OBJECT_RESTORE_COMPLETED,
        ],
      })
    );

    // Grant access to Secret Manager
    dataIngestLambdaDockerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    /**
     *
     * Create Lambda function that will return all file names for a specified course, concept, and module
     */
    const getDocumentsFunction = new lambda.Function(
      this,
      "GetDocumentsFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_11,
        code: lambda.Code.fromAsset("lambda/getDocumentsFunction"),
        handler: "getDocumentsFunction.lambda_handler",
        timeout: Duration.seconds(300),
        memorySize: 128,
        vpc: vpcStack.vpc,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
          BUCKET: dataIngestionBucket.bucketName,
          REGION: this.region,
        },
        functionName: "GetDocumentsFunction",
        layers: [psycopgLayer, powertoolsLayer],
        role: coglambdaRole,
      }
    );

    // Override the Logical ID of the Lambda Function to get ARN in OpenAPI
    const cfnGetDocumentsFunction = getDocumentsFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnGetDocumentsFunction.overrideLogicalId("GetDocumentsFunction");

    // Grant the Lambda function read-only permissions to the S3 bucket
    dataIngestionBucket.grantRead(getDocumentsFunction);

    // Grant access to Secret Manager
    getDocumentsFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    // Add the permission to the Lambda function's policy to allow API Gateway access
    getDocumentsFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/admin*`,
    });

    /**
     *
     * Create Lambda function to delete certain file
     */
    const deleteDocument = new lambda.Function(this, "DeleteDocumentFunc", {
      runtime: lambda.Runtime.PYTHON_3_11,
      code: lambda.Code.fromAsset("lambda/deleteDocument"),
      handler: "deleteDocument.lambda_handler",
      timeout: Duration.seconds(300),
      memorySize: 128,
      vpc: vpcStack.vpc,
      environment: {
        SM_DB_CREDENTIALS: db.secretPathUser.secretName, // Database User Credentials
        RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint, // RDS Proxy Endpoint
        BUCKET: dataIngestionBucket.bucketName,
        REGION: this.region,
      },
      functionName: "DeleteDocumentFunc",
      layers: [psycopgLayer, powertoolsLayer],
    });

    // Override the Logical ID of the Lambda Function to get ARN in OpenAPI
    const cfndeleteDocument = deleteDocument.node
      .defaultChild as lambda.CfnFunction;
    cfndeleteDocument.overrideLogicalId("DeleteDocumentFunc");

    // Grant the Lambda function the necessary permissions
    dataIngestionBucket.grantDelete(deleteDocument);

    // Grant access to Secret Manager
    deleteDocument.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    // Add the permission to the Lambda function's policy to allow API Gateway access
    deleteDocument.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/admin*`,
    });

    /**
     *
     * Create Lambda function to delete an entire module directory
     */
    const deleteCategoryFunction = new lambda.Function(
      this,
      "DeleteCategoryFunc",
      {
        runtime: lambda.Runtime.PYTHON_3_11,
        code: lambda.Code.fromAsset("lambda/deleteCategory"),
        handler: "deleteCategory.lambda_handler",
        timeout: Duration.seconds(300),
        memorySize: 128,
        vpc: vpcStack.vpc,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName, // Database User Credentials
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint, // RDS Proxy Endpoint
          BUCKET: dataIngestionBucket.bucketName,
          REGION: this.region,
        },
        functionName: "DeleteCategoryFunc",
        layers: [psycopgLayer, powertoolsLayer],
      }
    );

    //Override the Logical ID of the Lambda Function to get ARN in OpenAPI
    const cfnDeleteCategoryFunction = deleteCategoryFunction.node
      .defaultChild as lambda.CfnFunction;
    cfnDeleteCategoryFunction.overrideLogicalId("DeleteCategoryFunc");

    //Grant the Lambda function the necessary permissions
    dataIngestionBucket.grantRead(deleteCategoryFunction);
    dataIngestionBucket.grantDelete(deleteCategoryFunction);

    deleteCategoryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    dataIngestionBucket.grantRead(dataIngestLambdaDockerFunction);
    // Add ListBucket permission explicitly
    dataIngestLambdaDockerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [dataIngestionBucket.bucketArn], // Access to the specific bucket
      })
    );
    dataIngestLambdaDockerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [
          `arn:aws:s3:::${embeddingStorageBucket.bucketArn}/*`, // Grant access to all objects within this bucket
        ],
      })
    );

    dataIngestLambdaDockerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:HeadObject",
        ],
        resources: [
          `arn:aws:s3:::${embeddingStorageBucket.bucketName}/*`, // Grant access to all objects within this bucket
        ],
      })
    );

    //Add the permission to the Lambda function's policy to allow API Gateway access
    deleteCategoryFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/admin*`,
    });
  }
}
