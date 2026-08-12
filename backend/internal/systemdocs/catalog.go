package systemdocs

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"sync"
)

//go:embed catalog.json
var embeddedCatalog []byte

var (
	loadCatalogOnce         sync.Once
	loadedCatalog           *Catalog
	loadCatalogErr          error
	safeIDPattern           = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	secretAssignmentPattern = regexp.MustCompile(`(?i)(?:api[_ -]?key|client[_ -]?secret|jwt[_ -]?secret|access[_ -]?token|refresh[_ -]?token|authorization|bearer)\s*[:=]\s*\S+`)
	privateIPv4Pattern      = regexp.MustCompile(`(?:^|[^0-9])(?:(?:10|127)(?:\.[0-9]{1,3}){3}|192\.168(?:\.[0-9]{1,3}){2}|172\.(?:1[6-9]|2[0-9]|3[01])(?:\.[0-9]{1,3}){2})(?:[^0-9]|$)`)
)

// LocalizedText is public documentation copy in the two languages supported
// by Dishy. Both variants are required so retrieval never has to invent a
// translation.
type LocalizedText struct {
	TH string `json:"th"`
	EN string `json:"en"`
}

func (text LocalizedText) ForLanguage(language string) string {
	if language == "en" {
		return text.EN
	}
	return text.TH
}

type Group struct {
	ID    string        `json:"id"`
	Title LocalizedText `json:"title"`
}

type Route struct {
	Href  string        `json:"href"`
	Label LocalizedText `json:"label"`
}

type Step struct {
	Title LocalizedText `json:"title"`
	Body  LocalizedText `json:"body"`
}

type Note struct {
	Tone  string        `json:"tone"`
	Title LocalizedText `json:"title"`
	Body  LocalizedText `json:"body"`
}

type Section struct {
	ID         string          `json:"id"`
	Title      LocalizedText   `json:"title"`
	Keywords   Keywords        `json:"keywords,omitempty"`
	Paragraphs []LocalizedText `json:"paragraphs,omitempty"`
	Bullets    []LocalizedText `json:"bullets,omitempty"`
	Steps      []Step          `json:"steps,omitempty"`
	Note       *Note           `json:"note,omitempty"`
}

type Keywords struct {
	TH []string `json:"th"`
	EN []string `json:"en"`
}

func (keywords Keywords) ForLanguage(language string) []string {
	if language == "en" {
		return keywords.EN
	}
	return keywords.TH
}

type Article struct {
	Slug     string        `json:"slug"`
	GroupID  string        `json:"groupId"`
	Title    LocalizedText `json:"title"`
	Summary  LocalizedText `json:"summary"`
	Audience LocalizedText `json:"audience"`
	Keywords Keywords      `json:"keywords"`
	Routes   []Route       `json:"routes"`
	Sections []Section     `json:"sections"`
}

type Catalog struct {
	Groups   []Group   `json:"groups"`
	Articles []Article `json:"articles"`
}

// Load returns the validated embedded public documentation catalog. The
// catalog is parsed once; callers cannot provide a filesystem path or URL.
func Load() (*Catalog, error) {
	loadCatalogOnce.Do(func() {
		decoder := json.NewDecoder(bytes.NewReader(embeddedCatalog))
		decoder.DisallowUnknownFields()

		var catalog Catalog
		if err := decoder.Decode(&catalog); err != nil {
			loadCatalogErr = fmt.Errorf("decode embedded system docs catalog: %w", err)
			return
		}
		if err := ensureJSONEOF(decoder); err != nil {
			loadCatalogErr = err
			return
		}
		if err := validateCatalog(&catalog); err != nil {
			loadCatalogErr = fmt.Errorf("validate embedded system docs catalog: %w", err)
			return
		}
		loadedCatalog = &catalog
	})
	return loadedCatalog, loadCatalogErr
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err == io.EOF {
		return nil
	} else if err != nil {
		return fmt.Errorf("decode embedded system docs catalog trailer: %w", err)
	}
	return errors.New("embedded system docs catalog contains multiple JSON values")
}

func validateCatalog(catalog *Catalog) error {
	if len(catalog.Groups) == 0 || len(catalog.Articles) == 0 {
		return errors.New("catalog must contain groups and articles")
	}

	groups := make(map[string]struct{}, len(catalog.Groups))
	for _, group := range catalog.Groups {
		if err := validateID("group id", group.ID); err != nil {
			return err
		}
		if _, exists := groups[group.ID]; exists {
			return fmt.Errorf("duplicate group id %q", group.ID)
		}
		groups[group.ID] = struct{}{}
		if err := validateLocalized("group title", group.Title); err != nil {
			return err
		}
	}

	articles := make(map[string]struct{}, len(catalog.Articles))
	for _, article := range catalog.Articles {
		if err := validateID("article slug", article.Slug); err != nil {
			return err
		}
		if _, exists := articles[article.Slug]; exists {
			return fmt.Errorf("duplicate article slug %q", article.Slug)
		}
		articles[article.Slug] = struct{}{}
		if _, exists := groups[article.GroupID]; !exists {
			return fmt.Errorf("article %q references unknown group %q", article.Slug, article.GroupID)
		}
		for label, value := range map[string]LocalizedText{
			"article title":    article.Title,
			"article summary":  article.Summary,
			"article audience": article.Audience,
		} {
			if err := validateLocalized(label, value); err != nil {
				return fmt.Errorf("article %q: %w", article.Slug, err)
			}
		}
		if len(article.Keywords.TH) == 0 || len(article.Keywords.EN) == 0 {
			return fmt.Errorf("article %q must have Thai and English keywords", article.Slug)
		}
		for _, keyword := range append(append([]string{}, article.Keywords.TH...), article.Keywords.EN...) {
			if err := validatePublicText("article keyword", keyword); err != nil {
				return fmt.Errorf("article %q: %w", article.Slug, err)
			}
		}
		for _, route := range article.Routes {
			if !isSafePublicRoute(route.Href) {
				return fmt.Errorf("article %q contains unsafe route", article.Slug)
			}
			if err := validateLocalized("route label", route.Label); err != nil {
				return fmt.Errorf("article %q: %w", article.Slug, err)
			}
		}
		if err := validateSections(article); err != nil {
			return err
		}
	}
	return nil
}

