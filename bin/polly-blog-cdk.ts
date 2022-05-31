#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PollyBlogCdkStack } from '../lib/polly-blog-cdk-stack';

const app = new cdk.App();
new PollyBlogCdkStack(app, 'PollyBlogCdkStack', {
    description: "Stack to demonstrate how to sync polly output audio and subtitles using Speech Marks"
});
