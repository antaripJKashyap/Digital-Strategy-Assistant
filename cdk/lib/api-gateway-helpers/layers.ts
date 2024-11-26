import {
    Architecture,
    Code,
    Function,
    LayerVersion,
    Runtime,
  } from "aws-cdk-lib/aws-lambda";
  import * as lambda from "aws-cdk-lib/aws-lambda";

  import { Construct } from "constructs";


  export const createLayers = (scope: Construct) => {
    /**
       *
       * Create Integration Lambda layer for aws-jwt-verify
       */
    const jwt = new lambda.LayerVersion(scope, "aws-jwt-verify", {
        code: lambda.Code.fromAsset("./layers/aws-jwt-verify.zip"),
        compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
        description: "Contains the aws-jwt-verify library for JS",
      });


      /**
       *
       * Create Integration Lambda layer for PSQL
       */
      const postgres = new lambda.LayerVersion(scope, "postgres", {
        code: lambda.Code.fromAsset("./layers/postgres.zip"),
        compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
        description: "Contains the postgres library for JS",
      });

      /**
       *
       * Create Lambda layer for Psycopg2
       */
      const psycopgLayer = new LayerVersion(scope, "psycopgLambdaLayer", {
        code: Code.fromAsset("./layers/psycopg2.zip"),
        compatibleRuntimes: [Runtime.PYTHON_3_9],
        description: "Lambda layer containing the psycopg2 Python library",
      });
    
      return { jwt, postgres, psycopgLayer };
};