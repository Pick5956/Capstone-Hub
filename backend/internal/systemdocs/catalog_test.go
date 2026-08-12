package systemdocs

import "testing"

func TestEmbeddedCatalogLoadsAsValidatedPublicBilingualContent(t *testing.T) {
	t.Parallel()

	catalog, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(catalog.Articles) == 0 {
		t.Fatal("catalog has no articles")
	}
	for _, article := range catalog.Articles {
		if article.Title.TH == "" || article.Title.EN == "" || len(article.Sections) == 0 {
			t.Fatalf("incomplete bilingual article: %+v", article)
		}
	}
}

func TestPublicCatalogValidationRejectsURLsPrivateAddressesAndSecretAssignments(t *testing.T) {
	t.Parallel()

	for _, value := range []string{
		"https://internal.example.invalid/path",
		"postgres://user:password@host/database",
		"service is on localhost",
		"private host 10.20.30.40",
		"private host 192.168.1.10",
		"API key: example-value",
		"access_token=example-value",
		"Authorization: Bearer example-value",
	} {
		if err := validatePublicText("fixture", value); err == nil {
			t.Fatalf("accepted unsafe public-doc content %q", value)
		}
	}

	if err := validatePublicText("fixture", "If you forget your password, start password reset from the sign-in dialog."); err != nil {
		t.Fatalf("rejected safe public help text: %v", err)
	}
	if err := validatePublicText("fixture", "A sample amount can be 10.00 baht without being a private address."); err != nil {
		t.Fatalf("rejected safe numeric help text: %v", err)
	}
}
