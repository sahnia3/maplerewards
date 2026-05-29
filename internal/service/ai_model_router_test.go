package service

import "testing"

// Locks the chat cost-routing contract: simple turns must go to the cheap
// model, award/trip/points turns and research mode to the strong model.
func TestSelectChatModel(t *testing.T) {
	s := &AIService{modelID: "sonnet", fastModelID: "haiku"}

	cases := []struct {
		name  string
		req   ChatRequest
		isPro bool
		want  string
	}{
		{"simple grocery q", ChatRequest{Message: "which card is best for groceries"}, false, "haiku"},
		{"simple explain", ChatRequest{Message: "explain the Amex Cobalt card"}, false, "haiku"},
		{"greeting", ChatRequest{Message: "hi there"}, false, "haiku"},
		{"award routing", ChatRequest{Message: "how many points to fly YYZ to LHR business"}, false, "sonnet"},
		{"transfer q", ChatRequest{Message: "should I transfer Amex MR to Aeroplan"}, false, "sonnet"},
		{"trip planning", ChatRequest{Message: "plan a trip to Tokyo with my points"}, false, "sonnet"},
		{"research mode forces strong for Pro", ChatRequest{Message: "hi", ResearchMode: true}, true, "sonnet"},
		{"research mode does NOT force strong for free", ChatRequest{Message: "hi", ResearchMode: true}, false, "haiku"},
		{"long message forces strong", ChatRequest{Message: string(make([]byte, 300))}, false, "sonnet"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := s.selectChatModel(c.req, c.isPro); got != c.want {
				t.Errorf("selectChatModel(%q) = %q, want %q", c.req.Message, got, c.want)
			}
		})
	}
}

// Routing must be a no-op when disabled (fast == strong, or unset).
func TestSelectChatModel_DisabledFallsBackToStrong(t *testing.T) {
	s := &AIService{modelID: "sonnet", fastModelID: ""}
	if got := s.selectChatModel(ChatRequest{Message: "hi"}, false); got != "sonnet" {
		t.Errorf("disabled routing must use strong model, got %q", got)
	}
	s2 := &AIService{modelID: "sonnet", fastModelID: "sonnet"}
	if got := s2.selectChatModel(ChatRequest{Message: "hi"}, false); got != "sonnet" {
		t.Errorf("fast==strong must use strong model, got %q", got)
	}
}
