import unittest
from measured_gaming_aperture import choose

def receipt(method='color',x=.1,status='measured-rectangle',count=1):
    return {'method':method,'status':status,'proposals':[{'box':{'x':x,'y':.2,'w':.2,'h':.2}} for _ in range(count)]}
class SharedGeometryTests(unittest.TestCase):
    def test_existing_color_preserved(self):
        a=receipt();self.assertIs(choose(a,receipt('edge',count=0,status='unresolved')),a)
    def test_edge_is_reused_when_no_color_candidate(self):
        a=receipt('edge');self.assertIs(choose(receipt(count=0,status='unresolved'),a),a)
    def test_conflicting_branches_or_multiple_candidates_abstain(self):
        self.assertIsNone(choose(receipt(),receipt('edge',x=.5)))
        self.assertIsNone(choose(receipt(count=2,status='unresolved'),receipt('edge')))
        a=receipt();self.assertIs(choose(a,receipt('edge',count=2,status='unresolved')),a)
    def test_matching_branches_keep_existing_method(self):
        a=receipt();self.assertIs(choose(a,receipt('edge')),a)
    def test_unresolved_branch_never_upgrades_itself(self):
        self.assertIsNone(choose(receipt(count=0,status='unresolved'),receipt('edge',status='unresolved')))
    def test_failed_budget_or_malformed_branch_is_not_empty_observation(self):
        for b in [{},{'status':'budget-rejected','proposals':[]},{'status':'failed','proposals':[]},{'status':'unresolved','proposals':None},receipt(count=0)]:
            with self.assertRaises(ValueError):choose(receipt(),b)
if __name__=='__main__':unittest.main()
