package seed

import (
	"testing"

	"gorm.io/gorm/clause"
)

func TestSystemRoleConflictClauseTargetsPartialSystemRoleIndex(t *testing.T) {
	conflict := systemRoleConflictClause()
	if len(conflict.Columns) != 1 || conflict.Columns[0].Name != "name" {
		t.Fatalf("conflict columns = %#v, want name", conflict.Columns)
	}
	if len(conflict.TargetWhere.Exprs) != 1 {
		t.Fatalf("target predicates = %#v, want one", conflict.TargetWhere.Exprs)
	}
	expr, ok := conflict.TargetWhere.Exprs[0].(clause.Expr)
	if !ok {
		t.Fatalf("target predicate type = %T, want clause.Expr", conflict.TargetWhere.Exprs[0])
	}
	if expr.SQL != "restaurant_id IS NULL AND deleted_at IS NULL" {
		t.Fatalf("target predicate = %q", expr.SQL)
	}
}
