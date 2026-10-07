#!/usr/bin/env bash
# Run inside an upstream market checkout after preparing the selected entry.
set -euo pipefail
: "${RELEASE_TAG:?}" "${PLUGIN:?}" "${PLUGIN_ID:?}" "${GH_TOKEN:?}"
upstream=MayDay-wpf/snow-plugin-store
fork=BaSui01/snow-plugin-store
branch="release/$RELEASE_TAG"
head="BaSui01:$branch"
entry="app/plugins/$PLUGIN_ID.json"
existing=$(gh pr list --repo "$upstream" --head "$branch" --author BaSui01 --state all --limit 100 --json number --jq '.[0].number // empty')
compare_entry() {
  python - "$1" "$entry" <<'PY'
import json, sys
from pathlib import Path
if json.loads(Path(sys.argv[1]).read_text()) != json.loads(Path(sys.argv[2]).read_text()):
    raise SystemExit("Existing market entry differs from the expected published asset; manual review required")
PY
}
if [[ -n "$existing" ]]; then
  state=$(gh pr view "$existing" --repo "$upstream" --json state --jq .state)
  url=$(gh pr view "$existing" --repo "$upstream" --json url --jq .url)
  case "$state" in
    OPEN) echo "Existing open PR: $url"; exit 0 ;;
    MERGED)
      actual=$(mktemp)
      git show "HEAD:$entry" > "$actual"
      compare_entry "$actual"
      echo "Merged PR and market entry verified: $url"
      exit 0 ;;
    CLOSED) echo "::error::PR was closed without merge; not published to market: $url"; exit 1 ;;
    *) echo '::error::Unknown PR state'; exit 1 ;;
  esac
fi
# Auto-supersede previous pending open PRs for the same plugin:
while read -r pr_num; do
  [[ -z "$pr_num" ]] && continue
  echo "Superseding previous market PR #$pr_num in favor of $RELEASE_TAG..."
  gh pr close "$pr_num" --repo "$upstream" \
    --comment "Superseded by release \`$RELEASE_TAG\`. A new market pull request is being opened with the updated release asset." || true
done < <(gh pr list --repo "$upstream" --state open --limit 1000 \
  --json number,headRefName,headRepositoryOwner \
  --jq '.[] | select(.headRepositoryOwner.login == "BaSui01" and (.headRefName | startswith("release/'"$PLUGIN"'/v"))) | "\(.number)"')
if git diff --quiet -- "$entry"; then
  echo 'Market already points to this release asset.'
  exit 0
fi
git remote add author-fork "https://github.com/$fork.git"
gh auth setup-git
remote_ref=$(git ls-remote author-fork "refs/heads/$branch")
if [[ -n "$remote_ref" ]]; then
  # Recover push-success / PR-failure without overwriting the existing branch.
  git fetch --no-tags --depth=50 author-fork "refs/heads/$branch"
  git merge-base HEAD FETCH_HEAD >/dev/null || { echo '::error::Cannot establish existing branch ancestry; manual review required'; exit 1; }
  changed=$(git diff --name-only HEAD...FETCH_HEAD)
  [[ "$changed" == "$entry" ]] || { echo '::error::Existing branch has unexpected changes; no overwrite'; exit 1; }
  actual=$(mktemp)
  git show "FETCH_HEAD:$entry" > "$actual"
  compare_entry "$actual"
  echo 'Verified existing fork branch; reusing without push.'
else
  git config user.name 'snow-plugins release bot'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  git switch -c "$branch"
  git add "$entry"
  [[ "$(git diff --cached --name-only)" == "$entry" ]] || { echo '::error::Unexpected staged files'; exit 1; }
  git commit -m "chore(market): update $RELEASE_TAG"
  git push author-fork "HEAD:refs/heads/$branch"
fi
gh pr create --repo "$upstream" --base main --head "$head" \
  --title "chore(market): update $RELEASE_TAG" \
  --body "Updates only $PLUGIN_ID to $RELEASE_TAG. SHA-256 comes from verified published bytes. Explicit market.json host requirements are applied, never lowered automatically. See https://github.com/BaSui01/snow-plugins/releases/tag/$RELEASE_TAG for changes and optional feature limits. Maintainer review required; never auto-merged."
