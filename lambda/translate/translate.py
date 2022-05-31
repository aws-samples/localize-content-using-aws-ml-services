import boto3
import os
import json

def handler(event, context):

    bucket = os.environ.get('BUCKET_NAME')
    target_language_code = os.environ.get('TARGET_LANG_CODE')

    translate = boto3.client('translate')
    s3 = boto3.resource('s3')

    uid = event['Payload']['uid']
    transcribe_job_name = event['Payload']['transcribe_job_name']

    # Read the transcribe output from the previous step
    transcribe_result_object = s3.Object(bucket,f'{uid}/transcribeOutput/{transcribe_job_name}.json')
    transcribe_result_bytes = transcribe_result_object.get()['Body'].read()
    transcribe_result_json = json.loads(transcribe_result_bytes)
    transcribe_text = transcribe_result_json['results']['transcripts'][0]['transcript']
    source_language_code = transcribe_result_json['results']['language_code']

    # Real-time translation
    response = translate.translate_text(
        Text=transcribe_text,
        SourceLanguageCode=source_language_code,
        TargetLanguageCode=target_language_code,
    )

    translated_text = response['TranslatedText']

    translate_object = s3.Object(bucket,f'{uid}/translateOutput/translated_text.txt')
    translate_object.put(Body=translated_text)

    return {'uid':uid, 'polly_text_file':f'{uid}/translateOutput/translated_text.txt'}