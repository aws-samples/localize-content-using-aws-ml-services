import { Stack, StackProps } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from "aws-cdk-lib/aws-iam";
import * as cdk from "aws-cdk-lib";
import * as s3 from 'aws-cdk-lib/aws-s3'
import { NagSuppressions } from 'cdk-nag'

import { Construct } from 'constructs';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export class PollyBlogCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Reviewed IAM permissons manually to make sure the wild card permissions are on a specific bucket created by this stack'
      },
    ])

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'The managed lambda execution rule is created by the CDK for the notification event created on S3 bucket, leaving it as is for now as it would require additional custom coding'
      },
    ])

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-S1',
        reason: 'This is a demo stack, no need for server access logs to be enabled'
      },
    ])

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-S10',
        reason: 'This is a demo stack, no need for SSL access. The public access is disabled and the contents are served via cloudfront'
      },
    ])

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-CFR1',
        reason: 'This is a demo stack, no need for Geo restrictions'
      },
    ])

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-CFR2',
        reason: 'This is a demo stack, no need for WAF integration'
      },
    ])

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-CFR3',
        reason: 'This is a demo stack, no need for server access logs to be enabled'
      },
    ])

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-CFR4',
        reason: 'This is a demo stack, using deafault cloudfront certificate(TLS_V1) without enforcing a security protocol'
      },
    ])

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-SF1',
        reason: 'This is a demo stack, no need enabled ALL logging'
      },
    ])

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-SF2',
        reason: 'This is a demo stack, no need for x-ray'
      },
    ])

    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-L1',
        reason: 'All the lambdas created as part of the demo use python 3.9, the error pertains to a sample html file being uploaded to S3 bucket which can be ignored'
      },
    ])

    const lambdaCWLogGroupPolicy =
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup','logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['arn:aws:logs:' + cdk.Stack.of(this).region + ':' + cdk.Stack.of(this).account + ':log-group:/aws/lambda/PollyBlogCdkStack-*'],
    })

    //New bucket to upload the original video into
    const bucket = new Bucket(this, 'PollyBlogBucket', {
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      bucketKeyEnabled: false,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const s3BucketDeployLambdaRole = new iam.Role(this, 'S3BucketDeployDefaultLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    })
    s3BucketDeployLambdaRole.addToPolicy(lambdaCWLogGroupPolicy)
    new s3deploy.BucketDeployment(this, 'DeploySampleVideo', {
      sources: [s3deploy.Source.asset('lib/sample')],
      destinationBucket:bucket,
      role: s3BucketDeployLambdaRole,
      destinationKeyPrefix: 'inputVideo'
    });

    //Cloudfront distribution for the S3 OAI
    const mediaDistribution = new cloudfront.Distribution(this, 'MediaDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket), 
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      }
    });

    const S3ReadWritePolicy = 
      new iam.PolicyStatement({
      actions: ['s3:GetObject','s3:PutObject'],
      resources: ['arn:aws:s3:::' + bucket.bucketName + '/*'],
    });

    const S3ReadPolicy = 
      new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: ['arn:aws:s3:::' + bucket.bucketName + '/*'],
    });

    const mediaConvertRole = new iam.Role(this, 'MediaConvertRole', {
      assumedBy: new iam.ServicePrincipal('mediaconvert.amazonaws.com')
    });
    mediaConvertRole.attachInlinePolicy(new iam.Policy(this, 'MediaConvertInlinePolicy', {
      statements: [S3ReadWritePolicy]
    }))

    const passRolePolicy = 
      new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [mediaConvertRole.roleArn],
    });

    const buckeName = bucket.bucketName
    const pollyLanguageCode = new cdk.CfnParameter(this, "pollyLanguageCode", {
      type: "String",
      description: "The target polly language code to convert the audio and text",
      default: "es-US"});
    const pollyVoiceId = new cdk.CfnParameter(this, "pollyVoiceId", {
      type: "String",
      description: "The target polly language voice",
      default: "Miguel"})
    const pollyEngine = new cdk.CfnParameter(this, "pollyEngine", {
      type: "String",
      allowedValues: ["standard", "neural"],
      description: "The polly engine to use",
      default: "standard"})
    const mediaConvertLangShort = new cdk.CfnParameter(this, "mediaConvertLangShort", {
      type: "String",
      description: "The MediaConvert short language code",
      default: "SPA"})
    const mediaConvertLangLong = new cdk.CfnParameter(this, "mediaConvertLangLong", {
      type: "String",
      description: "The MediaConvert long language code",
      default: "Spanish"})
    const targetLanguageCode = new cdk.CfnParameter(this, "targetLanguageCode", {
      type: "String",
      description: "The target language code",
      default: "es"})

    const transcribeLambdaRole = new iam.Role(this, 'TranscribeDefaultLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    })
    transcribeLambdaRole.addToPolicy(lambdaCWLogGroupPolicy)
    const transcribeAudio = new lambda.Function(this, 'TranscribeAudio', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/transcribe'),
      handler: 'transcribe.handler',
      role: transcribeLambdaRole,
      environment: {
        BUCKET_NAME: buckeName
      }
    })

    const cdn_url = "https://" + mediaDistribution.domainName + "/inputVideo/play_video.html"

    const getTranscribeAudioLambdaRole = new iam.Role(this, 'GetTranscribeAudioDefaultLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    })
    getTranscribeAudioLambdaRole.addToPolicy(lambdaCWLogGroupPolicy)
    const getTranscribeAudio = new lambda.Function(this, 'GetTranscribeAudio', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/transcribe'),
      handler: 'get_transcribe_status.handler',
      role: getTranscribeAudioLambdaRole,
    })

    const translateTextLamdaRole = new iam.Role(this, 'TranslateTextDefaultLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    })
    translateTextLamdaRole.addToPolicy(lambdaCWLogGroupPolicy)
    const translateTextLamda = new lambda.Function(this, 'TranslateText', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/translate'),
      handler: 'translate.handler',
      role: translateTextLamdaRole,
      environment: {
        BUCKET_NAME: buckeName,
        TARGET_LANG_CODE:targetLanguageCode.valueAsString
      }
    })
    
    const generatePollyAudioLambdaRole = new iam.Role(this, 'GeneratePollyAudioDefaultLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    })
    generatePollyAudioLambdaRole.addToPolicy(lambdaCWLogGroupPolicy)
    const generatePollyAudio = new lambda.Function(this, 'GeneratePollyAudio', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/polly'),
      handler: 'generate_polly_audio.handler',
      timeout: cdk.Duration.seconds(30),
      role: generatePollyAudioLambdaRole,
      environment: {
        BUCKET_NAME: buckeName,
        POLLY_LANGUAGE_CODE:pollyLanguageCode.valueAsString,
        POLLY_VOICE_ID:pollyVoiceId.valueAsString,
        TARGET_LANG_CODE:targetLanguageCode.valueAsString,
        POLLY_ENGINE:pollyEngine.valueAsString
      }
    })

    const generateSpeechMarksLambdaRole = new iam.Role(this, 'GenerateSpeechMarksDefaultLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    })
    generateSpeechMarksLambdaRole.addToPolicy(lambdaCWLogGroupPolicy)
    const generateSpeechMarks = new lambda.Function(this, 'GenerateSpeechMarks', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/polly'),
      handler: 'generate_speech_marks.handler',
      timeout: cdk.Duration.seconds(30),
      role: generateSpeechMarksLambdaRole,
      environment: {
        BUCKET_NAME: buckeName,
        POLLY_LANGUAGE_CODE:pollyLanguageCode.valueAsString,
        POLLY_VOICE_ID:pollyVoiceId.valueAsString,
        TARGET_LANG_CODE:targetLanguageCode.valueAsString,
        POLLY_ENGINE:pollyEngine.valueAsString
      }
    })

    const generateSubtitlesLamdbdaRole = new iam.Role(this, 'GenerateSubtitlesDefaultLamdbdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    })
    generateSubtitlesLamdbdaRole.addToPolicy(lambdaCWLogGroupPolicy)
    const generateSubtitlesLamdbda = new lambda.Function(this, 'GenerateSubtitles', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/polly'),
      handler: 'generate_subtitles.handler',
      timeout: cdk.Duration.seconds(30),
      role: generateSubtitlesLamdbdaRole,
      environment: {
        BUCKET_NAME: buckeName,
        POLLY_LANGUAGE_CODE:pollyLanguageCode.valueAsString,
        POLLY_VOICE_ID:pollyVoiceId.valueAsString,
      }
    });

    const createMediaConvertJobLambdaRole = new iam.Role(this, 'createMediaConvertJobDefaultLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    })
    createMediaConvertJobLambdaRole.addToPolicy(lambdaCWLogGroupPolicy)
    const createMediaConvertJob = new lambda.Function(this, 'CreateMediaConvertJob', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/mediaconvert'),
      handler: 'create_mediaconvert_job.handler',
      timeout: cdk.Duration.seconds(30),
      role: createMediaConvertJobLambdaRole,
      environment: {
        BUCKET_NAME: buckeName,
        MC_ROLE_ARN:mediaConvertRole.roleArn,
        MC_LANG_SHORT:mediaConvertLangShort.valueAsString,
        MC_LANG_LONG:mediaConvertLangLong.valueAsString,
        TARGET_LANG_CODE:targetLanguageCode.valueAsString,
        CDN_DOMAIN: mediaDistribution.domainName,
        CDN_DISTRIBUTION: mediaDistribution.distributionId
      }
    })

    const startTranscribeAudioPolicy =
      new iam.PolicyStatement({
        actions: ['transcribe:StartTranscriptionJob'],
        resources: ['*']
    })

    const getTranscribeAudioPolicy =
      new iam.PolicyStatement({
        actions: ['transcribe:GetTranscriptionJob'],
        resources: ['*']
    })

    const startTranslateTextPolicy =
      new iam.PolicyStatement({
        actions: ['translate:TranslateText'],
        resources: ['*']
    })

    const ssmGetParameterPolicy = 
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources:['arn:aws:ssm:' + cdk.Stack.of(this).region +':' + cdk.Stack.of(this).account + ':*']
      })

    const ssmPutParameterPolicy = 
      new iam.PolicyStatement({
        actions: ['ssm:PutParameter'],
        resources:['arn:aws:ssm:' + cdk.Stack.of(this).region +':' + cdk.Stack.of(this).account + ':parameter/input_video_file']
      })

    const pollySpeechSynthesisPolicy = 
      new iam.PolicyStatement({
      actions: ['polly:StartSpeechSynthesisTask', 'polly:GetSpeechSynthesisTask','polly:ListSpeechSynthesisTasks'],
      resources: ['*'],
    })

    const pollyS3Policy = 
      new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: ['arn:aws:s3:::' + bucket.bucketName + '/*'],
    })

    generatePollyAudio.role?.attachInlinePolicy(
      new iam.Policy(this, 'PollyAudio', {
        statements: [pollySpeechSynthesisPolicy, S3ReadWritePolicy]
      })
    )

    generateSpeechMarks.role?.attachInlinePolicy(
      new iam.Policy(this, 'PollySynthesis', {
        statements: [pollySpeechSynthesisPolicy, S3ReadWritePolicy]
      })
    )

    const waitTranscribeAudioJob = new sfn.Wait(this, 'Transcribe Job Wait 5 Seconds', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(5)),
    });

    const waitAudioJob = new sfn.Wait(this, 'Audio Job Wait 5 Seconds', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(5)),
    });

    const waitSpeechmarksJob = new sfn.Wait(this, 'Speechmarks Job Wait 5 Seconds', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(5)),
    });

    const getAudioJobStatusLambdaRole = new iam.Role(this, 'GetAudioJobStatusDefaultLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    })
    getAudioJobStatusLambdaRole.addToPolicy(lambdaCWLogGroupPolicy)
    const getAudioJobStatusLambda =  new lambda.Function(this, 'GetAudioJobtatusTask', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/jobstatus'),
      role: getAudioJobStatusLambdaRole,
      handler: 'get_job_status.handler'
    });

    const getTranscribeJobStatus = new tasks.LambdaInvoke(this, 'Get Transcribe Job Status', {
      lambdaFunction: getTranscribeAudio,
      outputPath: '$.Payload',
    });
    
    const getAudioJobStatus = new tasks.LambdaInvoke(this, 'Get Audio Job Status', {
      lambdaFunction: getAudioJobStatusLambda,
      outputPath: '$.Payload',
    });

    const getSpeechmarksJobStatusLambdaRole = new iam.Role(this, 'GetSpeechmarksJobStatusDefaultLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    })
    getSpeechmarksJobStatusLambdaRole.addToPolicy(lambdaCWLogGroupPolicy)
    const getSpeechmarksJobStatusLambda =  new lambda.Function(this, 'GetSpeechmarksJobtatusTask', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/jobstatus'),
      role: getSpeechmarksJobStatusLambdaRole,
      handler: 'get_job_status.handler'
    });
    
    const getSpeechmarksJobStatus = new tasks.LambdaInvoke(this, 'Get Speechmarks Job Status', {
      lambdaFunction: getSpeechmarksJobStatusLambda,
      outputPath: '$.Payload',
    });

    transcribeAudio.role?.attachInlinePolicy(
      new iam.Policy(this, 'TranscribeAudioRole', {
        statements: [startTranscribeAudioPolicy, S3ReadWritePolicy, ssmGetParameterPolicy]
      }) 
    )

    getTranscribeAudio.role?.attachInlinePolicy(
      new iam.Policy(this, 'GetTranscribeAudioRole', {
        statements: [getTranscribeAudioPolicy, S3ReadWritePolicy]
      })
    )

    translateTextLamda.role?.attachInlinePolicy(
      new iam.Policy(this, 'TranslateTextRole', {
        statements: [startTranslateTextPolicy, S3ReadWritePolicy]
      })
    ) 
    
    getAudioJobStatusLambda.role?.attachInlinePolicy(
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

    generateSubtitlesLamdbda.role?.attachInlinePolicy(
      new iam.Policy(this, 'SubtitlesPolicy', {
        statements: [S3ReadWritePolicy]
      })
    )

    const mediaConvertPolicy = 
      new iam.PolicyStatement({
      actions: ['mediaconvert:DescribeEndpoints', 'mediaconvert:CreateJob'],
      resources: ['*'],
    });

    const cloudfrontPolicy = 
      new iam.PolicyStatement({
      actions: ['cloudfront:CreateInvalidation'],
      resources: ['*'],
    });

    createMediaConvertJob.role?.attachInlinePolicy(
      new iam.Policy(this, 'MediaConvertPolicy', {
        statements: [mediaConvertPolicy, passRolePolicy, ssmGetParameterPolicy, S3ReadWritePolicy, cloudfrontPolicy]
      })
    )
    
    const audioJobSucceeded = new sfn.Succeed(this, 'Polly Audio Job Succeeded');

    const parallelFlow = new sfn.Parallel(this, "GenerateAudioAndSpeechMarks")
          .branch(new tasks.LambdaInvoke(this, "GeneratePollyAudioStep", {
            lambdaFunction: generatePollyAudio,
            timeout: cdk.Duration.seconds(300)})
            .next(waitAudioJob)
            .next(getAudioJobStatus)
            .next(new sfn.Choice(this, 'AudioJobCompleted?')
              .when(sfn.Condition.stringEquals('$.Payload.result', 'completed'), audioJobSucceeded)
              .otherwise(waitAudioJob)))
          .branch(new tasks.LambdaInvoke(this, "GenerateSpeechMarksStep", {
            lambdaFunction: generateSpeechMarks,
            timeout: cdk.Duration.seconds(300)})
            .next(waitSpeechmarksJob)
            .next(getSpeechmarksJobStatus)
            .next(new sfn.Choice(this, 'SpeechMarksJobCompleted?')
              .when(sfn.Condition.stringEquals('$.Payload.result', 'completed'), generateSubtitles)
              .otherwise(waitSpeechmarksJob)))
        .next(new tasks.LambdaInvoke(this, "CreateMediaConvertJobStep", {
            lambdaFunction: createMediaConvertJob
        }))

    const translateStep = new tasks.LambdaInvoke(this, "TranaslateTextStep", {
      lambdaFunction: translateTextLamda,
      timeout: cdk.Duration.seconds(300)})
      .next(parallelFlow)

    const stateMachine = new sfn.StateMachine(this, 'ProcessAudioWithSubtitles', {
      definition: new tasks.LambdaInvoke(this, "TranascribeAudioStep", {
        lambdaFunction: transcribeAudio,
        timeout: cdk.Duration.seconds(300)})
        .next(waitTranscribeAudioJob)
        .next(getTranscribeJobStatus)
        .next(new sfn.Choice(this, 'TranscribeJobCompleted?')
          .when(sfn.Condition.stringEquals('$.Payload.result', 'COMPLETED'), translateStep)
          .otherwise(waitTranscribeAudioJob))
      });

    const executeStateMachineLambdaRole = new iam.Role(this, 'ExecuteStateMachineDefaultLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    })
    executeStateMachineLambdaRole.addToPolicy(lambdaCWLogGroupPolicy)
    const executeStateMachine =  new lambda.Function(this, 'StartStateMachineExecution', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda/statemachine'),
      handler: 'state_machine.handler',
      role: executeStateMachineLambdaRole,
      environment: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn
      }
    });

    const stateMachinePolicy = new iam.PolicyStatement({
      actions: ['states:StartExecution'],
      resources: [stateMachine.stateMachineArn]
    });

    executeStateMachine.role?.attachInlinePolicy(
      new iam.Policy(this, 'ExecuteStateMachine', {
        statements: [stateMachinePolicy, ssmPutParameterPolicy]
      })
    )

    executeStateMachine.addEventSource(new S3EventSource(bucket, {
      events: [s3.EventType.OBJECT_CREATED],
      filters: [ { prefix: 'inputVideo/', suffix: '.mp4' } ]
    }))

    new cdk.CfnOutput(this, 'ConvertedVideo', {
      value: cdn_url,
      description: 'CDN url of the converted audio along with subtitles',
      exportName: 'ConvertedVideo',
    });

  }
}
