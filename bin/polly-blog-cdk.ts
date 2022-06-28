#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag'
import { Aspects } from 'aws-cdk-lib';
import { PollyBlogCdkStack } from '../lib/polly-blog-cdk-stack';

const app = new cdk.App();
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))
new PollyBlogCdkStack(app, 'PollyBlogCdkStack', {
    description: "Stack to demonstrate how to sync polly output audio and subtitles using Speech Marks"
});