func validateSections(article Article) error {
	if len(article.Sections) == 0 {
		return fmt.Errorf("article %q must contain sections", article.Slug)
	}
	sections := make(map[string]struct{}, len(article.Sections))
	for _, section := range article.Sections {
		if err := validateID("section id", section.ID); err != nil {
			return fmt.Errorf("article %q: %w", article.Slug, err)
		}
		if _, exists := sections[section.ID]; exists {
			return fmt.Errorf("article %q has duplicate section id %q", article.Slug, section.ID)
		}
		sections[section.ID] = struct{}{}
		if err := validateLocalized("section title", section.Title); err != nil {
			return fmt.Errorf("article %q section %q: %w", article.Slug, section.ID, err)
		}
		if len(section.Keywords.TH) > 0 || len(section.Keywords.EN) > 0 {
			if len(section.Keywords.TH) == 0 || len(section.Keywords.EN) == 0 {
				return fmt.Errorf("article %q section %q must have both Thai and English keywords", article.Slug, section.ID)
			}
			for _, keyword := range append(append([]string{}, section.Keywords.TH...), section.Keywords.EN...) {
				if err := validatePublicText("section keyword", keyword); err != nil {
					return fmt.Errorf("article %q section %q: %w", article.Slug, section.ID, err)
				}
			}
		}
		if len(section.Paragraphs)+len(section.Bullets)+len(section.Steps) == 0 && section.Note == nil {
			return fmt.Errorf("article %q section %q has no content", article.Slug, section.ID)
		}
		for _, paragraph := range section.Paragraphs {
			if err := validateLocalized("paragraph", paragraph); err != nil {
				return fmt.Errorf("article %q section %q: %w", article.Slug, section.ID, err)
			}
		}
		for _, bullet := range section.Bullets {
			if err := validateLocalized("bullet", bullet); err != nil {
				return fmt.Errorf("article %q section %q: %w", article.Slug, section.ID, err)
			}
		}
		for _, step := range section.Steps {
			if err := validateLocalized("step title", step.Title); err != nil {
				return fmt.Errorf("article %q section %q: %w", article.Slug, section.ID, err)
			}
			if err := validateLocalized("step body", step.Body); err != nil {
				return fmt.Errorf("article %q section %q: %w", article.Slug, section.ID, err)
			}
		}
		if section.Note != nil {
			if err := validateLocalized("note title", section.Note.Title); err != nil {
				return fmt.Errorf("article %q section %q: %w", article.Slug, section.ID, err)
			}
			if err := validateLocalized("note body", section.Note.Body); err != nil {
				return fmt.Errorf("article %q section %q: %w", article.Slug, section.ID, err)
			}
		}
	}
	return nil
}

func validateID(label, value string) error {
	if !safeIDPattern.MatchString(value) {
		return fmt.Errorf("%s %q is invalid", label, value)
	}
	return nil
}

func validateLocalized(label string, value LocalizedText) error {
	if strings.TrimSpace(value.TH) == "" || strings.TrimSpace(value.EN) == "" {
		return fmt.Errorf("%s must contain Thai and English text", label)
	}
	if err := validatePublicText(label, value.TH); err != nil {
		return err
	}
	return validatePublicText(label, value.EN)
}

func validatePublicText(label, value string) error {
	lower := strings.ToLower(value)
	for _, forbidden := range []string{
		"://", "localhost",
		"api_key=", "apikey=", "client_secret=", "jwt_secret=", "authorization:", "bearer ",
	} {
		if strings.Contains(lower, forbidden) {
			return fmt.Errorf("%s contains non-public or secret-shaped content", label)
		}
	}
	if secretAssignmentPattern.MatchString(value) || privateIPv4Pattern.MatchString(value) {
		return fmt.Errorf("%s contains non-public or secret-shaped content", label)
	}
	return nil
}

func isSafePublicRoute(href string) bool {
	return strings.HasPrefix(href, "/") &&
		!strings.HasPrefix(href, "//") &&
		!strings.Contains(href, "\\") &&
		!strings.Contains(href, "..") &&
		!strings.ContainsAny(href, "?#")
}
