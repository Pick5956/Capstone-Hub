package service

import "testing"

func TestMapTaskToIntentUsesRouterPolicy(t *testing.T) {
	cases := []struct {
		task AITask
		want AIIntent
	}{
		{task: AITaskGeneralChat, want: AIIntentChat},
		{task: AITaskScopeQuestion, want: AIIntentCapability},
		{task: AITaskRestaurantContent, want: AIIntentChat},
		{task: AITaskUnclear, want: AIIntentUnclear},
		{task: AITaskOutOfScope, want: AIIntentOutOfScope},
		{task: AITaskRiskyAction, want: AIIntentAnalysis},
		{task: AITask("restaurant_data"), want: AIIntentAnalysis},
	}

	for _, tc := range cases {
		if got := mapTaskToIntent(tc.task); got != tc.want {
			t.Fatalf("mapTaskToIntent(%q) = %q, want %q", tc.task, got, tc.want)
		}
	}
}

func TestRouterUnknownTaskFallsBackToAnalyticalPolicy(t *testing.T) {
	if got := mapTaskToIntent(AITask("unexpected")); got != AIIntentAnalysis {
		t.Fatalf("mapTaskToIntent(unexpected) = %q, want safe analysis fallback", got)
	}
}
