package service

// ---------------------------------------------------------------------------
// Voice notes → text
//
// The phone has no speech recognition of its own inside Expo Go, so the app
// records a short clip and sends it here. Groq hosts Whisper on an
// OpenAI-compatible endpoint, and the key rotation and parking are the same
// ones every other provider call uses, so a spent key steps aside instead of
// failing the request.
//
// The text comes straight back to the composer for the owner to read and edit.
// Nothing is sent to the assistant until they press send, so a misheard word is
// theirs to fix, never a command that ran on a guess.
// ---------------------------------------------------------------------------

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"time"
)

// Roughly a minute of compressed speech; longer notes are a different feature.
const maxTranscribeAudioBytes = 6 << 20

const defaultTranscribeModel = "whisper-large-v3-turbo"

// transcribeExtensions maps what the phone records to what Whisper accepts. The
// extension matters: the endpoint reads the format from the filename.
var transcribeExtensions = map[string]string{
	"audio/m4a":   "m4a",
	"audio/mp4":   "m4a",
	"audio/x-m4a": "m4a",
	"audio/aac":   "m4a",
	"audio/mpeg":  "mp3",
	"audio/mp3":   "mp3",
	"audio/wav":   "wav",
	"audio/x-wav": "wav",
	"audio/webm":  "webm",
	"audio/ogg":   "ogg",
}

func transcribeModelName() string {
	if name := strings.TrimSpace(os.Getenv("GROQ_TRANSCRIBE_MODEL")); name != "" {
		return name
	}
	return defaultTranscribeModel
}

// TranscribeForOwner is the owner-gated entry point used by the controller.
// language is a hint ("th"/"en"); an empty string lets Whisper decide.
func (s *AIService) TranscribeForOwner(actor AIActorContext, audioBase64, mimeType, language string) (string, error) {
	if actor.RestaurantID == 0 || actor.OwnerUserID == 0 || actor.Role != "owner" {
		return "", errors.New("authenticated restaurant owner context is required")
	}
	trimmed := strings.TrimSpace(audioBase64)
	if trimmed == "" {
		return "", errors.New("no audio was sent")
	}
	audio, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil {
		return "", errors.New("the audio could not be read")
	}
	if len(audio) == 0 {
		return "", errors.New("the recording was empty")
	}
	if len(audio) > maxTranscribeAudioBytes {
		return "", errors.New("the recording is too long — keep it under a minute")
	}
	extension, ok := transcribeExtensions[strings.ToLower(strings.TrimSpace(mimeType))]
	if !ok {
		return "", fmt.Errorf("unsupported audio format %q", mimeType)
	}
	return s.transcribeWithRotation(audio, extension, strings.TrimSpace(language))
}

func (s *AIService) transcribeWithRotation(audio []byte, extension, language string) (string, error) {
	keys := s.getGroqKeys()
	if len(keys) == 0 {
		return "", errors.New("GROQ_API_KEY is not configured")
	}
	attempts, releaseAt := nextProviderAttempts(&s.keyHealth, "groq", keys, &s.groqKeyIndex)
	if len(attempts) == 0 {
		return "", allKeysRateLimitedError("Groq transcribe", len(keys), releaseAt)
	}

	var lastErr error
	for _, attempt := range attempts {
		text, err := executeTranscribeGroq(audio, extension, language, attempt.Key)
		if err == nil {
			s.keyHealth.clear("groq", attempt.Index)
			return text, nil
		}
		lastErr = err
		if errors.Is(err, errModelUnavailable) {
			aiStage("error", "Groq transcribe: %v — skipping remaining keys", err)
			return "", err
		}
		if errors.Is(err, errRateLimit) {
			wait := retryAfterOf(err)
			s.keyHealth.park("groq", attempt.Index, time.Now().Add(wait))
			aiStage("warn", "Groq transcribe key %d/%d rate limited → parked for %s", attempt.Position, attempt.Total, wait.Round(time.Second))
			continue
		}
		aiStage("warn", "Groq transcribe key %d/%d failed: %v → rotating", attempt.Position, attempt.Total, err)
	}
	if errors.Is(lastErr, errRateLimit) {
		return "", allKeysRateLimitedError("Groq transcribe", len(keys), s.keyHealth.earliestRelease("groq", len(keys)))
	}
	return "", lastErr
}

func executeTranscribeGroq(audio []byte, extension, language, apiKey string) (string, error) {
	model := transcribeModelName()

	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, err := form.CreateFormFile("file", "note."+extension)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(audio); err != nil {
		return "", err
	}
	fields := map[string]string{"model": model, "response_format": "json", "temperature": "0"}
	if language != "" {
		fields["language"] = language
	}
	for name, value := range fields {
		if err := form.WriteField(name, value); err != nil {
			return "", err
		}
	}
	if err := form.Close(); err != nil {
		return "", err
	}

	request, err := http.NewRequest(http.MethodPost, "https://api.groq.com/openai/v1/audio/transcriptions", &body)
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", form.FormDataContentType())

	client := &http.Client{Timeout: 60 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	if err := classifyProviderResponse("Groq", "transcribe", model, response); err != nil {
		return "", err
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return "", err
	}
	var parsed struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("groq transcribe: unreadable response: %w", err)
	}
	text := strings.TrimSpace(parsed.Text)
	if text == "" {
		return "", errors.New("ไม่ได้ยินเสียงพูดในคลิปนี้")
	}
	return text, nil
}
