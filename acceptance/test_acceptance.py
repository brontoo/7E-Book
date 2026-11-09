import hashlib
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import common

class AcceptanceGuards(unittest.TestCase):
    def setUp(self):
        self.raw=Path('media/seven-emirates/manifest.json').read_bytes()
    def test_exact_manifest_checks_all_1673_records(self):
        self.assertEqual(common.validate_manifest(self.raw)['recordsVerified'],1673)
    def test_wrong_manifest_is_rejected(self):
        with self.assertRaises(ValueError):common.validate_manifest(self.raw+b'\n')
    def test_record_dimensions_indices_and_duplicate_keys_are_rejected_even_with_updated_hash(self):
        for field,value in [('index',3),('width',1280),('url','../escape.webp')]:
            m=json.loads(self.raw);m['frames'][0][field]=value;raw=json.dumps(m).encode()
            with patch.object(common,'EXPECTED_MANIFEST_SHA',hashlib.sha256(raw).hexdigest()),self.assertRaises(ValueError):common.validate_manifest(raw)
    def test_empty_or_partial_browser_report_never_passes(self):
        m=common.validate_manifest(self.raw)
        self.assertFalse(common.automated_summary(m,{},dict(passed=True),0)['automatedPassed'])
    def test_original_model_difference_and_unknown_are_reported_distinctly(self):
        m=common.validate_manifest(self.raw)
        self.assertEqual(common.automated_summary(m,dict(originalModelComparison=dict(sameBytes=False)),{},1)['originalModelStatus'],'different-bytes')
        self.assertEqual(common.automated_summary(m,{}, {},1)['originalModelStatus'],'unverified')
    def test_owner_api_mutation_is_aborted_without_forwarding(self):
        class Context:
            def route(self,pattern,handler):self.handler=handler
        class Request:
            method='POST';url='http://127.0.0.1:4174/api/trpc/missions.submit'
        class Route:
            request=Request();aborted=False
            def abort(self):self.aborted=True
            def fulfill(self,**kwargs):raise AssertionError('Mutation must not be fulfilled')
        ctx=Context();blocked=[]
        common.bind_read_only_api(ctx,Path.cwd(),{'verified':[]},blocked)
        route=Route();ctx.handler(route)
        self.assertTrue(route.aborted);self.assertEqual(len(blocked),1)

    def test_non_api_mutations_are_also_blocked_and_gets_continue_unchanged(self):
        class Context:
            handlers=[]
            def route(self,pattern,handler):self.handlers.append((pattern,handler))
        class Request:method='POST'
        class Route:
            request=Request();aborted=False;continued=False
            def abort(self):self.aborted=True
            def continue_(self):self.continued=True
        ctx=Context();ctx.handlers=[];blocked=[]
        common.bind_read_only_api(ctx,Path.cwd(),{'verified':[]},blocked)
        guard=next(fn for pattern,fn in ctx.handlers if pattern=='**/*')
        route=Route();guard(route);self.assertTrue(route.aborted);self.assertFalse(route.continued)
        route=Route();route.request=type('ReadRequest',(),{'method':'GET'})();guard(route)
        self.assertTrue(route.continued);self.assertFalse(route.aborted)

    def test_automated_success_cannot_approve_physical_or_educational_acceptance(self):
        m=common.validate_manifest(self.raw)
        b=dict(remoteVerified=True,modelInitialized=True,samples=[dict(index=i) for c in m['chapters'] for i in (c['startInclusive'],c['endExclusive']-1)],timings=dict(boundaryKeyToDisplayedMs=list(range(12))))
        summary=common.automated_summary(m,b,dict(passed=True),0,dict(verified=True,sameBytes=True))
        self.assertTrue(summary['automatedPassed']);self.assertFalse(summary['physicalCameraVerified']);self.assertIn('NO-GO',summary['productionRecommendation'])
        self.assertFalse(common.automated_summary(m,b,dict(passed=False),0,dict(verified=True,sameBytes=True))['automatedPassed'])
        self.assertFalse(common.automated_summary(m,b,dict(passed=True),0,dict(verified=True,sameBytes=False))['automatedPassed'])

if __name__=='__main__':unittest.main()
