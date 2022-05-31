import boto3
import os
import json

def handler(event, context):

    s3 = boto3.resource('s3')
    transcribe_job_name = event['Payload']['transcribe_job_name']
    uid = event['Payload']['uid']

    # Get the job details and return the job status.
    transcribe = boto3.client('transcribe')
    response = transcribe.get_transcription_job(
        TranscriptionJobName=transcribe_job_name
    )

    return {'Payload':{'result':response['TranscriptionJob']['TranscriptionJobStatus'],
        'transcribe_job_name':transcribe_job_name,
        'uid': uid}}