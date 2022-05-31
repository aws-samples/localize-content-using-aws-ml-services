import boto3
import os

def handler(event, context):
    bucket = os.environ.get('BUCKET_NAME')
    polly_language_code = os.environ.get('POLLY_LANGUAGE_CODE')
    polly_voice_id = os.environ.get('POLLY_VOICE_ID')
    polly_text_file = event['Payload']['polly_text_file']
    target_language_code = os.environ.get('TARGET_LANG_CODE')
    polly_engine = os.environ.get('POLLY_ENGINE')
    uid =  event['Payload']['uid']

    # Read the text from the file
    s3 = boto3.resource('s3')
    polly_text_file_object = s3.Object(bucket,polly_text_file)
    polly_text_bytes = polly_text_file_object.get()['Body'].read()
    polly_text = polly_text_bytes.decode('utf-8')

    # Set up the polly and translate services
    client = boto3.client('polly')

    # Use the translated text to create the synthesized speech
    response = client.start_speech_synthesis_task(Engine=polly_engine, LanguageCode=polly_language_code, OutputFormat="mp3",
                                                  SampleRate="22050", Text=polly_text, VoiceId=polly_voice_id,
                                                  TextType="text",
                                                  OutputS3BucketName=bucket,
                                                  OutputS3KeyPrefix=f'{uid}/synthesisOutput/{target_language_code}-polly-recording')
    
    return {'task_id':response['SynthesisTask']['TaskId'], 'uid':uid, 'polly_text_file':polly_text_file}