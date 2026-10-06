#!/usr/bin/env bash
# Decide whether a commit may supply migration files to the production apply,
# and record how it was reviewed. production-apply-migrations.yml runs it
# twice: in the overlay step, before any file is taken from the commit, and
# again immediately before the production write, so a pull request that moved
# on, closed, went back to draft or received a changes-requested review in
# between is refused with nothing applied.
#
# Usage: production-ref-provenance.sh <current-main-sha> <commit-sha>
#   Needs GH_TOKEN and GITHUB_REPOSITORY, as GitHub Actions provides them.
#   Prints two lines when the commit qualifies:
#     provenance=<how it qualifies, including the latest review per reviewer>
#     pr_number=<the pull request number, or empty when the commit is on main>
#   and exits 1 with one ::error:: line when it does not.
#
# A commit qualifies when it is on main (identical to, or behind, the given
# main SHA), or when it is the current head of exactly one open, non-draft
# pull request into main on which no reviewer's latest review requests
# changes (two open pull requests sharing a head are refused). Reviews are
# judged per reviewer across the whole pull request, as GitHub counts them: a
# changes request stays outstanding across later pushes until that reviewer
# approves or it is dismissed. Each reviewer's latest review is recorded with
# the commit it was given on, so the environment approver can see whether an
# approval predates the head. A review list of 100 or more is refused rather
# than judged truncated.
set -euo pipefail

usage="usage: production-ref-provenance.sh <current-main-sha> <commit-sha>"
main_sha="${1:?$usage}"
ref="${2:?$usage}"
if [[ ! "$main_sha" =~ ^[0-9a-f]{40}$ ]] || [[ ! "$ref" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::Both arguments must be full 40-character lower-case commit SHAs."
  exit 1
fi
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"

compare="$(gh api "repos/$GITHUB_REPOSITORY/compare/$main_sha...$ref" --jq '.status')"
if [ "$compare" = "identical" ] || [ "$compare" = "behind" ]; then
  echo "provenance=already on main ($compare)"
  echo "pr_number="
  exit 0
fi

# Only a pull request from a branch of this repository, opened by a person,
# qualifies: a fork's or a bot's pull request receives no repository secrets,
# so the migrations-applied check could not look up what was applied from
# it, and production must never run SQL it cannot later hold a merge to.
# And exactly one: when two open pull requests share this head, the apply
# would be recorded against one of them, and the other could later drop the
# migration and merge with nothing in the ledger naming it.
pr_numbers="$(gh api "repos/$GITHUB_REPOSITORY/commits/$ref/pulls" |
  jq -r --arg sha "$ref" --arg repo "$GITHUB_REPOSITORY" '[.[] | select(.state == "open" and .base.ref == "main" and .head.sha == $sha and .draft == false and .head.repo.full_name == $repo and .user.type != "Bot") | .number] | unique | map(tostring) | join(" ")')"
if [ -z "$pr_numbers" ]; then
  echo "::error::Commit $ref is neither on main nor the current head of an open, non-draft pull request into main from a branch of this repository opened by a person (compare status: $compare). Dispatch with the reviewed pull request's present head."
  exit 1
fi
if [ "$(wc -w <<< "$pr_numbers" | tr -d ' ')" != "1" ]; then
  echo "::error::Commit $ref is the current head of more than one open pull request into main (#${pr_numbers// / and #}); the apply would be recorded against only one of them, and the other's merge gate could not hold it to what was applied. Close or re-point one of them, or dispatch once their heads differ."
  exit 1
fi
pr_number="$pr_numbers"

reviews_json="$(gh api "repos/$GITHUB_REPOSITORY/pulls/$pr_number/reviews?per_page=100")"
if [ "$(printf '%s' "$reviews_json" | jq 'length')" -ge 100 ]; then
  echo "::error::Pull request #$pr_number has 100 or more reviews; refusing to judge a truncated list."
  exit 1
fi
reviews="$(printf '%s' "$reviews_json" |
  jq -r '[.[] | select(.state == "APPROVED" or .state == "CHANGES_REQUESTED" or .state == "DISMISSED")] | group_by(.user.login) | map(max_by(.submitted_at)) | map(select(.state != "DISMISSED")) | map("\(.user.login)=\(.state)@\(.commit_id[0:7])") | join(" ")')"
if printf '%s' "$reviews" | grep -q '=CHANGES_REQUESTED'; then
  echo "::error::Pull request #$pr_number has an outstanding changes-requested review (latest review per reviewer: $reviews); that reviewer must approve, or the review be dismissed, before production applies this head."
  exit 1
fi

echo "provenance=current head of open pull request #$pr_number; latest review per reviewer: ${reviews:-none}"
echo "pr_number=$pr_number"
