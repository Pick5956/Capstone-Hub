package service

import "testing"

// Only a page the handbook lists becomes a button; the label is the
// handbook's, in the owner's language; a trailing slash is not a different page.
func TestSystemDocsRouteChecksThePathAgainstTheHandbook(t *testing.T) {
	route, ok := systemDocsRoute("/menu/", "th")
	if !ok || route.Href != "/menu" || route.Label == "" || route.Label == "/menu" {
		t.Fatalf("route = %+v ok = %v", route, ok)
	}
	if en, _ := systemDocsRoute("/menu", "en"); en == nil || en.Label == route.Label {
		t.Fatalf("english label should differ: %+v vs %+v", en, route)
	}
	if _, ok := systemDocsRoute("/nowhere", "th"); ok {
		t.Fatal("a path the handbook does not have must not become a button")
	}
	if _, ok := systemDocsRoute("", "th"); ok {
		t.Fatal("an empty path must not become a button")
	}
}
