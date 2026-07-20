package service

import (
	"errors"
	"net/smtp"
	"strings"
	"testing"
)

func TestSendPasswordResetEmailWithSendsConfiguredMessage(t *testing.T) {
	env := map[string]string{
		"SMTP_HOST":     "smtp.example.test",
		"SMTP_PORT":     "587",
		"SMTP_FROM":     "no-reply@example.test",
		"SMTP_USER":     "smtp-user@example.test",
		"SMTP_PASSWORD": "fake-app-password",
	}
	getenv := func(key string) string { return env[key] }

	var gotAddress string
	var gotAuth smtp.Auth
	var gotFrom string
	var gotRecipients []string
	var gotMessage string
	sendMail := func(address string, auth smtp.Auth, from string, recipients []string, message []byte) error {
		gotAddress = address
		gotAuth = auth
		gotFrom = from
		gotRecipients = append([]string(nil), recipients...)
		gotMessage = string(message)
		return nil
	}

	resetURL := "https://dishy.example.test/reset-password?token=fake-reset-token"
	err := sendPasswordResetEmailWith(
		"owner@example.test",
		resetURL,
		getenv,
		sendMail,
	)
	if err != nil {
		t.Fatalf("sendPasswordResetEmailWith() error = %v", err)
	}
	if gotAddress != "smtp.example.test:587" {
		t.Fatalf("SMTP address = %q, want %q", gotAddress, "smtp.example.test:587")
	}
	if gotAuth == nil {
		t.Fatal("SMTP auth is nil, want configured authentication")
	}
	if gotFrom != "no-reply@example.test" {
		t.Fatalf("envelope from = %q, want %q", gotFrom, "no-reply@example.test")
	}
	if len(gotRecipients) != 1 || gotRecipients[0] != "owner@example.test" {
		t.Fatalf("recipients = %#v, want owner@example.test", gotRecipients)
	}
	for _, expected := range []string{
		"From: Restaurant Hub <no-reply@example.test>",
		"To: owner@example.test",
		"Subject: Reset your Restaurant Hub password",
		resetURL,
		"1 hour",
	} {
		if !strings.Contains(gotMessage, expected) {
			t.Fatalf("message does not contain %q\nmessage:\n%s", expected, gotMessage)
		}
	}
}

func TestSendPasswordResetEmailWithRejectsIncompleteConfiguration(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
	}{
		{
			name: "missing host",
			env: map[string]string{
				"SMTP_PORT":     "587",
				"SMTP_FROM":     "no-reply@example.test",
				"SMTP_USER":     "smtp-user@example.test",
				"SMTP_PASSWORD": "fake-app-password",
			},
		},
		{
			name: "missing password",
			env: map[string]string{
				"SMTP_HOST": "smtp.example.test",
				"SMTP_PORT": "587",
				"SMTP_FROM": "no-reply@example.test",
				"SMTP_USER": "smtp-user@example.test",
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			called := false
			err := sendPasswordResetEmailWith(
				"owner@example.test",
				"https://dishy.example.test/reset-password?token=fake-reset-token",
				func(key string) string { return test.env[key] },
				func(string, smtp.Auth, string, []string, []byte) error {
					called = true
					return nil
				},
			)
			if !errors.Is(err, ErrPasswordResetEmailNotConfigured) {
				t.Fatalf("error = %v, want ErrPasswordResetEmailNotConfigured", err)
			}
			if called {
				t.Fatal("SMTP delivery was called with incomplete configuration")
			}
		})
	}
}

func TestSendPasswordResetEmailWithRejectsHeaderInjection(t *testing.T) {
	env := map[string]string{
		"SMTP_HOST":     "smtp.example.test",
		"SMTP_PORT":     "587",
		"SMTP_FROM":     "no-reply@example.test",
		"SMTP_USER":     "smtp-user@example.test",
		"SMTP_PASSWORD": "fake-app-password",
	}
	called := false
	err := sendPasswordResetEmailWith(
		"owner@example.test\r\nBcc: attacker@example.test",
		"https://dishy.example.test/reset-password?token=fake-reset-token",
		func(key string) string { return env[key] },
		func(string, smtp.Auth, string, []string, []byte) error {
			called = true
			return nil
		},
	)
	if err == nil {
		t.Fatal("error = nil, want invalid recipient error")
	}
	if called {
		t.Fatal("SMTP delivery was called for a recipient containing a newline")
	}
}
