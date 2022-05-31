import boto3

def handler(event, context):
    task_id = event['Payload']['task_id']
    uid = event['Payload']['uid']
    polly_text_file = event['Payload']['polly_text_file']
    client = boto3.client('polly')

    task_status = client.get_speech_synthesis_task(TaskId=task_id)

    status = task_status['SynthesisTask']['TaskStatus']

    file_destination = task_status['SynthesisTask']['OutputUri']

    is_audio_task =  True if task_status['SynthesisTask']['OutputFormat'] == 'mp3' else False
    
    if is_audio_task:
        return {'Payload':{'result':status, 'task_id': task_id, 'audio_file_destination': file_destination, 'uid':uid, 'polly_text_file':polly_text_file}}
    else:
        return {'Payload':{'result':status, 'task_id': task_id, 'speechmarks_file_destination': file_destination, 'uid':uid, 'polly_text_file':polly_text_file}}