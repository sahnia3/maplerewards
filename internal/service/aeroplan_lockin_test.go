package service

import "testing"

// The lock-in calculator is the Reddit-launch artifact — its filtering and
// savings math are public-facing and will be scrutinized by r/churningcanada.
// These pin the contract.

func TestLockIn_FilterByAirportRegionCabin(t *testing.T) {
	res := QueryAeroplanLockIn(LockInQuery{Airport: "YYZ", Region: "europe", Cabin: "business"})
	if len(res.AllMatched) == 0 {
		t.Fatal("YYZ/europe/business must match at least one routing")
	}
	for _, r := range res.AllMatched {
		if r.Region != "europe" || r.Cabin != "business" {
			t.Fatalf("filter leaked a non-matching row: %+v", r)
		}
		if r.Origin != "YYZ" && r.Origin != "any" {
			t.Fatalf("airport filter leaked origin %s", r.Origin)
		}
	}
}

func TestLockIn_TopSortedBySavingsDesc(t *testing.T) {
	res := QueryAeroplanLockIn(LockInQuery{}) // no filters → broad set
	if len(res.Top) == 0 {
		t.Fatal("unfiltered query must return top routings")
	}
	if len(res.Top) > 3 {
		t.Fatalf("Top must cap at 3, got %d", len(res.Top))
	}
	for i := 1; i < len(res.Top); i++ {
		if res.Top[i].SavingsCAD > res.Top[i-1].SavingsCAD {
			t.Fatalf("Top not sorted by savings desc: %v before %v",
				res.Top[i-1].SavingsCAD, res.Top[i].SavingsCAD)
		}
	}
}

func TestLockIn_SavingsMathConsistent(t *testing.T) {
	res := QueryAeroplanLockIn(LockInQuery{})
	for _, r := range res.AllMatched {
		if r.PointsSaved != r.PointsAfter-r.PointsBefore {
			t.Fatalf("%s: points_saved %d != after-before %d",
				r.DestinationLabel, r.PointsSaved, r.PointsAfter-r.PointsBefore)
		}
		// Savings should never be negative — booking now is never worse.
		if r.SavingsCAD < 0 {
			t.Fatalf("%s: negative savings %.2f", r.DestinationLabel, r.SavingsCAD)
		}
	}
}

func TestLockIn_NoMatchReturnsEmptyNotNil(t *testing.T) {
	res := QueryAeroplanLockIn(LockInQuery{Region: "mars"})
	if res.AllMatched == nil || res.Top == nil {
		t.Fatal("no-match must return empty slices, not nil (frontend reads .length)")
	}
	if len(res.AllMatched) != 0 {
		t.Fatalf("bogus region should match nothing, got %d", len(res.AllMatched))
	}
}
