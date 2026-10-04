"""Read and repair only the existing money Pages project's build configuration."""
import json
import os
import re
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ACCOUNT = 'baf10699a2089d2c2db597f076e3bbf7'
PROJECT = 'money'
EXPECTED_DOMAIN = 'money-ab4.pages.dev'
BASE = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/pages/projects/{PROJECT}'
DESIRED = {'build_command': 'npm run build', 'destination_dir': 'dist', 'root_dir': ''}
TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '')
MASKS = [TOKEN] if TOKEN else []


def safe(value):
    text = str(value)
    for secret in sorted(MASKS, key=len, reverse=True):
        if secret:
            text = text.replace(secret, '[REDACTED]')
    text = re.sub(r'(?:sb_secret_|github_pat_|ghp_)[A-Za-z0-9_-]+', '[REDACTED]', text)
    text = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED]', text)
    return text


def emit(value):
    # Escape workflow command prefixes that may originate in external build logs.
    for line in safe(value).splitlines():
        print('Cloudflare: ' + line, flush=True)


def api(path='', method='GET', payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    request = Request(BASE + path, data=body, method=method,
                      headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'})
    try:
        with urlopen(request, timeout=45) as response:
            result = json.load(response)
    except HTTPError as error:
        try:
            detail = json.load(error).get('errors', [])
        except (ValueError, AttributeError):
            detail = []
        raise RuntimeError(f'API HTTP {error.code}: {safe(detail)}') from None
    if not result.get('success'):
        raise RuntimeError(safe(result.get('errors', 'Cloudflare API failed')))
    return result['result']


def mask_environment(project):
    for config in project.get('deployment_configs', {}).values():
        for value in config.get('env_vars', {}).values():
            secret = value.get('value') if isinstance(value, dict) else None
            if isinstance(secret, str) and secret:
                MASKS.append(secret)


def show_logs(deployment_id):
    result = api(f'/deployments/{deployment_id}/history/logs')
    for item in result.get('data', [])[-100:]:
        emit(item.get('line', ''))


def main():
    if not TOKEN:
        emit('CLOUDFLARE_API_TOKEN is not registered in GitHub Actions secrets yet. No Cloudflare action performed.')
        return
    project = api()
    mask_environment(project)
    if project.get('name') != PROJECT or project.get('subdomain') != EXPECTED_DOMAIN:
        raise RuntimeError('Project/domain mismatch; no settings changed.')
    source = project.get('source', {}).get('config', {})
    if source.get('owner') != 'kimsanghwa14-cpu' or source.get('repo_name') != 'money':
        raise RuntimeError('Connected repository mismatch; no settings changed.')
    current = project.get('build_config', {})
    emit('Current build settings: ' + json.dumps({k: current.get(k) for k in DESIRED}))
    production = project.get('deployment_configs', {}).get('production', {})
    variables = production.get('env_vars', {})
    emit('Production environment variable names: ' + ', '.join(sorted(variables)))
    emit('Production Node version: ' + str(variables.get('NODE_VERSION', {}).get('value', 'Cloudflare default')))
    deployments = api('/deployments?env=production&per_page=10')
    latest = next((d for d in deployments if d.get('environment') == 'production' and not d.get('is_skipped')), None)
    if latest:
        emit('Previous deployment stage: ' + json.dumps(latest.get('latest_stage', {})))
        show_logs(latest['id'])
    if any(current.get(key, '') != value for key, value in DESIRED.items()):
        # Patch build settings only; retain authentication, environment bindings, and domains.
        updated = api(method='PATCH', payload={'build_config': DESIRED})
        if any(updated.get('build_config', {}).get(key, '') != value for key, value in DESIRED.items()):
            raise RuntimeError('Build settings were not applied as requested.')
        emit('Applied build command npm run build, output dist, repository root.')
    else:
        emit('Build settings already match the Pages application.')
    if latest and latest.get('latest_stage', {}).get('status') == 'failure':
        retry = api(f"/deployments/{latest['id']}/retry", method='POST')
        emit('Started deployment retry: ' + str(retry['id']))
        for _ in range(18):
            time.sleep(10)
            status = api(f"/deployments/{retry['id']}")
            stage = status.get('latest_stage', {})
            emit('Deployment stage: ' + json.dumps(stage))
            if stage.get('status') == 'failure' or (stage.get('name') == 'deploy' and stage.get('status') == 'success'):
                show_logs(retry['id'])
                if stage.get('status') == 'failure':
                    raise RuntimeError('Cloudflare deployment failed; inspect the sanitized logs above.')
                emit('Cloudflare deployment succeeded: https://' + EXPECTED_DOMAIN)
                return
        emit('Deployment still running. Check the Cloudflare deployment result.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit(error)
        sys.exit(1)
