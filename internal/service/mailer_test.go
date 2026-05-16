package service

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestResendMailer_SendBuildsCorrectRequest(t *testing.T) {
	var capturedAuth, capturedCT string
	var capturedBody map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		capturedCT = r.Header.Get("Content-Type")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &capturedBody)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"abc"}`))
	}))
	defer srv.Close()

	m := &ResendMailer{
		apiKey:   "test-key",
		from:     "Maple Rewards <hello@maplerewards.app>",
		client:   srv.Client(),
		endpoint: srv.URL,
	}

	err := m.Send(context.Background(), MailMessage{
		To:      []string{"user@example.com"},
		Subject: "Verify your account",
		HTML:    "<p>Click here</p>",
		Text:    "Click here",
		Tag:     "verify",
	})
	if err != nil {
		t.Fatalf("Send returned err: %v", err)
	}

	if capturedAuth != "Bearer test-key" {
		t.Errorf("Authorization header: got %q, want %q", capturedAuth, "Bearer test-key")
	}
	if capturedCT != "application/json" {
		t.Errorf("Content-Type: got %q, want application/json", capturedCT)
	}
	if capturedBody["from"] != "Maple Rewards <hello@maplerewards.app>" {
		t.Errorf("from: got %v", capturedBody["from"])
	}
	if capturedBody["subject"] != "Verify your account" {
		t.Errorf("subject: got %v", capturedBody["subject"])
	}
	if capturedBody["html"] != "<p>Click here</p>" {
		t.Errorf("html: got %v", capturedBody["html"])
	}
	if capturedBody["text"] != "Click here" {
		t.Errorf("text: got %v", capturedBody["text"])
	}

	toList, ok := capturedBody["to"].([]any)
	if !ok || len(toList) != 1 || toList[0] != "user@example.com" {
		t.Errorf("to: got %v", capturedBody["to"])
	}

	tags, ok := capturedBody["tags"].([]any)
	if !ok || len(tags) != 1 {
		t.Fatalf("tags: got %v", capturedBody["tags"])
	}
	tag := tags[0].(map[string]any)
	if tag["name"] != "category" || tag["value"] != "verify" {
		t.Errorf("tags[0]: got %v", tag)
	}
}

func TestResendMailer_SendRejectsEmptyRecipients(t *testing.T) {
	m := &ResendMailer{apiKey: "k", from: "x", client: http.DefaultClient, endpoint: "https://unused"}
	err := m.Send(context.Background(), MailMessage{Subject: "s", Text: "t"})
	if err == nil || !strings.Contains(err.Error(), "no recipients") {
		t.Fatalf("expected no-recipients error, got %v", err)
	}
}

func TestResendMailer_SendRejectsEmptyBody(t *testing.T) {
	m := &ResendMailer{apiKey: "k", from: "x", client: http.DefaultClient, endpoint: "https://unused"}
	err := m.Send(context.Background(), MailMessage{To: []string{"a@b.co"}, Subject: "s"})
	if err == nil || !strings.Contains(err.Error(), "HTML and Text both empty") {
		t.Fatalf("expected empty-body error, got %v", err)
	}
}

func TestResendMailer_SendSurfacesProviderError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"bad api key"}`))
	}))
	defer srv.Close()

	m := &ResendMailer{
		apiKey:   "bad",
		from:     "x",
		client:   srv.Client(),
		endpoint: srv.URL,
	}

	err := m.Send(context.Background(), MailMessage{To: []string{"a@b.co"}, Subject: "s", Text: "t"})
	if err == nil || !strings.Contains(err.Error(), "401") || !strings.Contains(err.Error(), "bad api key") {
		t.Fatalf("expected wrapped 401 error, got %v", err)
	}
}

func TestLogMailer_SendNeverErrors(t *testing.T) {
	err := LogMailer{}.Send(context.Background(), MailMessage{
		To:      []string{"a@b.co"},
		Subject: "s",
		Text:    "t",
	})
	if err != nil {
		t.Fatalf("LogMailer.Send returned err: %v", err)
	}
}
