import * as s3 from "aws-cdk-lib/aws-s3";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export const createS3Buckets = (scope: Construct, id: string) => {
  const embeddingStorageBucket = new s3.Bucket(scope, `${id}-EmbeddingStorageBucket`, {
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

  const dataIngestionBucket = new s3.Bucket(scope, `${id}-DataIngestionBucket`, {
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
    versioned: true,
    autoDeleteObjects: true,
  });

  const comparisonBucket = new s3.Bucket(scope, `${id}-comparisonBucket`, {
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
  const csv_bucket = new s3.Bucket(scope, `${id}-csvBucket`, {
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
    versioned: true,
    autoDeleteObjects: true,
  });

  return { embeddingStorageBucket, dataIngestionBucket, comparisonBucket, csv_bucket };
};
