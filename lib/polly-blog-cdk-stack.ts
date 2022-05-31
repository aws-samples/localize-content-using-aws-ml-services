import { Duration, lambda_layer_awscli, Stack, StackProps } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";

import { Construct } from 'constructs';

export class PollyBlogCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //New bucket to upload the original video into
    const bucket = new Bucket(this, 'PollyBlogBucket', {
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      bucketKeyEnabled: false
    });

    new s3deploy.BucketDeployment(this, 'DeploySampleVideo', {
      sources: [s3deploy.Source.asset('lib/media')],
      destinationBucket:bucket
    });

    //Cloudfront distribution for the S3 OAI
    const medisDistribution = new cloudfront.Distribution(this, 'MediaDistribution', {
      defaultBehavior: {origin: new origins.S3Origin(bucket)}
    });

    /*const ecrStateMachine = new sfn.StateMachine(this, 'InvokeLambda',{
      
    });*/

    
    const mediaConvertRole = new iam.Role(this, 'MediaConvertRole', {
      assumedBy: new iam.ServicePrincipal('mediaconvert.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonS3FullAccess',
        ),
      ],
    });

    const buckeName = bucket.bucketName
    const pollyTextFile = "polly_text_file.txt"
    const pollyLanguageCode = "hi-IN"
    const pollyVoiceId = "Aditi"
    const pollyEngine = "standard"
    const mediaConvertLangShort = "HIN"
    const mediaConvertLangLong = "Hindi"
    const mediaCovertInputVideoFile = "AWS_reInvent_andy_jassy.mp4"
    const targetLanguageCode = "hi"

    const generatePollyAudio = new lambda.Function(this, 'GeneratePollyAudio', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/polly'),
      handler: 'generate_polly_audio.handler',
      environment: {
        BUCKET_NAME: buckeName,
        POLLY_TEXT_FILE: pollyTextFile,
        POLLY_LANGUAGE_CODE:pollyLanguageCode,
        POLLY_VOICE_ID:pollyVoiceId,
        TARGET_LANG_CODE:targetLanguageCode,
        POLLY_ENGINE:pollyEngine
      }
    })

    const generateSpeechMarks = new lambda.Function(this, 'GenerateSpeechMarks', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/polly'),
      handler: 'generate_speech_marks.handler',
      environment: {
        BUCKET_NAME: buckeName,
        POLLY_TEXT_FILE: pollyTextFile,
        POLLY_LANGUAGE_CODE:pollyLanguageCode,
        POLLY_VOICE_ID:pollyVoiceId,
        TARGET_LANG_CODE:targetLanguageCode,
        POLLY_ENGINE:pollyEngine
      }
    })

    const generateSubtitlesLamdbda = new lambda.Function(this, 'GenerateSubtitles', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/polly'),
      handler: 'generate_subtitles.handler',
      environment: {
        BUCKET_NAME: buckeName,
        POLLY_TEXT_FILE: pollyTextFile,
        POLLY_LANGUAGE_CODE:pollyLanguageCode,
        POLLY_VOICE_ID:pollyVoiceId,
      }
    });

    const createMediaConvertJob = new lambda.Function(this, 'CreateMediaConvertJob', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/mediaconvert'),
      handler: 'create_mediaconvert_job.handler',
      environment: {
        BUCKET_NAME: buckeName,
        MC_ROLE_ARN:mediaConvertRole.roleArn,
        MC_LANG_SHORT:mediaConvertLangShort,
        MC_LANG_LONG:mediaConvertLangLong,
        TARGET_LANG_CODE:targetLanguageCode,
        MC_VIDEO_FILENAME:mediaCovertInputVideoFile
      }
    })

    const pollySpeechSynthesisPolicy = 
      new iam.PolicyStatement({
      actions: ['polly:StartSpeechSynthesisTask', 'polly:GetSpeechSynthesisTask','polly:ListSpeechSynthesisTasks'],
      resources: ['*'],
    });

    const pollyS3Policy = 
      new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: ['arn:aws:s3:::' + bucket.bucketName + '/*'],
    });

    generatePollyAudio.role?.attachInlinePolicy(
      new iam.Policy(this, 'PollyAudio', {
        statements: [pollySpeechSynthesisPolicy, pollyS3Policy]
      })
    )

    generateSpeechMarks.role?.attachInlinePolicy(
      new iam.Policy(this, 'PollySynthesis', {
        statements: [pollySpeechSynthesisPolicy, pollyS3Policy]
      })
    )

    const waitAudioJob = new sfn.Wait(this, 'Audio Job Wait 5 Seconds', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(5)),
    });

    const waitSpeechmarksJob = new sfn.Wait(this, 'Speechmarks Job Wait 5 Seconds', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(5)),
    });

    const getAudoJobStatusLambda =  new lambda.Function(this, 'GetAudioJobtatusTask', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/jobstatus'),
      handler: 'get_job_status.handler'
    });
    
    const getAudioJobStatus = new tasks.LambdaInvoke(this, 'Get Audio Job Status', {
      lambdaFunction: getAudoJobStatusLambda,
      outputPath: '$.Payload',
    });

    const getSpeechmarksJobStatusLambda =  new lambda.Function(this, 'GetSpeechmarksJobtatusTask', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/jobstatus'),
      handler: 'get_job_status.handler'
    });
    
    const getSpeechmarksJobStatus = new tasks.LambdaInvoke(this, 'Get Speechmarks Job Status', {
      lambdaFunction: getSpeechmarksJobStatusLambda,
      outputPath: '$.Payload',
    });

    getAudoJobStatusLambda.role?.attachInlinePolicy(
      new iam.Policy(this, 'PollyAudioStatus', {
        statements: [pollySpeechSynthesisPolicy]
      })
    )
    
    getSpeechmarksJobStatusLambda.role?.attachInlinePolicy(
      new iam.Policy(this, 'PollySpeecmarksStatus', {
        statements: [pollySpeechSynthesisPolicy]
      })
    )

    const generateSubtitles = new tasks.LambdaInvoke(this, 'GenerateSubtitlesTask', {
      lambdaFunction: generateSubtitlesLamdbda,
      outputPath: '$.Payload',
    });

    const subtitlesS3Policy = 
      new iam.PolicyStatement({
      actions: ['s3:GetObject','s3:PutObject'],
      resources: ['arn:aws:s3:::' + bucket.bucketName + '/*'],
    });

    generateSubtitlesLamdbda.role?.attachInlinePolicy(
      new iam.Policy(this, 'SubtitlesPolicy', {
        statements: [subtitlesS3Policy]
      })
    )

    const mediaConvertPolicy = 
      new iam.PolicyStatement({
      actions: ['mediaconvert:DescribeEndpoints', 'mediaconvert:CreateJob'],
      resources: ['*'],
    });

    const passRolePolicy = 
      new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: ['*'],
    });

    createMediaConvertJob.role?.attachInlinePolicy(
      new iam.Policy(this, 'MediaConvertPolicy', {
        statements: [mediaConvertPolicy, passRolePolicy]
      })
    )
    
    const audioJobSucceeded = new sfn.Succeed(this, 'Polly Audio Job Succeeded');

    const stateMachine = new sfn.StateMachine(this, 'ProcessAudioWithSubtitles', {
      definition: new sfn.Parallel(this, "GenerateAudioAndSpeechMarks")
        .branch(new tasks.LambdaInvoke(this, "GeneratePollyAudioStep", {
          lambdaFunction: generatePollyAudio,
          timeout: cdk.Duration.seconds(300)})
          .next(waitAudioJob)
          .next(getAudioJobStatus)
          .next(new sfn.Choice(this, 'AudioJobCompleted')
            .when(sfn.Condition.stringEquals('$.result', 'completed'), audioJobSucceeded)
            .otherwise(waitAudioJob)))
        .branch(new tasks.LambdaInvoke(this, "GenerateSpeechMarksStep", {
          lambdaFunction: generateSpeechMarks,
          timeout: cdk.Duration.seconds(300)})
          .next(waitSpeechmarksJob)
          .next(getSpeechmarksJobStatus)
          .next(new sfn.Choice(this, 'SpeechMarksJobCompleted')
            .when(sfn.Condition.stringEquals('$.result', 'completed'), generateSubtitles)
            .otherwise(waitSpeechmarksJob)))
      .next(new tasks.LambdaInvoke(this, "CreateMediaConvertJobStep", {
          lambdaFunction: createMediaConvertJob
      }))
    });

    const executeStateMachine =  new lambda.Function(this, 'StartStateMachineExecution', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/statemachine'),
      handler: 'state_machine.handler',
      environment: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn
      }
    });

    const stateMachinePolicy = new iam.PolicyStatement({
      actions: ['states:StartExecution'],
      resources: ['*']
    });

    executeStateMachine.role?.attachInlinePolicy(
      new iam.Policy(this, 'ExecuteStateMachine', {
        statements: [stateMachinePolicy]
      })
    )

  }
}
