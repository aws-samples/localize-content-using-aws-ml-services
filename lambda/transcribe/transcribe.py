import boto3
import os
import uuid

def handler(event, context):

    bucket = os.environ.get('BUCKET_NAME')

    ssm = boto3.client('ssm')
    mediaconvert_video_filename_response = ssm.get_parameter(Name='input_video_file')
    mediaconvert_video_filename = mediaconvert_video_filename_response['Parameter']['Value']
    media_format = mediaconvert_video_filename.rsplit('/', 1)[-1]
    media_format = media_format.rsplit('.', 1)[-1]

    transcribe = boto3.client('transcribe')
    uid = str(uuid.uuid4())
    jobName = f"transcribe_{uid}"
    outputKey = f"{uid}/transcribeOutput/"

    # Start the transcription job with uploaded video as input
    response = transcribe.start_transcription_job(
        TranscriptionJobName = jobName,
        MediaFormat=media_format,
        Media = {"MediaFileUri": "s3://"+bucket+"/"+mediaconvert_video_filename},
        OutputBucketName=bucket,
        OutputKey=outputKey,
        IdentifyLanguage=True
    )

    return {'transcribe_job_name':response['TranscriptionJob']['TranscriptionJobName'],'uid':uid}
