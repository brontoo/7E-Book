"""Run the exact reviewed acceptance script, plus strict manifest/performance gates."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlparse
from common import EXPO_COMMIT, fetch_manifest, automated_summary, compare_models
from performance import run as performance_run

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--app',type=Path,required=True)
p.add_argument('--base-url',default='http://127.0.0.1:4174')
p.add_argument('--report-dir',type=Path,required=True)
p.add_argument('--channel',choices=['chrome','msedge'])
a=p.parse_args();a.app=a.app.resolve();a.report_dir=a.report_dir.resolve()
qa_root=Path(__file__).resolve().parent.parent
if a.report_dir.is_relative_to(a.app) or a.report_dir.is_relative_to(qa_root):raise SystemExit('Reports must stay outside both source checkouts')
a.report_dir.mkdir(parents=True,exist_ok=True)
if urlparse(a.base_url).hostname not in ('localhost','127.0.0.1'):raise SystemExit('Use localhost preview only')
if subprocess.check_output(['git','-C',str(a.app),'rev-parse','HEAD'],text=True).strip()!=EXPO_COMMIT:
    raise SystemExit('Refusing unreviewed application HEAD')
if subprocess.run(['git','-C',str(a.app),'diff','--quiet','HEAD']).returncode:
    raise SystemExit('Refusing modified tracked application files')
def write(name,value):a.report_dir.joinpath(name).write_text(json.dumps(value,indent=2)+'\n')
try:manifest=fetch_manifest()
except Exception as error:manifest=dict(passed=False,recordsVerified=0,error=str(error))
write('manifest.json',manifest)
models=compare_models();write('models.json',models)
proxy=dict(server=os.environ['HTTPS_PROXY'],bypass='localhost,127.0.0.1') if os.environ.get('HTTPS_PROXY') else None
executable=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE')
if not executable and Path('/usr/bin/chromium').exists():executable='/usr/bin/chromium'
try:performance=performance_run(a.app,a.base_url,executable,a.channel,proxy)
except Exception as error:performance=dict(passed=False,error=str(error))
write('performance.json',performance)
command=[sys.executable,str(a.app/'scripts/qa-real-book.py'),'--base-url',a.base_url,'--report',str(a.report_dir/'browser.json')]
if a.channel:command+=['--channel',a.channel]
write('browser.json',dict(remoteVerified=False,modelInitialized=False,error='Browser runner has not produced a result yet'))
try:exit_code=subprocess.run(command,timeout=900).returncode
except subprocess.TimeoutExpired:exit_code=124
try:browser=json.loads(a.report_dir.joinpath('browser.json').read_text())
except (OSError,ValueError):browser=dict(remoteVerified=False,modelInitialized=False,error='Pinned browser runner did not produce a JSON report',exitCode=exit_code)
summary=automated_summary(manifest,browser,performance,exit_code,models)
write('summary.json',summary);print(json.dumps(summary,indent=2))
raise SystemExit(0 if summary['automatedPassed'] else 1)
