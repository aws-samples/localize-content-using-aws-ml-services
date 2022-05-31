import boto3

def handler(event, context):
    task_id = event['Payload']
    client = boto3.client('polly')

    task_status = client.get_speech_synthesis_task(TaskId=task_id)

    status = task_status['SynthesisTask']['TaskStatus']

    file_destination = task_status['SynthesisTask']['OutputUri']

    is_audio_task =  True if task_status['SynthesisTask']['OutputFormat'] == 'mp3' else False
    
    if is_audio_task:
        return {'result':status, 'Payload': task_id, 'audio_file_destination': file_destination}
    else:
        return {'result':status, 'Payload': task_id, 'speechmarks_file_destination': file_destination}