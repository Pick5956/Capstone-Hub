package controller

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"gorm.io/gorm"
)

func TestPublicAPIError(t *testing.T) {
	tests := []struct {
		name        string
		status      int
		err         error
		wantStatus  int
		wantMessage string
		wantCode    string
	}{
		{
			name:        "keeps a domain validation message",
			status:      http.StatusBadRequest,
			err:         errors.New("quantity must be greater than zero"),
			wantStatus:  http.StatusBadRequest,
			wantMessage: "quantity must be greater than zero",
			wantCode:    "invalid_request",
		},
		{
			name:        "maps missing records without leaking ORM text",
			status:      http.StatusBadRequest,
			err:         gorm.ErrRecordNotFound,
			wantStatus:  http.StatusNotFound,
			wantMessage: "resource not found",
			wantCode:    "not_found",
		},
		{
			name:        "hides database constraint details",
			status:      http.StatusBadRequest,
			err:         errors.New(`ERROR: duplicate key value violates unique constraint "private_constraint" (SQLSTATE 23505)`),
			wantStatus:  http.StatusConflict,
			wantMessage: "resource already exists",
			wantCode:    "conflict",
		},
		{
			name:        "hides internal errors",
			status:      http.StatusInternalServerError,
			err:         errors.New("provider returned credential-shaped diagnostics"),
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "internal server error",
			wantCode:    "internal_error",
		},
		{
			name:        "maps dependency timeout",
			status:      http.StatusInternalServerError,
			err:         context.DeadlineExceeded,
			wantStatus:  http.StatusServiceUnavailable,
			wantMessage: "service temporarily unavailable",
			wantCode:    "service_unavailable",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			status, message, code := publicAPIError(test.status, test.err)
			if status != test.wantStatus || message != test.wantMessage || code != test.wantCode {
				t.Fatalf(
					"publicAPIError() = (%d, %q, %q), want (%d, %q, %q)",
					status,
					message,
					code,
					test.wantStatus,
					test.wantMessage,
					test.wantCode,
				)
			}
		})
	}
}
