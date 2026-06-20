package service

import (
	"strings"
	"testing"
)

// TestParseAnthropicStream_TextDeltas verifies a prose-only stream assembles
// into a single text block, forwards every delta to onToken in order, and reads
// stop_reason + usage from the message frames.
func TestParseAnthropicStream_TextDeltas(t *testing.T) {
	sse := strings.Join([]string{
		`event: message_start`,
		`data: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":42,"output_tokens":1}}}`,
		``,
		`event: content_block_start`,
		`data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
		``,
		`event: content_block_delta`,
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Your "}}`,
		``,
		`event: content_block_delta`,
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Cobalt "}}`,
		``,
		`event: content_block_delta`,
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"at 5×."}}`,
		``,
		`event: content_block_stop`,
		`data: {"type":"content_block_stop","index":0}`,
		``,
		`event: message_delta`,
		`data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":9}}`,
		``,
		`event: message_stop`,
		`data: {"type":"message_stop"}`,
		``,
	}, "\n")

	var tokens []string
	out, err := parseAnthropicStream(strings.NewReader(sse), func(text string) {
		tokens = append(tokens, text)
	})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	wantTokens := []string{"Your ", "Cobalt ", "at 5×."}
	if strings.Join(tokens, "|") != strings.Join(wantTokens, "|") {
		t.Fatalf("tokens = %v, want %v", tokens, wantTokens)
	}
	if len(out.Content) != 1 || out.Content[0].Type != "text" {
		t.Fatalf("content = %+v, want one text block", out.Content)
	}
	if out.Content[0].Text != "Your Cobalt at 5×." {
		t.Fatalf("assembled text = %q", out.Content[0].Text)
	}
	if out.StopReason != "end_turn" {
		t.Fatalf("stop_reason = %q, want end_turn", out.StopReason)
	}
	if out.ID != "msg_1" {
		t.Fatalf("id = %q, want msg_1", out.ID)
	}
	if out.Usage.InputTokens != 42 || out.Usage.OutputTokens != 9 {
		t.Fatalf("usage = %+v, want input=42 output=9", out.Usage)
	}
}

// TestParseAnthropicStream_ToolUse verifies a tool_use block assembles its
// input from partial_json deltas, never forwards those deltas as prose tokens,
// and round-trips the tool id/name + stop_reason=tool_use.
func TestParseAnthropicStream_ToolUse(t *testing.T) {
	sse := strings.Join([]string{
		`data: {"type":"message_start","message":{"id":"msg_2","usage":{"input_tokens":10,"output_tokens":1}}}`,
		`data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_9","name":"search_award_space","input":{}}}`,
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"origin\":"}}`,
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\"BOM\"}"}}`,
		`data: {"type":"content_block_stop","index":0}`,
		`data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}`,
		`data: {"type":"message_stop"}`,
	}, "\n")

	var tokens []string
	out, err := parseAnthropicStream(strings.NewReader(sse), func(text string) {
		tokens = append(tokens, text)
	})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(tokens) != 0 {
		t.Fatalf("tool_use must NOT forward prose tokens, got %v", tokens)
	}
	if len(out.Content) != 1 || out.Content[0].Type != "tool_use" {
		t.Fatalf("content = %+v, want one tool_use block", out.Content)
	}
	b := out.Content[0]
	if b.ID != "toolu_9" || b.Name != "search_award_space" {
		t.Fatalf("tool_use id/name = %q/%q", b.ID, b.Name)
	}
	if string(b.Input) != `{"origin":"BOM"}` {
		t.Fatalf("assembled input = %s, want {\"origin\":\"BOM\"}", string(b.Input))
	}
	if out.StopReason != "tool_use" {
		t.Fatalf("stop_reason = %q, want tool_use", out.StopReason)
	}
}

// TestParseAnthropicStream_MixedAndMalformed verifies the parser preserves
// block order (text preamble then tool_use), skips malformed/non-data frames,
// and tolerates a missing nil onToken.
func TestParseAnthropicStream_MixedAndMalformed(t *testing.T) {
	sse := strings.Join([]string{
		`: keepalive comment`,
		`data: {"type":"message_start","message":{"id":"msg_3"}}`,
		`data: not-json-should-be-skipped`,
		`data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":"Let me check. "}}`,
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"One sec."}}`,
		`data: {"type":"content_block_stop","index":0}`,
		`data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"get_program_cpp"}}`,
		`data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{}"}}`,
		`data: {"type":"content_block_stop","index":1}`,
		`data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}`,
		`data: [DONE]`,
	}, "\n")

	// nil onToken must not panic.
	out, err := parseAnthropicStream(strings.NewReader(sse), nil)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(out.Content) != 2 {
		t.Fatalf("want 2 blocks (text, tool_use), got %d: %+v", len(out.Content), out.Content)
	}
	if out.Content[0].Type != "text" || out.Content[0].Text != "Let me check. One sec." {
		t.Fatalf("block 0 = %+v, want assembled text", out.Content[0])
	}
	if out.Content[1].Type != "tool_use" || out.Content[1].Name != "get_program_cpp" {
		t.Fatalf("block 1 = %+v, want tool_use get_program_cpp", out.Content[1])
	}
}

// TestParseAnthropicStream_ErrorFrame verifies an SSE error frame surfaces as a
// Go error so the caller can fall back to the buffered path.
func TestParseAnthropicStream_ErrorFrame(t *testing.T) {
	sse := strings.Join([]string{
		`data: {"type":"message_start","message":{"id":"msg_4"}}`,
		`data: {"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}`,
	}, "\n")
	_, err := parseAnthropicStream(strings.NewReader(sse), nil)
	if err == nil || !strings.Contains(err.Error(), "overloaded") {
		t.Fatalf("want overloaded error, got %v", err)
	}
}
